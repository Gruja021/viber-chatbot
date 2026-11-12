import { logger } from '../../../config/logger';
import { dataRetentionService } from '../data-retention.service';
import { startDataRetentionScheduler, stopDataRetentionScheduler } from '../data-retention.scheduler';

jest.mock('../data-retention.service', () => ({
  dataRetentionService: {
    runCleanup: jest.fn().mockResolvedValue({
      messagesDeleted: 0,
      conversationsDeleted: 0,
      redisKeysDeleted: 0,
      durationMs: 10,
    }),
  },
}));

describe('data-retention.scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    stopDataRetentionScheduler();
  });

  afterEach(() => {
    stopDataRetentionScheduler();
    jest.useRealTimers();
  });

  it('logs start message when started', () => {
    startDataRetentionScheduler();
    expect(logger.info).toHaveBeenCalledWith('Data retention scheduler started');
  });

  it('logs stop message when stopped', () => {
    startDataRetentionScheduler();
    jest.clearAllMocks();
    stopDataRetentionScheduler();
    expect(logger.info).toHaveBeenCalledWith('Data retention scheduler stopped');
  });

  it('does not run cleanup outside 3 AM UTC', () => {
    jest.setSystemTime(new Date('2026-11-09T10:00:00Z')); // 10 AM UTC
    startDataRetentionScheduler();

    jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour

    expect(dataRetentionService.runCleanup).not.toHaveBeenCalled();
  });

  it('runs cleanup at 3 AM UTC', () => {
    jest.setSystemTime(new Date('2026-11-09T02:00:00Z')); // 2 AM UTC
    startDataRetentionScheduler();

    // Advance to 3 AM UTC
    jest.advanceTimersByTime(60 * 60 * 1000);

    expect(dataRetentionService.runCleanup).toHaveBeenCalledTimes(1);
  });

  it('does not start duplicate schedulers', () => {
    startDataRetentionScheduler();
    startDataRetentionScheduler(); // duplicate call

    expect(logger.info).toHaveBeenCalledTimes(1); // only one start log
  });

  it('handles cleanup errors gracefully', async () => {
    const error = new Error('DB connection lost');
    (dataRetentionService.runCleanup as jest.Mock).mockRejectedValueOnce(error);

    jest.setSystemTime(new Date('2026-11-09T02:00:00Z'));
    startDataRetentionScheduler();

    jest.advanceTimersByTime(60 * 60 * 1000);

    // Let the promise settle
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Data retention cleanup failed');
  });

  it('skips if cleanup is already running', async () => {
    // Create a long-running cleanup
    let resolveCleanup: () => void;
    const cleanupPromise = new Promise<void>(resolve => { resolveCleanup = resolve; });
    (dataRetentionService.runCleanup as jest.Mock).mockReturnValueOnce(cleanupPromise);

    // Start at 2 AM, first tick at 3 AM triggers cleanup
    jest.setSystemTime(new Date('2026-11-09T02:00:00Z'));
    startDataRetentionScheduler();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(dataRetentionService.runCleanup).toHaveBeenCalledTimes(1);

    // Reset system time to 2 AM so next tick (after +1hr) lands on 3 AM again
    jest.setSystemTime(new Date('2026-11-10T02:00:00Z'));
    jest.advanceTimersByTime(60 * 60 * 1000);

    // Second tick should be skipped because first is still running
    expect(dataRetentionService.runCleanup).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('Data retention cleanup already running, skipping');

    // Resolve the first cleanup
    resolveCleanup!();
    await Promise.resolve();
  });

  it('does nothing when stopping without starting', () => {
    stopDataRetentionScheduler();
    // Should not throw or log stop message
    expect(logger.info).not.toHaveBeenCalledWith('Data retention scheduler stopped');
  });

  it('can restart after stopping', () => {
    startDataRetentionScheduler();
    stopDataRetentionScheduler();
    jest.clearAllMocks();

    startDataRetentionScheduler();
    expect(logger.info).toHaveBeenCalledWith('Data retention scheduler started');

    // Verify it works: set time to 2 AM, advance to 3 AM
    jest.setSystemTime(new Date('2026-11-09T02:00:00Z'));
    jest.advanceTimersByTime(60 * 60 * 1000);

    expect(dataRetentionService.runCleanup).toHaveBeenCalledTimes(1);
  });

  it('does not run cleanup when multiple hours pass without hitting 3 AM', () => {
    jest.setSystemTime(new Date('2026-11-09T04:00:00Z')); // 4 AM UTC
    startDataRetentionScheduler();

    // Advance 5 hours (4 AM → 5 → 6 → 7 → 8 → 9 AM)
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(60 * 60 * 1000);
    }

    expect(dataRetentionService.runCleanup).not.toHaveBeenCalled();
  });

  it('resets isRunning flag after successful cleanup allowing next run', async () => {
    jest.setSystemTime(new Date('2026-11-09T02:00:00Z'));
    startDataRetentionScheduler();

    // First tick triggers cleanup at 3 AM
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(dataRetentionService.runCleanup).toHaveBeenCalledTimes(1);

    // Let the cleanup promise resolve
    await Promise.resolve();

    // Reset system time so next tick also lands on 3 AM
    jest.setSystemTime(new Date('2026-11-10T02:00:00Z'));
    jest.advanceTimersByTime(60 * 60 * 1000);

    // Second run should happen because isRunning was reset
    expect(dataRetentionService.runCleanup).toHaveBeenCalledTimes(2);
  });

  it('resets isRunning flag after failed cleanup allowing next run', async () => {
    const error = new Error('DB error');
    (dataRetentionService.runCleanup as jest.Mock)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        messagesDeleted: 0,
        conversationsDeleted: 0,
        redisKeysDeleted: 0,
        durationMs: 5,
      });

    jest.setSystemTime(new Date('2026-11-09T02:00:00Z'));
    startDataRetentionScheduler();

    // First tick — fails
    jest.advanceTimersByTime(60 * 60 * 1000);
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Data retention cleanup failed');

    // Reset time for next 3 AM
    jest.setSystemTime(new Date('2026-11-10T02:00:00Z'));
    jest.advanceTimersByTime(60 * 60 * 1000);

    // Second run should work — isRunning was reset in finally block
    expect(dataRetentionService.runCleanup).toHaveBeenCalledTimes(2);
  });

  it('uses 1 hour interval between checks', () => {
    jest.setSystemTime(new Date('2026-11-09T05:00:00Z')); // 5 AM UTC
    startDataRetentionScheduler();

    // 30 minutes should NOT trigger any tick (interval is 1 hour)
    jest.advanceTimersByTime(30 * 60 * 1000);
    expect(dataRetentionService.runCleanup).not.toHaveBeenCalled();

    // Another 30 minutes (total 1 hour) triggers tick — but time is 6 AM, not 3 AM
    jest.advanceTimersByTime(30 * 60 * 1000);
    expect(dataRetentionService.runCleanup).not.toHaveBeenCalled();
  });
});

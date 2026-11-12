import { logger } from '../../config/logger';
import { dataRetentionService } from './data-retention.service';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const TARGET_HOUR_UTC = 3; // 3 AM UTC

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  const now = new Date();
  if (now.getUTCHours() !== TARGET_HOUR_UTC) return;
  if (isRunning) {
    logger.warn('Data retention cleanup already running, skipping');
    return;
  }

  isRunning = true;
  try {
    await dataRetentionService.runCleanup();
  } catch (err) {
    logger.error({ err }, 'Data retention cleanup failed');
  } finally {
    isRunning = false;
  }
}

export function startDataRetentionScheduler(): void {
  if (intervalId) return;
  intervalId = setInterval(tick, CHECK_INTERVAL_MS);
  logger.info('Data retention scheduler started');
}

export function stopDataRetentionScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Data retention scheduler stopped');
  }
}

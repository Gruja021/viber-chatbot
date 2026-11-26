import { logger } from '../../config/logger';
import { aiCreditsRepository } from './ai-credits.repository';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const TARGET_DAY = 1; // 1st of month
const TARGET_HOUR_UTC = 1; // 1 AM UTC

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  const now = new Date();
  if (now.getUTCDate() !== TARGET_DAY || now.getUTCHours() !== TARGET_HOUR_UTC) return;
  if (isRunning) {
    logger.warn('Credit reset already running, skipping');
    return;
  }

  isRunning = true;
  try {
    const count = await aiCreditsRepository.resetMonthlyCredits();
    logger.info({ tenantsReset: count }, 'Monthly credit reset completed');
  } catch (err) {
    logger.error({ err }, 'Monthly credit reset failed');
  } finally {
    isRunning = false;
  }
}

export function startCreditResetScheduler(): void {
  if (intervalId) return;
  intervalId = setInterval(tick, CHECK_INTERVAL_MS);
  logger.info('Credit reset scheduler started');
}

export function stopCreditResetScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Credit reset scheduler stopped');
  }
}

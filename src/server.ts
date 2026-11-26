import { env } from './config/env';
import { logger } from './config/logger';
import { app } from './app';
import { pool } from './config/database';
import { redis } from './config/redis';
import { startAgentTimeoutListener, stopAgentTimeoutListener } from './modules/agent-timeout/agent-timeout.listener';
import { startDataRetentionScheduler, stopDataRetentionScheduler } from './modules/data-retention/data-retention.scheduler';
import { startCreditResetScheduler, stopCreditResetScheduler } from './modules/ai-credits/ai-credits.scheduler';

async function start() {
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
  });

  // Start agent timeout listener for Redis keyspace events
  await startAgentTimeoutListener();

  // Start data retention scheduler (checks hourly, runs cleanup at 3 AM UTC)
  startDataRetentionScheduler();

  // Start credit reset scheduler (checks hourly, resets on 1st of month at 1 AM UTC)
  startCreditResetScheduler();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully');
    server.close(async () => {
      stopAgentTimeoutListener();
      stopDataRetentionScheduler();
      stopCreditResetScheduler();
      await pool.end();
      redis.disconnect();
      logger.info('Server stopped');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});

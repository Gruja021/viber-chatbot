import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { errorHandler } from './middleware/error-handler';
import { webhookRateLimiter, apiRateLimiter } from './middleware/rate-limiter';
import { tenantRoutes } from './modules/tenant/tenant.routes';
import { webhookRoutes } from './modules/webhook/webhook.routes';
import { chatwootWebhookRoutes } from './modules/chatwoot/chatwoot.webhook.routes';
import { telegramRoutes } from './modules/webhook/telegram.routes';
import { checkDatabaseConnection } from './config/database';
import { checkRedisConnection } from './config/redis';

const app = express();

app.use(helmet());
app.use(cors());

// Raw body capture for Viber signature verification — must come before express.json()
app.use('/api/viber', express.json({
  verify: (req: express.Request, _res, buf) => {
    req.rawBody = buf;
  },
}));

app.use(express.json());

// Health check
app.get('/health', async (_req, res) => {
  const [db, redisOk] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
  ]);
  const healthy = db && redisOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    database: db ? 'connected' : 'disconnected',
    redis: redisOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/tenants', apiRateLimiter, tenantRoutes);
app.use('/api/viber/webhook', webhookRateLimiter);
app.use('/api/viber', webhookRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/chatwoot', chatwootWebhookRoutes);

// Global error handler
app.use(errorHandler);

export { app };

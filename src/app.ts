import crypto from 'crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { webhookRateLimiter, apiRateLimiter } from './middleware/rate-limiter';
import { tenantRoutes } from './modules/tenant/tenant.routes';
import { connectorRoutes } from './modules/connector/connector.routes';
import { webhookRoutes } from './modules/webhook/webhook.routes';
import { chatwootWebhookRoutes } from './modules/chatwoot/chatwoot.webhook.routes';
import { telegramRoutes } from './modules/webhook/telegram.routes';
import { checkDatabaseConnection } from './config/database';
import { checkRedisConnection } from './config/redis';

const app = express();

app.use(helmet());

// CORS — read allowed origins from env variable
const corsOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

// Raw body capture for Viber signature verification — must come before express.json()
app.use('/api/viber', express.json({
  limit: '100kb',
  verify: (req: express.Request, _res, buf) => {
    req.rawBody = buf;
  },
}));

// Explicit body size limit
app.use(express.json({ limit: '100kb' }));

// Health check — public endpoint returns only status; details require admin auth
app.get('/health', async (req, res) => {
  const [db, redisOk] = await Promise.all([
    checkDatabaseConnection(),
    checkRedisConnection(),
  ]);
  const healthy = db && redisOk;

  // Check if admin token is provided for detailed response
  const token = req.headers.authorization?.replace('Bearer ', '');
  const isAdmin = token && token.length === env.ADMIN_API_TOKEN.length
    && crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(env.ADMIN_API_TOKEN, 'utf8'));

  if (isAdmin) {
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      database: db ? 'connected' : 'disconnected',
      redis: redisOk ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
    });
  }
});

// Routes
app.use('/api/tenants', apiRateLimiter, tenantRoutes);
app.use('/api/tenants/:id/connectors', apiRateLimiter, connectorRoutes);
app.use('/api/viber/webhook', webhookRateLimiter);
app.use('/api/viber', webhookRoutes);
app.use('/api/telegram', webhookRateLimiter, telegramRoutes);
app.use('/api/chatwoot', webhookRateLimiter, chatwootWebhookRoutes);

// Global error handler
app.use(errorHandler);

export { app };

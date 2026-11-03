import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis';

export const webhookRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).call(...(args as [string, ...string[]])),
    prefix: 'rate:webhook:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute per tenant slug
  keyGenerator: (req): string => (req.params.tenantSlug as string) || (req.ip as string) || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

export const apiRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).call(...(args as [string, ...string[]])),
    prefix: 'rate:api:',
  }),
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Chatwoot webhook authentication middleware.
 * Verifies the shared secret token sent by Chatwoot in the webhook configuration.
 * If CHATWOOT_WEBHOOK_SECRET is not set, allows all requests (backward compat for dev).
 */
export function chatwootWebhookAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = env.CHATWOOT_WEBHOOK_SECRET;

  // If no secret configured, skip verification (dev mode only)
  if (!secret) {
    if (env.NODE_ENV === 'production') {
      logger.warn('CHATWOOT_WEBHOOK_SECRET not set in production — rejecting webhook');
      res.status(401).json({ error: 'Webhook authentication not configured' });
      return;
    }
    next();
    return;
  }

  // Chatwoot sends the token in the X-Chatwoot-Signature header (HMAC-SHA256 of body)
  // OR we can use a simple shared secret token approach
  const signature = req.headers['x-chatwoot-signature'] as string | undefined;
  const tokenHeader = req.headers['x-chatwoot-webhook-token'] as string | undefined;

  // Method 1: HMAC signature verification (Chatwoot Enterprise)
  if (signature) {
    const rawBody = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      logger.warn('Invalid Chatwoot webhook HMAC signature');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    next();
    return;
  }

  // Method 2: Shared secret token header
  if (tokenHeader) {
    const tokenBuf = Buffer.from(tokenHeader, 'utf8');
    const secretBuf = Buffer.from(secret, 'utf8');

    if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
      logger.warn('Invalid Chatwoot webhook token');
      res.status(401).json({ error: 'Invalid webhook token' });
      return;
    }

    next();
    return;
  }

  // Method 3: Query parameter secret (Chatwoot Community webhook URL with ?secret=...)
  const querySecret = req.query.secret as string | undefined;
  if (querySecret) {
    const queryBuf = Buffer.from(querySecret, 'utf8');
    const secretBuf = Buffer.from(secret, 'utf8');

    if (queryBuf.length !== secretBuf.length || !crypto.timingSafeEqual(queryBuf, secretBuf)) {
      logger.warn('Invalid Chatwoot webhook query secret');
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }

    next();
    return;
  }

  logger.warn('No Chatwoot webhook authentication present');
  res.status(401).json({ error: 'Missing webhook authentication' });
}

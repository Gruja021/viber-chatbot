import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export function viberSignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-viber-content-signature'] as string;
  if (!signature) {
    logger.warn('Missing Viber signature header');
    res.status(403).json({ error: 'Missing signature' });
    return;
  }

  if (!req.tenant) {
    logger.warn('Tenant not resolved before signature check');
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  if (!req.rawBody) {
    logger.warn('Raw body not available for signature verification');
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  if (!req.tenant.viber_auth_token) {
    logger.warn({ tenantSlug: req.tenant.slug }, 'Viber auth token not configured');
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  const expectedSignature = crypto
    .createHmac('sha256', req.tenant.viber_auth_token)
    .update(req.rawBody)
    .digest('hex');

  if (signature !== expectedSignature) {
    logger.warn({ tenantSlug: req.tenant.slug }, 'Invalid Viber signature');
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

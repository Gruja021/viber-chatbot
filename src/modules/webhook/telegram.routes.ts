import { Router, Request, Response, NextFunction } from 'express';
import { tenantResolver } from '../../middleware/tenant-resolver';
import { adminAuth } from '../../middleware/admin-auth';
import { handleTelegramWebhook } from './telegram.controller';
import { telegramService, verifyTelegramWebhookSecret } from './telegram.service';
import { tenantService } from '../tenant/tenant.service';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const router = Router();

// Telegram webhook secret token verification middleware
function telegramSecretAuth(req: Request, res: Response, next: NextFunction): void {
  const tenant = req.tenant;
  if (!tenant?.telegram_bot_token) {
    next();
    return;
  }

  const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
  if (!verifyTelegramWebhookSecret(tenant.telegram_bot_token, secretHeader)) {
    logger.warn({ tenantSlug: tenant.slug }, 'Invalid Telegram webhook secret token');
    res.status(401).json({ error: 'Invalid secret token' });
    return;
  }

  next();
}

// Telegram webhook — parametrized by tenant slug
router.post(
  '/webhook/:tenantSlug',
  tenantResolver,
  telegramSecretAuth,
  handleTelegramWebhook
);

// Register Telegram webhook URL for a tenant (admin only)
router.post('/register-webhook', adminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id } = req.body;
    if (!tenant_id) {
      res.status(400).json({ error: 'tenant_id is required' });
      return;
    }

    const tenant = await tenantService.getById(tenant_id);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    if (!tenant.telegram_bot_token) {
      res.status(400).json({ error: 'Tenant has no telegram_bot_token configured' });
      return;
    }

    const webhookUrl = `${env.WEBHOOK_BASE_URL}/api/telegram/webhook/${tenant.slug}`;
    await telegramService.setWebhook(tenant.telegram_bot_token, webhookUrl);

    res.json({ message: 'Telegram webhook registered', webhook_url: webhookUrl });
  } catch (err) {
    next(err);
  }
});

// Send test message to a Telegram chat (admin only)
router.post('/test-message', adminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenant_id, chat_id } = req.body;
    if (!tenant_id || !chat_id) {
      res.status(400).json({ error: 'tenant_id and chat_id are required' });
      return;
    }

    const tenant = await tenantService.getById(tenant_id);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    if (!tenant.telegram_bot_token) {
      res.status(400).json({ error: 'Tenant has no telegram_bot_token configured' });
      return;
    }

    const botInfo = await telegramService.getMe(tenant.telegram_bot_token);

    await telegramService.sendTextMessage(
      tenant.telegram_bot_token,
      chat_id,
      `Test message from ${tenant.firm_name} bot. Setup is working!`
    );

    res.json({
      message: 'Test message sent',
      bot_username: botInfo.username,
      bot_name: botInfo.first_name,
    });
  } catch (err) {
    next(err);
  }
});

export { router as telegramRoutes };

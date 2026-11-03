import { Router, Request, Response, NextFunction } from 'express';
import { tenantResolver } from '../../middleware/tenant-resolver';
import { viberSignature } from '../../middleware/viber-signature';
import { handleWebhook } from './webhook.controller';
import { viberService } from './viber.service';
import { tenantService } from '../tenant/tenant.service';
import { env } from '../../config/env';

const router = Router();

// Viber webhook — parametrized by tenant slug
router.post(
  '/webhook/:tenantSlug',
  tenantResolver,
  viberSignature,
  handleWebhook
);

// Register webhook URL with Viber for a tenant (admin only)
router.post('/register-webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || token !== env.ADMIN_API_TOKEN) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

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

    const webhookUrl = `${env.WEBHOOK_BASE_URL}/api/viber/webhook/${tenant.slug}`;
    await viberService.setWebhook(tenant.viber_auth_token, webhookUrl);

    res.json({ message: 'Webhook registered', webhook_url: webhookUrl });
  } catch (err) {
    next(err);
  }
});

// Send test message to a Viber user (admin only)
router.post('/test-message', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || token !== env.ADMIN_API_TOKEN) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { tenant_id, viber_user_id } = req.body;
    if (!tenant_id || !viber_user_id) {
      res.status(400).json({ error: 'tenant_id and viber_user_id are required' });
      return;
    }

    const tenant = await tenantService.getById(tenant_id);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    // Verify webhook is set up
    const accountInfo = await viberService.getAccountInfo(tenant.viber_auth_token);
    const expectedWebhook = `${env.WEBHOOK_BASE_URL}/api/viber/webhook/${tenant.slug}`;

    // Send test message
    await viberService.sendTextMessage({
      authToken: tenant.viber_auth_token,
      receiverId: viber_user_id,
      text: `Test message from ${tenant.firm_name} bot. Setup is working!`,
      senderName: tenant.firm_name,
    });

    res.json({
      message: 'Test message sent',
      webhook_url: accountInfo.webhook,
      webhook_match: accountInfo.webhook === expectedWebhook,
      bot_name: accountInfo.name,
    });
  } catch (err) {
    next(err);
  }
});

export { router as webhookRoutes };

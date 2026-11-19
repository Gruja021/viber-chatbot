import { Router } from 'express';
import { handleChatwootWebhook } from './chatwoot.webhook.controller';
import { chatwootWebhookAuth } from '../../middleware/chatwoot-webhook-auth';

const router = Router();

router.post('/webhook', chatwootWebhookAuth, handleChatwootWebhook);

export { router as chatwootWebhookRoutes };

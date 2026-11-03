import { Router } from 'express';
import { handleChatwootWebhook } from './chatwoot.webhook.controller';

const router = Router();

router.post('/webhook', handleChatwootWebhook);

export { router as chatwootWebhookRoutes };

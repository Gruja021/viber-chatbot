import { Request, Response } from 'express';
import { logger } from '../../config/logger';
import { viberService } from './viber.service';
import { handleIncomingMessage, handleWelcomeMessage } from './message-handler';
import { PlatformMessenger, PlatformSender } from '../../types/platform';
import {
  ViberWebhookEvent,
  isMessageEvent,
  isConversationStarted,
  isWebhookEvent,
  getTextContent,
} from '../../utils/viber-helpers';

const viberMessenger: PlatformMessenger = {
  async sendTextMessage(tenant: any, receiverId: string, text: string): Promise<void> {
    await viberService.sendTextMessage({
      authToken: tenant.viber_auth_token,
      receiverId,
      text,
      senderName: tenant.firm_name,
    });
  },
};

export async function handleWebhook(req: Request, res: Response) {
  const tenant = req.tenant!;
  const payload = req.body as ViberWebhookEvent;

  logger.debug({ event: payload.event, tenantSlug: tenant.slug }, 'Webhook event received');

  if (isWebhookEvent(payload)) {
    res.json({ status: 0, status_message: 'ok' });
    return;
  }

  res.json({ status: 0, status_message: 'ok' });

  try {
    if (isConversationStarted(payload) && payload.sender) {
      const sender: PlatformSender = {
        platform: 'viber',
        userId: payload.sender.id,
        userName: payload.sender.name,
      };
      await handleWelcomeMessage(tenant, sender, viberMessenger);
    } else if (isMessageEvent(payload) && payload.sender) {
      const textContent = getTextContent(payload);
      if (!textContent) {
        logger.debug({ tenantSlug: tenant.slug }, 'Non-text message received, ignoring');
        return;
      }

      const sender: PlatformSender = {
        platform: 'viber',
        userId: payload.sender.id,
        userName: payload.sender.name,
      };
      await handleIncomingMessage(
        tenant,
        sender,
        textContent,
        payload.message_token ? String(payload.message_token) : null,
        viberMessenger
      );
    }
  } catch (err) {
    logger.error({ err, tenantSlug: tenant.slug, event: payload.event }, 'Error processing webhook');
  }
}

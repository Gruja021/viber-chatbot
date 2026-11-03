import { Request, Response } from 'express';
import { logger } from '../../config/logger';
import { conversationService } from '../conversation/conversation.service';
import { chatwootService } from '../chatwoot/chatwoot.service';
import { aiService } from '../ai/ai.service';
import { viberService } from './viber.service';
import {
  ViberWebhookEvent,
  isMessageEvent,
  isConversationStarted,
  isWebhookEvent,
  getTextContent,
} from '../../utils/viber-helpers';

export async function handleWebhook(req: Request, res: Response) {
  const tenant = req.tenant!;
  const payload = req.body as ViberWebhookEvent;

  logger.debug({ event: payload.event, tenantSlug: tenant.slug }, 'Webhook event received');

  // Viber sends a webhook callback upon set_webhook — acknowledge it
  if (isWebhookEvent(payload)) {
    res.json({ status: 0, status_message: 'ok' });
    return;
  }

  // Acknowledge immediately (Viber expects 200 within a few seconds)
  res.json({ status: 0, status_message: 'ok' });

  try {
    if (isConversationStarted(payload) && payload.sender) {
      await handleConversationStarted(tenant, payload);
    } else if (isMessageEvent(payload) && payload.sender) {
      await handleMessage(tenant, payload);
    }
  } catch (err) {
    logger.error({ err, tenantSlug: tenant.slug, event: payload.event }, 'Error processing webhook');
  }
}

async function handleConversationStarted(tenant: any, payload: ViberWebhookEvent) {
  const sender = payload.sender!;

  // Ensure conversation exists
  await conversationService.getOrCreate(tenant.id, sender.id, sender.name);

  // Send welcome message
  await viberService.sendTextMessage({
    authToken: tenant.viber_auth_token,
    receiverId: sender.id,
    text: `Dobrodošli! Kako vam mogu pomoći?`,
    senderName: tenant.firm_name,
  });

  logger.info({ tenantSlug: tenant.slug, viberUserId: sender.id }, 'Conversation started');
}

async function handleMessage(tenant: any, payload: ViberWebhookEvent) {
  const sender = payload.sender!;
  const textContent = getTextContent(payload);

  if (!textContent) {
    logger.debug({ tenantSlug: tenant.slug }, 'Non-text message received, ignoring');
    return;
  }

  // Get or create conversation
  const conversation = await conversationService.getOrCreate(
    tenant.id,
    sender.id,
    sender.name
  );

  // Save user message
  await conversationService.addMessage(
    conversation.id,
    'user',
    textContent,
    payload.message_token
  );

  // If in handover mode, forward to Chatwoot only
  if (conversation.is_handover) {
    if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
      await chatwootService.sendMessage({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: conversation.chatwoot_conversation_id,
        content: textContent,
        messageType: 'incoming',
      });
    }
    return;
  }

  // Create Chatwoot conversation if needed (for lead capture)
  if (tenant.chatwoot_api_token && !conversation.chatwoot_conversation_id) {
    const chatwootConvId = await chatwootService.createConversation({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id!,
      inboxId: tenant.chatwoot_inbox_id!,
      contactName: sender.name,
      identifier: sender.id,
    });

    if (chatwootConvId) {
      await conversationService.setChatwootConversationId(conversation.id, chatwootConvId);
      conversation.chatwoot_conversation_id = chatwootConvId;
    }
  }

  // Forward message to Chatwoot for logging
  if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
    await chatwootService.sendMessage({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id!,
      conversationId: conversation.chatwoot_conversation_id,
      content: textContent,
      messageType: 'incoming',
    });
  }

  // Generate AI response
  const recentMessages = await conversationService.getRecentMessages(conversation.id, 20);
  const replyText = await aiService.generateResponse(tenant, recentMessages, textContent);

  await viberService.sendTextMessage({
    authToken: tenant.viber_auth_token,
    receiverId: sender.id,
    text: replyText,
    senderName: tenant.firm_name,
  });

  // Save bot response
  await conversationService.addMessage(conversation.id, 'assistant', replyText);

  logger.info(
    { tenantSlug: tenant.slug, viberUserId: sender.id },
    'Message processed'
  );
}

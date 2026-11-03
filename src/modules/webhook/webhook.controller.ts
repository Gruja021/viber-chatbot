import { Request, Response } from 'express';
import { logger } from '../../config/logger';
import { conversationService } from '../conversation/conversation.service';
import { chatwootService } from '../chatwoot/chatwoot.service';
import { aiService } from '../ai/ai.service';
import { viberService } from './viber.service';
import { isWithinWorkingHours, matchesHandoverKeyword } from '../business-hours/business-hours.service';
import { agentTimeoutService } from '../agent-timeout/agent-timeout.service';
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

  // 1. Save user message
  await conversationService.addMessage(
    conversation.id,
    'user',
    textContent,
    payload.message_token
  );

  // 2. HANDOVER KEYWORD CHECK
  const keywords = tenant.handover_keywords || [];
  if (keywords.length > 0 && matchesHandoverKeyword(textContent, keywords)) {
    // Activate handover for 24 hours
    await conversationService.setHandover(conversation.id, 24 * 60);

    // Ensure Chatwoot conversation exists
    const chatwootConvId = await ensureChatwootConversation(tenant, conversation, sender);

    // Send internal note in Chatwoot
    if (tenant.chatwoot_api_token && chatwootConvId) {
      await chatwootService.addInternalNote({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: chatwootConvId,
        content: `[Handover] Korisnik je zatražio razgovor sa agentom. Poruka: "${textContent}"`,
      });
    }

    // Confirm to user
    await viberService.sendTextMessage({
      authToken: tenant.viber_auth_token,
      receiverId: sender.id,
      text: 'Vaš zahtev je prosleđen našem timu. Agent će vam se javiti u najkraćem roku.',
      senderName: tenant.firm_name,
    });

    return;
  }

  // 3. HANDOVER MODE — forward to Chatwoot only
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

  // 4. WORKING HOURS — route to agent with 3-min timeout
  if (isWithinWorkingHours(tenant) && tenant.chatwoot_api_token) {
    const chatwootConvId = await ensureChatwootConversation(tenant, conversation, sender);

    if (chatwootConvId) {
      // Forward message to Chatwoot
      await chatwootService.sendMessage({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: chatwootConvId,
        content: textContent,
        messageType: 'incoming',
      });

      // Set pending agent state
      await conversationService.setPendingAgent(conversation.id);

      // Start 3-minute timeout
      await agentTimeoutService.startTimeout({
        conversationId: conversation.id,
        tenantId: tenant.id,
        viberUserId: sender.id,
        userMessage: textContent,
      });

      return;
    }
    // If Chatwoot conversation couldn't be created, fall through to AI
  }

  // 5. DEFAULT — AI response (off-hours, no Chatwoot, or fallback)
  await handleAIResponse(tenant, conversation, sender, textContent);
}

/**
 * Ensure a Chatwoot conversation exists. Creates one if needed.
 * Returns the chatwoot_conversation_id or null.
 */
async function ensureChatwootConversation(
  tenant: any,
  conversation: any,
  sender: any
): Promise<number | null> {
  if (!tenant.chatwoot_api_token) return null;

  if (conversation.chatwoot_conversation_id) {
    return conversation.chatwoot_conversation_id;
  }

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

  return chatwootConvId;
}

/**
 * Generate AI response and send via Viber. Also logs to Chatwoot.
 */
async function handleAIResponse(
  tenant: any,
  conversation: any,
  sender: any,
  textContent: string
): Promise<void> {
  // Create Chatwoot conversation if needed (for lead capture)
  await ensureChatwootConversation(tenant, conversation, sender);

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

import { logger } from '../../config/logger';
import { conversationService } from '../conversation/conversation.service';
import { chatwootService } from '../chatwoot/chatwoot.service';
import { aiService } from '../ai/ai.service';
import { isWithinWorkingHours, matchesHandoverKeyword } from '../business-hours/business-hours.service';
import { agentTimeoutService } from '../agent-timeout/agent-timeout.service';
import { PlatformSender, PlatformMessenger } from '../../types/platform';

/**
 * Handle a welcome/conversation-started event (platform-agnostic).
 */
export async function handleWelcomeMessage(
  tenant: any,
  sender: PlatformSender,
  messenger: PlatformMessenger
): Promise<void> {
  await conversationService.getOrCreate(tenant.id, sender.platform, sender.userId, sender.userName);

  await messenger.sendTextMessage(tenant, sender.userId, `Dobrodošli! Kako vam mogu pomoći?`);

  logger.info({ tenantSlug: tenant.slug, platform: sender.platform, userId: sender.userId }, 'Conversation started');
}

/**
 * Handle an incoming text message (platform-agnostic).
 * Core routing: handover keyword → handover mode → working hours → AI fallback.
 */
export async function handleIncomingMessage(
  tenant: any,
  sender: PlatformSender,
  text: string,
  messageToken: string | null,
  messenger: PlatformMessenger
): Promise<void> {
  const conversation = await conversationService.getOrCreate(
    tenant.id,
    sender.platform,
    sender.userId,
    sender.userName
  );

  // 1. Save user message
  await conversationService.addMessage(
    conversation.id,
    'user',
    text,
    messageToken
  );

  // 2. HANDOVER KEYWORD CHECK
  const keywords = tenant.handover_keywords || [];
  if (keywords.length > 0 && matchesHandoverKeyword(text, keywords)) {
    await conversationService.setHandover(conversation.id, 24 * 60);

    const chatwootConvId = await ensureChatwootConversation(tenant, conversation, sender);

    if (tenant.chatwoot_api_token && chatwootConvId) {
      await chatwootService.addInternalNote({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: chatwootConvId,
        content: `[Handover] Korisnik je zatražio razgovor sa agentom. Poruka: "${text}"`,
      });
    }

    await messenger.sendTextMessage(
      tenant,
      sender.userId,
      'Vaš zahtev je prosleđen našem timu. Agent će vam se javiti u najkraćem roku.'
    );

    return;
  }

  // 3. HANDOVER MODE — forward to Chatwoot only
  if (conversation.is_handover) {
    if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
      await chatwootService.sendMessage({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: conversation.chatwoot_conversation_id,
        content: text,
        messageType: 'incoming',
      });
    }
    return;
  }

  // 4. WORKING HOURS — route to agent with 3-min timeout
  if (isWithinWorkingHours(tenant) && tenant.chatwoot_api_token) {
    const chatwootConvId = await ensureChatwootConversation(tenant, conversation, sender);

    if (chatwootConvId) {
      await chatwootService.sendMessage({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: chatwootConvId,
        content: text,
        messageType: 'incoming',
      });

      await conversationService.setPendingAgent(conversation.id);

      await agentTimeoutService.startTimeout({
        conversationId: conversation.id,
        tenantId: tenant.id,
        platform: sender.platform,
        platformUserId: sender.userId,
        userMessage: text,
      }, tenant.agent_timeout_seconds);

      return;
    }
  }

  // 5. DEFAULT — AI response (off-hours, no Chatwoot, or fallback)
  await handleAIResponse(tenant, conversation, sender, text, messenger);
}

async function ensureChatwootConversation(
  tenant: any,
  conversation: any,
  sender: PlatformSender
): Promise<number | null> {
  if (!tenant.chatwoot_api_token) return null;

  if (conversation.chatwoot_conversation_id) {
    return conversation.chatwoot_conversation_id;
  }

  const chatwootConvId = await chatwootService.createConversation({
    chatwootApiToken: tenant.chatwoot_api_token,
    chatwootAccountId: tenant.chatwoot_account_id!,
    inboxId: tenant.chatwoot_inbox_id!,
    contactName: sender.userName,
    identifier: `${sender.platform}:${sender.userId}`,
  });

  if (chatwootConvId) {
    await conversationService.setChatwootConversationId(conversation.id, chatwootConvId);
    conversation.chatwoot_conversation_id = chatwootConvId;
  }

  return chatwootConvId;
}

async function handleAIResponse(
  tenant: any,
  conversation: any,
  sender: PlatformSender,
  textContent: string,
  messenger: PlatformMessenger
): Promise<void> {
  await ensureChatwootConversation(tenant, conversation, sender);

  if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
    await chatwootService.sendMessage({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id!,
      conversationId: conversation.chatwoot_conversation_id,
      content: textContent,
      messageType: 'incoming',
    });
  }

  const recentMessages = await conversationService.getRecentMessages(conversation.id, 20);
  const replyText = await aiService.generateResponse(tenant, recentMessages, textContent);

  await messenger.sendTextMessage(tenant, sender.userId, replyText);

  await conversationService.addMessage(conversation.id, 'assistant', replyText);

  logger.info(
    { tenantSlug: tenant.slug, platform: sender.platform, userId: sender.userId },
    'Message processed'
  );
}

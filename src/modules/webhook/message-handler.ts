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
  await conversationService.getOrCreate(tenant.id, sender.platform, sender.userId, sender.userName, tenant.session_timeout_hours);

  await messenger.sendTextMessage(tenant, sender.userId, `Dobrodošli! Kako vam mogu pomoći?`);

  logger.info({ tenantSlug: tenant.slug, platform: sender.platform, userId: sender.userId }, 'Conversation started');
}

/**
 * Handle an incoming text message (platform-agnostic).
 * Core routing: handover keyword → status checks → working hours → AI/Human mode.
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
    sender.userName,
    tenant.session_timeout_hours
  );

  // 1. Save user message
  await conversationService.addMessage(
    conversation.id,
    'user',
    text,
    messageToken
  );

  // 2. HANDOVER KEYWORD CHECK → human_active, forward to Chatwoot
  const keywords = tenant.handover_keywords || [];
  if (keywords.length > 0 && matchesHandoverKeyword(text, keywords)) {
    await conversationService.setStatus(conversation.id, 'human_active');
    // Also set legacy handover flag for backward compat
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

  // 3. STATUS: human_active → forward to Chatwoot only
  if (conversation.conversation_status === 'human_active') {
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

  // 4. STATUS: pending_human → forward to Chatwoot, restart timeout
  if (conversation.conversation_status === 'pending_human') {
    if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
      await chatwootService.sendMessage({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: conversation.chatwoot_conversation_id,
        content: text,
        messageType: 'incoming',
      });
    }

    // Restart agent timeout
    await agentTimeoutService.startTimeout({
      conversationId: conversation.id,
      tenantId: tenant.id,
      platform: sender.platform,
      platformUserId: sender.userId,
      userMessage: text,
    }, tenant.agent_timeout_seconds);

    return;
  }

  // 5. OFF-HOURS → AI responds (both modes)
  if (!isWithinWorkingHours(tenant)) {
    await handleOffHours(tenant, conversation, sender, text, messenger);
    return;
  }

  // 6. WITHIN WORKING HOURS — check mode
  if (tenant.agent_timeout_seconds === 0) {
    // AI-First Mode
    await handleAIFirstMode(tenant, conversation, sender, text, messenger);
  } else {
    // Human-First Mode
    await handleHumanFirstMode(tenant, conversation, sender, text, messenger);
  }
}

/**
 * Off-hours handler (same for both modes):
 * AI responds immediately. If AI escalates, forward to Chatwoot for agent to see later.
 */
async function handleOffHours(
  tenant: any,
  conversation: any,
  sender: PlatformSender,
  text: string,
  messenger: PlatformMessenger
): Promise<void> {
  await ensureChatwootConversation(tenant, conversation, sender);

  // Log user message to Chatwoot
  if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
    await chatwootService.sendMessage({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id!,
      conversationId: conversation.chatwoot_conversation_id,
      content: text,
      messageType: 'incoming',
    });
  }

  const recentMessages = await conversationService.getRecentMessages(conversation.id, 20);
  const aiResponse = await aiService.generateResponse(tenant, recentMessages, text);

  if (aiResponse.shouldEscalate) {
    // AI can't handle → forward to Chatwoot for agent to see when they arrive
    await conversationService.setStatus(conversation.id, 'human_active');
    await conversationService.setHandover(conversation.id, 24 * 60);

    if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
      await chatwootService.addInternalNote({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: conversation.chatwoot_conversation_id,
        content: `[AI Escalation - off hours] ${aiResponse.escalationReason || 'AI ne može da reši pitanje'}`,
      });
    }

    await messenger.sendTextMessage(tenant, sender.userId, aiResponse.text);
    await conversationService.addMessage(conversation.id, 'assistant', aiResponse.text);
    return;
  }

  // AI resolved
  if (conversation.conversation_status !== 'ai_active') {
    await conversationService.setStatus(conversation.id, 'ai_active');
  }

  await messenger.sendTextMessage(tenant, sender.userId, aiResponse.text);
  await conversationService.addMessage(conversation.id, 'assistant', aiResponse.text);

  // Log AI response to Chatwoot
  if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
    await chatwootService.sendMessage({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id!,
      conversationId: conversation.chatwoot_conversation_id,
      content: `[AI Bot] ${aiResponse.text}`,
      messageType: 'outgoing',
    });
  }

  logger.info(
    { tenantSlug: tenant.slug, platform: sender.platform, userId: sender.userId },
    'Off-hours message processed by AI'
  );
}

/**
 * AI-First Mode (agent_timeout_seconds == 0):
 * AI responds immediately. If AI escalates, hand over to human.
 */
async function handleAIFirstMode(
  tenant: any,
  conversation: any,
  sender: PlatformSender,
  text: string,
  messenger: PlatformMessenger
): Promise<void> {
  await ensureChatwootConversation(tenant, conversation, sender);

  // Log user message to Chatwoot
  if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
    await chatwootService.sendMessage({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id!,
      conversationId: conversation.chatwoot_conversation_id,
      content: text,
      messageType: 'incoming',
    });
  }

  const recentMessages = await conversationService.getRecentMessages(conversation.id, 20);
  const aiResponse = await aiService.generateResponse(tenant, recentMessages, text);

  if (aiResponse.shouldEscalate) {
    // Escalate to human
    await conversationService.setStatus(conversation.id, 'human_active');
    await conversationService.setHandover(conversation.id, 24 * 60);

    if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
      await chatwootService.addInternalNote({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: conversation.chatwoot_conversation_id,
        content: `[AI Escalation] ${aiResponse.escalationReason || 'AI ne može da reši pitanje'}`,
      });
    }

    await messenger.sendTextMessage(tenant, sender.userId, aiResponse.text);
    await conversationService.addMessage(conversation.id, 'assistant', aiResponse.text);
    return;
  }

  // AI resolved
  await messenger.sendTextMessage(tenant, sender.userId, aiResponse.text);
  await conversationService.addMessage(conversation.id, 'assistant', aiResponse.text);

  // Log AI response to Chatwoot
  if (tenant.chatwoot_api_token && conversation.chatwoot_conversation_id) {
    await chatwootService.sendMessage({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id!,
      conversationId: conversation.chatwoot_conversation_id,
      content: `[AI Bot] ${aiResponse.text}`,
      messageType: 'outgoing',
    });
  }

  logger.info(
    { tenantSlug: tenant.slug, platform: sender.platform, userId: sender.userId },
    'AI-First message processed'
  );
}

/**
 * Human-First Mode (agent_timeout_seconds > 0):
 * Route to Chatwoot first, wait for agent. If no agent responds within timeout, AI takes over.
 */
async function handleHumanFirstMode(
  tenant: any,
  conversation: any,
  sender: PlatformSender,
  text: string,
  messenger: PlatformMessenger
): Promise<void> {
  // If no Chatwoot configured, fallback to AI
  if (!tenant.chatwoot_api_token) {
    await handleAIFirstMode(tenant, conversation, sender, text, messenger);
    return;
  }

  const chatwootConvId = await ensureChatwootConversation(tenant, conversation, sender);

  if (chatwootConvId) {
    await chatwootService.sendMessage({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id!,
      conversationId: chatwootConvId,
      content: text,
      messageType: 'incoming',
    });

    await conversationService.setStatus(conversation.id, 'pending_human');
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

  // No Chatwoot conversation possible, fallback to AI
  await handleAIFirstMode(tenant, conversation, sender, text, messenger);
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

  try {
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
  } catch (err) {
    logger.error({ err, tenantId: tenant.id }, 'Failed to create Chatwoot conversation, continuing without CRM');
    return null;
  }
}

import { Request, Response } from 'express';
import { logger } from '../../config/logger';
import { conversationService } from '../conversation/conversation.service';
import { agentTimeoutService } from '../agent-timeout/agent-timeout.service';
import { viberService } from '../webhook/viber.service';
import { telegramService } from '../webhook/telegram.service';
import { tenantService } from '../tenant/tenant.service';

/**
 * Handle incoming Chatwoot webhooks.
 * Listens for agent responses and forwards them to the correct platform (Viber or Telegram).
 * Also handles conversation_resolved events to close conversations.
 */
export async function handleChatwootWebhook(req: Request, res: Response) {
  // Always acknowledge immediately
  res.status(200).json({ status: 'ok' });

  try {
    const payload = req.body;

    // Handle conversation_resolved event
    if (payload.event === 'conversation_status_changed' && payload.status === 'resolved') {
      await handleConversationResolved(payload);
      return;
    }

    // Only handle message_created events
    if (payload.event !== 'message_created') return;

    // Only handle outgoing messages (agent responses)
    if (payload.message_type !== 'outgoing') return;

    // Ignore bot messages (our own AI responses forwarded to Chatwoot)
    if (payload.sender?.type === 'agent_bot') return;
    if (typeof payload.content === 'string' && payload.content.startsWith('[AI Bot')) return;

    const chatwootConversationId = payload.conversation?.id;
    if (!chatwootConversationId) return;

    const content = payload.content;
    if (!content) return;

    logger.info({ chatwootConversationId }, 'Agent response received from Chatwoot');

    // Find our conversation by Chatwoot conversation ID
    const conversation = await conversationService.findByChatwootConversationId(chatwootConversationId);
    if (!conversation) {
      logger.warn({ chatwootConversationId }, 'No conversation found for Chatwoot ID');
      return;
    }

    // Cancel the timeout (agent responded in time)
    await agentTimeoutService.cancelTimeout(conversation.id);

    // Clear pending agent state and set human_active
    await conversationService.clearPendingAgent(conversation.id);
    await conversationService.setStatus(conversation.id, 'human_active');

    // Load tenant to get platform tokens
    const tenant = await tenantService.getById(conversation.tenant_id);
    if (!tenant) {
      logger.warn({ tenantId: conversation.tenant_id }, 'Tenant not found for Chatwoot webhook');
      return;
    }

    // Invalidate cache so next message picks up human_active status
    await conversationService.invalidateCache(conversation.tenant_id, conversation.platform, conversation.platform_user_id);

    // Forward agent message to the correct platform
    if (conversation.platform === 'telegram' && tenant.telegram_bot_token) {
      await telegramService.sendTextMessage(
        tenant.telegram_bot_token,
        conversation.platform_user_id,
        content
      );
    } else {
      await viberService.sendTextMessage({
        authToken: tenant.viber_auth_token!,
        receiverId: conversation.platform_user_id,
        text: content,
        senderName: tenant.firm_name,
      });
    }

    // Save agent message in our messages table
    await conversationService.addMessage(conversation.id, 'assistant', content, null, {
      source: 'chatwoot_agent',
    });

    logger.info(
      { conversationId: conversation.id, chatwootConversationId, platform: conversation.platform },
      'Agent response forwarded'
    );
  } catch (err) {
    logger.error({ err }, 'Error processing Chatwoot webhook');
  }
}

async function handleConversationResolved(payload: any): Promise<void> {
  const chatwootConversationId = payload.id || payload.conversation?.id;
  if (!chatwootConversationId) return;

  logger.info({ chatwootConversationId }, 'Conversation resolved in Chatwoot');

  const conversation = await conversationService.findByChatwootConversationId(chatwootConversationId);
  if (!conversation) {
    logger.warn({ chatwootConversationId }, 'No conversation found for resolved Chatwoot ID');
    return;
  }

  await conversationService.setStatus(conversation.id, 'closed');
  await conversationService.invalidateCache(
    conversation.tenant_id,
    conversation.platform,
    conversation.platform_user_id
  );

  logger.info({ conversationId: conversation.id, chatwootConversationId }, 'Conversation closed via Chatwoot resolve');
}

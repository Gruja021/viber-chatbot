import Redis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { agentTimeoutService } from './agent-timeout.service';
import { conversationService } from '../conversation/conversation.service';
import { aiService } from '../ai/ai.service';
import { viberService } from '../webhook/viber.service';
import { chatwootService } from '../chatwoot/chatwoot.service';
import { tenantService } from '../tenant/tenant.service';

const KEY_PREFIX = 'agent_timeout:';

let subscriber: Redis | null = null;

/**
 * Start listening for Redis keyspace expiry events.
 * When an agent_timeout key expires, trigger AI fallback.
 */
export async function startAgentTimeoutListener(): Promise<void> {
  subscriber = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
  });

  // Enable keyspace notifications for expired events
  await subscriber.config('SET', 'notify-keyspace-events', 'Ex');

  // Subscribe to expired key events on db 0
  await subscriber.subscribe('__keyevent@0__:expired');

  subscriber.on('message', async (_channel: string, expiredKey: string) => {
    // Only handle agent_timeout keys (not data keys)
    if (!expiredKey.startsWith(KEY_PREFIX) || expiredKey.startsWith('agent_timeout:data:')) {
      return;
    }

    const conversationId = expiredKey.slice(KEY_PREFIX.length);
    logger.info({ conversationId }, 'Agent timeout expired, triggering AI fallback');

    try {
      await handleTimeoutExpiry(conversationId);
    } catch (err) {
      logger.error({ err, conversationId }, 'Error handling agent timeout expiry');
    }
  });

  subscriber.on('error', (err) => {
    logger.error({ err }, 'Agent timeout subscriber error');
  });

  logger.info('Agent timeout listener started');
}

async function handleTimeoutExpiry(conversationId: string): Promise<void> {
  // 1. Get timeout data
  const data = await agentTimeoutService.getTimeoutData(conversationId);
  if (!data) {
    logger.warn({ conversationId }, 'No timeout data found, skipping AI fallback');
    return;
  }

  // 2. Clear pending agent state
  await conversationService.clearPendingAgent(data.conversationId);

  // 3. Load tenant for AI generation
  const tenant = await tenantService.getById(data.tenantId);
  if (!tenant) {
    logger.warn({ tenantId: data.tenantId }, 'Tenant not found for timeout fallback');
    return;
  }

  // 4. Generate AI response
  const recentMessages = await conversationService.getRecentMessages(data.conversationId, 20);
  const replyText = await aiService.generateResponse(tenant, recentMessages, data.userMessage);

  // 5. Send to Viber
  await viberService.sendTextMessage({
    authToken: tenant.viber_auth_token,
    receiverId: data.viberUserId,
    text: replyText,
    senderName: tenant.firm_name,
  });

  // 6. Save assistant message
  await conversationService.addMessage(data.conversationId, 'assistant', replyText);

  // 7. Log in Chatwoot if available
  if (tenant.chatwoot_api_token) {
    const conversation = await conversationService.getOrCreate(
      data.tenantId,
      data.viberUserId,
      null
    );

    if (conversation.chatwoot_conversation_id) {
      await chatwootService.sendMessage({
        chatwootApiToken: tenant.chatwoot_api_token,
        chatwootAccountId: tenant.chatwoot_account_id!,
        conversationId: conversation.chatwoot_conversation_id,
        content: `[AI Bot - agent timeout] ${replyText}`,
        messageType: 'outgoing',
      });
    }
  }

  logger.info({ conversationId: data.conversationId }, 'AI fallback sent after agent timeout');
}

export function stopAgentTimeoutListener(): void {
  if (subscriber) {
    subscriber.disconnect();
    subscriber = null;
    logger.info('Agent timeout listener stopped');
  }
}

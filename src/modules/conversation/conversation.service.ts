import { redis } from '../../config/redis';
import { logger } from '../../config/logger';
import { conversationRepository } from './conversation.repository';
import { Conversation, ConversationStatus, Message, MessageRole } from './conversation.model';
import { Platform } from '../../types/platform';

const CONV_TTL = 1800; // 30 min

function cacheKey(tenantId: string, platform: Platform, platformUserId: string): string {
  return `conv:${tenantId}:${platform}:${platformUserId}`;
}

export const conversationService = {
  async getOrCreate(
    tenantId: string,
    platform: Platform,
    platformUserId: string,
    platformUserName: string | null,
    sessionTimeoutHours?: number
  ): Promise<Conversation> {
    const key = cacheKey(tenantId, platform, platformUserId);

    const cached = await redis.get(key);
    if (cached) {
      const conv = JSON.parse(cached) as Conversation;

      // Check if conversation is closed — reset for new session
      if (conv.conversation_status === 'closed') {
        await conversationRepository.resetConversation(conv.id);
        await redis.del(key);
        return this.getOrCreate(tenantId, platform, platformUserId, platformUserName, sessionTimeoutHours);
      }

      // Check session timeout — auto-reset after N hours of inactivity
      if (sessionTimeoutHours && conv.updated_at) {
        const updatedAt = new Date(conv.updated_at).getTime();
        const timeoutMs = sessionTimeoutHours * 60 * 60 * 1000;
        if (Date.now() - updatedAt > timeoutMs) {
          logger.info({ conversationId: conv.id }, 'Session timeout expired, resetting conversation');
          await conversationRepository.resetConversation(conv.id);
          await redis.del(key);
          return this.getOrCreate(tenantId, platform, platformUserId, platformUserName, sessionTimeoutHours);
        }
      }

      // Check if handover has expired
      if (conv.is_handover && conv.handover_until && new Date(conv.handover_until) < new Date()) {
        await conversationRepository.clearHandover(conv.id);
        conv.is_handover = false;
        conv.handover_until = null;
        await redis.setex(key, CONV_TTL, JSON.stringify(conv));
      }
      return conv;
    }

    const conversation = await conversationRepository.create(tenantId, platform, platformUserId, platformUserName);

    // Check if conversation was fetched from DB (upsert) and needs reset
    if (conversation.conversation_status === 'closed') {
      await conversationRepository.resetConversation(conversation.id);
      const fresh = await conversationRepository.findByTenantAndUser(tenantId, platform, platformUserId);
      if (fresh) {
        await redis.setex(key, CONV_TTL, JSON.stringify(fresh));
        return fresh;
      }
    }

    // Check session timeout on DB-fetched conversation
    if (sessionTimeoutHours && conversation.updated_at) {
      const updatedAt = new Date(conversation.updated_at).getTime();
      const timeoutMs = sessionTimeoutHours * 60 * 60 * 1000;
      if (Date.now() - updatedAt > timeoutMs && conversation.conversation_status !== 'ai_active') {
        logger.info({ conversationId: conversation.id }, 'Session timeout expired on DB fetch, resetting');
        await conversationRepository.resetConversation(conversation.id);
        const fresh = await conversationRepository.findByTenantAndUser(tenantId, platform, platformUserId);
        if (fresh) {
          await redis.setex(key, CONV_TTL, JSON.stringify(fresh));
          return fresh;
        }
      }
    }

    await redis.setex(key, CONV_TTL, JSON.stringify(conversation));
    logger.debug({ conversationId: conversation.id, tenantId, platform, platformUserId }, 'Conversation loaded');

    return conversation;
  },

  async setStatus(conversationId: string, status: ConversationStatus): Promise<void> {
    await conversationRepository.setStatus(conversationId, status);
  },

  async invalidateCache(tenantId: string, platform: Platform, platformUserId: string): Promise<void> {
    const key = cacheKey(tenantId, platform, platformUserId);
    await redis.del(key);
    logger.debug({ tenantId, platform, platformUserId }, 'Conversation cache invalidated');
  },

  async setChatwootConversationId(conversationId: string, chatwootId: number): Promise<void> {
    await conversationRepository.setChatwootConversationId(conversationId, chatwootId);
  },

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    platformMessageId?: string | null,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    return conversationRepository.addMessage(conversationId, role, content, platformMessageId, metadata);
  },

  async getRecentMessages(conversationId: string, limit?: number): Promise<Message[]> {
    return conversationRepository.getRecentMessages(conversationId, limit);
  },

  async setHandover(conversationId: string, durationMinutes: number): Promise<void> {
    const until = new Date(Date.now() + durationMinutes * 60 * 1000);
    await conversationRepository.setHandover(conversationId, until);
  },

  async clearHandover(conversationId: string): Promise<void> {
    await conversationRepository.clearHandover(conversationId);
  },

  async setPendingAgent(conversationId: string): Promise<void> {
    await conversationRepository.setPendingAgent(conversationId);
  },

  async clearPendingAgent(conversationId: string): Promise<void> {
    await conversationRepository.clearPendingAgent(conversationId);
  },

  async findByChatwootConversationId(chatwootConversationId: number): Promise<Conversation | null> {
    return conversationRepository.findByChatwootConversationId(chatwootConversationId);
  },
};

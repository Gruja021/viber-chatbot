import { redis } from '../../config/redis';
import { logger } from '../../config/logger';
import { conversationRepository } from './conversation.repository';
import { Conversation, Message, MessageRole } from './conversation.model';
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
    platformUserName: string | null
  ): Promise<Conversation> {
    const key = cacheKey(tenantId, platform, platformUserId);

    const cached = await redis.get(key);
    if (cached) {
      const conv = JSON.parse(cached) as Conversation;
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

    await redis.setex(key, CONV_TTL, JSON.stringify(conversation));
    logger.debug({ conversationId: conversation.id, tenantId, platform, platformUserId }, 'Conversation loaded');

    return conversation;
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

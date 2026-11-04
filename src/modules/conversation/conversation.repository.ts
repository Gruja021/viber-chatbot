import { pool } from '../../config/database';
import { Conversation, Message, MessageRole } from './conversation.model';
import { Platform } from '../../types/platform';

export const conversationRepository = {
  async findByTenantAndUser(tenantId: string, platform: Platform, platformUserId: string): Promise<Conversation | null> {
    const { rows } = await pool.query<Conversation>(
      'SELECT * FROM conversations WHERE tenant_id = $1 AND platform = $2 AND platform_user_id = $3',
      [tenantId, platform, platformUserId]
    );
    return rows[0] || null;
  },

  async create(
    tenantId: string,
    platform: Platform,
    platformUserId: string,
    platformUserName: string | null
  ): Promise<Conversation> {
    const { rows } = await pool.query<Conversation>(
      `INSERT INTO conversations (tenant_id, platform, platform_user_id, platform_user_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, platform, platform_user_id)
       DO UPDATE SET platform_user_name = COALESCE($4, conversations.platform_user_name), updated_at = NOW()
       RETURNING *`,
      [tenantId, platform, platformUserId, platformUserName]
    );
    return rows[0];
  },

  async setChatwootConversationId(id: string, chatwootId: number): Promise<void> {
    await pool.query(
      'UPDATE conversations SET chatwoot_conversation_id = $1, updated_at = NOW() WHERE id = $2',
      [chatwootId, id]
    );
  },

  async setHandover(id: string, until: Date | null): Promise<void> {
    await pool.query(
      'UPDATE conversations SET is_handover = TRUE, handover_until = $1, updated_at = NOW() WHERE id = $2',
      [until, id]
    );
  },

  async clearHandover(id: string): Promise<void> {
    await pool.query(
      'UPDATE conversations SET is_handover = FALSE, handover_until = NULL, updated_at = NOW() WHERE id = $1',
      [id]
    );
  },

  async setPendingAgent(id: string): Promise<void> {
    await pool.query(
      'UPDATE conversations SET pending_agent_response = TRUE, agent_routed_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );
  },

  async clearPendingAgent(id: string): Promise<void> {
    await pool.query(
      'UPDATE conversations SET pending_agent_response = FALSE, agent_routed_at = NULL, updated_at = NOW() WHERE id = $1',
      [id]
    );
  },

  async findByChatwootConversationId(chatwootConversationId: number): Promise<Conversation | null> {
    const { rows } = await pool.query<Conversation>(
      'SELECT * FROM conversations WHERE chatwoot_conversation_id = $1',
      [chatwootConversationId]
    );
    return rows[0] || null;
  },

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    platformMessageId?: string | null,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    const { rows } = await pool.query<Message>(
      `INSERT INTO messages (conversation_id, role, content, platform_message_id, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [conversationId, role, content, platformMessageId || null, JSON.stringify(metadata || {})]
    );
    return rows[0];
  },

  async getRecentMessages(conversationId: string, limit: number = 20): Promise<Message[]> {
    const { rows } = await pool.query<Message>(
      `SELECT * FROM messages WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [conversationId, limit]
    );
    return rows.reverse();
  },
};

import { pool } from '../../config/database';
import { Conversation, Message, MessageRole } from './conversation.model';

export const conversationRepository = {
  async findByTenantAndUser(tenantId: string, viberUserId: string): Promise<Conversation | null> {
    const { rows } = await pool.query<Conversation>(
      'SELECT * FROM conversations WHERE tenant_id = $1 AND viber_user_id = $2',
      [tenantId, viberUserId]
    );
    return rows[0] || null;
  },

  async create(
    tenantId: string,
    viberUserId: string,
    viberUserName: string | null
  ): Promise<Conversation> {
    const { rows } = await pool.query<Conversation>(
      `INSERT INTO conversations (tenant_id, viber_user_id, viber_user_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, viber_user_id)
       DO UPDATE SET viber_user_name = COALESCE($3, conversations.viber_user_name), updated_at = NOW()
       RETURNING *`,
      [tenantId, viberUserId, viberUserName]
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

  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    viberMessageToken?: number | null,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    const { rows } = await pool.query<Message>(
      `INSERT INTO messages (conversation_id, role, content, viber_message_token, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [conversationId, role, content, viberMessageToken || null, JSON.stringify(metadata || {})]
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

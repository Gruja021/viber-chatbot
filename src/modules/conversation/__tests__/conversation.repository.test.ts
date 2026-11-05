import { conversationRepository } from '../conversation.repository';
import { pool } from '../../../config/database';

const mockQuery = pool.query as jest.Mock;

describe('conversationRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findByTenantAndUser', () => {
    it('returns conversation when found', async () => {
      const conv = { id: 'conv-1', tenant_id: 't-1', platform: 'viber', platform_user_id: 'v-1' };
      mockQuery.mockResolvedValue({ rows: [conv] });

      const result = await conversationRepository.findByTenantAndUser('t-1', 'viber', 'v-1');
      expect(result).toEqual(conv);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1 AND platform = $2 AND platform_user_id = $3'),
        ['t-1', 'viber', 'v-1']
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await conversationRepository.findByTenantAndUser('t-1', 'viber', 'v-x');
      expect(result).toBeNull();
    });

    it('works with telegram platform', async () => {
      const conv = { id: 'conv-2', tenant_id: 't-1', platform: 'telegram', platform_user_id: '123' };
      mockQuery.mockResolvedValue({ rows: [conv] });

      const result = await conversationRepository.findByTenantAndUser('t-1', 'telegram', '123');
      expect(result).toEqual(conv);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['t-1', 'telegram', '123']
      );
    });
  });

  describe('create', () => {
    it('inserts with upsert and returns conversation', async () => {
      const conv = { id: 'conv-1', tenant_id: 't-1', platform: 'viber', platform_user_id: 'v-1', platform_user_name: 'User' };
      mockQuery.mockResolvedValue({ rows: [conv] });

      const result = await conversationRepository.create('t-1', 'viber', 'v-1', 'User');
      expect(result).toEqual(conv);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        ['t-1', 'viber', 'v-1', 'User']
      );
    });

    it('creates Telegram conversation', async () => {
      const conv = { id: 'conv-2', platform: 'telegram', platform_user_id: '456' };
      mockQuery.mockResolvedValue({ rows: [conv] });

      const result = await conversationRepository.create('t-1', 'telegram', '456', 'TG User');
      expect(result).toEqual(conv);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        ['t-1', 'telegram', '456', 'TG User']
      );
    });
  });

  describe('setChatwootConversationId', () => {
    it('updates chatwoot_conversation_id', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.setChatwootConversationId('conv-1', 42);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('chatwoot_conversation_id'),
        [42, 'conv-1']
      );
    });
  });

  describe('setHandover', () => {
    it('sets handover with until date', async () => {
      const until = new Date('2024-06-01');
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.setHandover('conv-1', until);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_handover = TRUE'),
        [until, 'conv-1']
      );
    });
  });

  describe('clearHandover', () => {
    it('clears handover flag', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.clearHandover('conv-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_handover = FALSE'),
        ['conv-1']
      );
    });
  });

  describe('setPendingAgent', () => {
    it('sets pending_agent_response to TRUE and agent_routed_at', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.setPendingAgent('conv-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pending_agent_response = TRUE'),
        ['conv-1']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('agent_routed_at = NOW()'),
        expect.any(Array)
      );
    });
  });

  describe('clearPendingAgent', () => {
    it('clears pending_agent_response and agent_routed_at', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.clearPendingAgent('conv-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pending_agent_response = FALSE'),
        ['conv-1']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('agent_routed_at = NULL'),
        expect.any(Array)
      );
    });
  });

  describe('setStatus', () => {
    it('updates conversation_status', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.setStatus('conv-1', 'human_active');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('conversation_status'),
        ['human_active', 'conv-1']
      );
    });

    it('updates with ai_active status', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.setStatus('conv-1', 'ai_active');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('conversation_status'),
        ['ai_active', 'conv-1']
      );
    });

    it('updates with closed status', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.setStatus('conv-1', 'closed');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('conversation_status'),
        ['closed', 'conv-1']
      );
    });

    it('updates with pending_human status', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.setStatus('conv-1', 'pending_human');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('conversation_status'),
        ['pending_human', 'conv-1']
      );
    });
  });

  describe('resetConversation', () => {
    it('resets conversation to fresh state', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.resetConversation('conv-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("conversation_status = 'ai_active'"),
        ['conv-1']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_handover = FALSE'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('chatwoot_conversation_id = NULL'),
        expect.any(Array)
      );
    });

    it('resets all state fields including pending_agent and agent_routed_at', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.resetConversation('conv-1');

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('pending_agent_response = FALSE');
      expect(query).toContain('agent_routed_at = NULL');
      expect(query).toContain('handover_until = NULL');
      expect(query).toContain('updated_at = NOW()');
    });
  });

  describe('findByChatwootConversationId', () => {
    it('returns conversation when found', async () => {
      const conv = { id: 'conv-1', chatwoot_conversation_id: 42 };
      mockQuery.mockResolvedValue({ rows: [conv] });

      const result = await conversationRepository.findByChatwootConversationId(42);
      expect(result).toEqual(conv);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('chatwoot_conversation_id = $1'),
        [42]
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await conversationRepository.findByChatwootConversationId(999);
      expect(result).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('inserts message with platform_message_id and returns it', async () => {
      const msg = { id: 'msg-1', conversation_id: 'conv-1', role: 'user', content: 'Hello' };
      mockQuery.mockResolvedValue({ rows: [msg] });

      const result = await conversationRepository.addMessage('conv-1', 'user', 'Hello', '12345', { source: 'viber' });
      expect(result).toEqual(msg);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        ['conv-1', 'user', 'Hello', '12345', JSON.stringify({ source: 'viber' })]
      );
    });

    it('handles missing optional params', async () => {
      const msg = { id: 'msg-2', role: 'assistant', content: 'Hi' };
      mockQuery.mockResolvedValue({ rows: [msg] });

      await conversationRepository.addMessage('conv-1', 'assistant', 'Hi');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        ['conv-1', 'assistant', 'Hi', null, '{}']
      );
    });
  });

  describe('getRecentMessages', () => {
    it('returns messages in chronological order (reversed)', async () => {
      const rows = [
        { id: '3', content: 'newest', created_at: '2024-01-03' },
        { id: '2', content: 'middle', created_at: '2024-01-02' },
        { id: '1', content: 'oldest', created_at: '2024-01-01' },
      ];
      mockQuery.mockResolvedValue({ rows });

      const result = await conversationRepository.getRecentMessages('conv-1');
      expect(result[0].id).toBe('1');
      expect(result[2].id).toBe('3');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC LIMIT'),
        ['conv-1', 20]
      );
    });

    it('respects custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await conversationRepository.getRecentMessages('conv-1', 5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['conv-1', 5]
      );
    });
  });
});

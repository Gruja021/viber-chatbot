import { conversationRepository } from '../conversation.repository';
import { pool } from '../../../config/database';

const mockQuery = pool.query as jest.Mock;

describe('conversationRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findByTenantAndUser', () => {
    it('returns conversation when found', async () => {
      const conv = { id: 'conv-1', tenant_id: 't-1', viber_user_id: 'v-1' };
      mockQuery.mockResolvedValue({ rows: [conv] });

      const result = await conversationRepository.findByTenantAndUser('t-1', 'v-1');
      expect(result).toEqual(conv);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1 AND viber_user_id = $2'),
        ['t-1', 'v-1']
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await conversationRepository.findByTenantAndUser('t-1', 'v-x');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts with upsert and returns conversation', async () => {
      const conv = { id: 'conv-1', tenant_id: 't-1', viber_user_id: 'v-1', viber_user_name: 'User' };
      mockQuery.mockResolvedValue({ rows: [conv] });

      const result = await conversationRepository.create('t-1', 'v-1', 'User');
      expect(result).toEqual(conv);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        ['t-1', 'v-1', 'User']
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

  describe('addMessage', () => {
    it('inserts message and returns it', async () => {
      const msg = { id: 'msg-1', conversation_id: 'conv-1', role: 'user', content: 'Hello' };
      mockQuery.mockResolvedValue({ rows: [msg] });

      const result = await conversationRepository.addMessage('conv-1', 'user', 'Hello', 12345, { source: 'viber' });
      expect(result).toEqual(msg);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        ['conv-1', 'user', 'Hello', 12345, JSON.stringify({ source: 'viber' })]
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

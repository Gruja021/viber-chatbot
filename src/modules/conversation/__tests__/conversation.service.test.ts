import { conversationService } from '../conversation.service';
import { conversationRepository } from '../conversation.repository';
import { redis } from '../../../config/redis';
import { Conversation } from '../conversation.model';

jest.mock('../conversation.repository');
const mockRepo = conversationRepository as jest.Mocked<typeof conversationRepository>;
const mockRedis = redis as jest.Mocked<typeof redis>;

const makeConversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'conv-1',
  tenant_id: 't-1',
  platform: 'viber',
  platform_user_id: 'v-1',
  platform_user_name: 'Test User',
  chatwoot_conversation_id: null,
  is_handover: false,
  handover_until: null,
  pending_agent_response: false,
  agent_routed_at: null,
  created_at: '2024-01-01T00:00:00.000Z' as unknown as Date,
  updated_at: '2024-01-01T00:00:00.000Z' as unknown as Date,
  ...overrides,
});

describe('conversationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreate', () => {
    it('returns cached conversation on cache hit', async () => {
      const conv = makeConversation();
      mockRedis.get.mockResolvedValue(JSON.stringify(conv));

      const result = await conversationService.getOrCreate('t-1', 'viber', 'v-1', 'Test User');
      expect(result).toEqual(conv);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('fetches from DB on cache miss and caches result', async () => {
      const conv = makeConversation();
      mockRedis.get.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(conv);

      const result = await conversationService.getOrCreate('t-1', 'viber', 'v-1', 'Test User');
      expect(result).toEqual(conv);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'conv:t-1:viber:v-1',
        1800,
        JSON.stringify(conv)
      );
    });

    it('clears expired handover on cache hit', async () => {
      const pastDate = new Date(Date.now() - 60000);
      const conv = makeConversation({
        is_handover: true,
        handover_until: pastDate,
      });
      mockRedis.get.mockResolvedValue(JSON.stringify(conv));

      const result = await conversationService.getOrCreate('t-1', 'viber', 'v-1', 'Test User');
      expect(result.is_handover).toBe(false);
      expect(result.handover_until).toBeNull();
      expect(mockRepo.clearHandover).toHaveBeenCalledWith('conv-1');
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('does not clear handover if still active', async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const conv = makeConversation({
        is_handover: true,
        handover_until: futureDate,
      });
      mockRedis.get.mockResolvedValue(JSON.stringify(conv));

      const result = await conversationService.getOrCreate('t-1', 'viber', 'v-1', 'Test User');
      expect(result.is_handover).toBe(true);
      expect(mockRepo.clearHandover).not.toHaveBeenCalled();
    });

    it('uses platform in cache key for Telegram', async () => {
      const conv = makeConversation({ platform: 'telegram', platform_user_id: '123' });
      mockRedis.get.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(conv);

      await conversationService.getOrCreate('t-1', 'telegram', '123', 'TG User');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'conv:t-1:telegram:123',
        1800,
        expect.any(String)
      );
    });
  });

  describe('setHandover', () => {
    it('calculates until timestamp from duration', async () => {
      mockRepo.setHandover.mockResolvedValue(undefined);
      const before = Date.now();
      await conversationService.setHandover('conv-1', 30);
      const after = Date.now();

      const calledWith = mockRepo.setHandover.mock.calls[0][1] as Date;
      const expectedMin = before + 30 * 60 * 1000;
      const expectedMax = after + 30 * 60 * 1000;
      expect(calledWith.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(calledWith.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('delegation methods', () => {
    it('addMessage delegates to repository', async () => {
      const msg = { id: 'msg-1' } as any;
      mockRepo.addMessage.mockResolvedValue(msg);

      const result = await conversationService.addMessage('conv-1', 'user', 'Hello', '123');
      expect(result).toEqual(msg);
      expect(mockRepo.addMessage).toHaveBeenCalledWith('conv-1', 'user', 'Hello', '123', undefined);
    });

    it('getRecentMessages delegates to repository', async () => {
      mockRepo.getRecentMessages.mockResolvedValue([]);
      const result = await conversationService.getRecentMessages('conv-1', 10);
      expect(result).toEqual([]);
      expect(mockRepo.getRecentMessages).toHaveBeenCalledWith('conv-1', 10);
    });

    it('clearHandover delegates to repository', async () => {
      mockRepo.clearHandover.mockResolvedValue(undefined);
      await conversationService.clearHandover('conv-1');
      expect(mockRepo.clearHandover).toHaveBeenCalledWith('conv-1');
    });

    it('setChatwootConversationId delegates to repository', async () => {
      mockRepo.setChatwootConversationId.mockResolvedValue(undefined);
      await conversationService.setChatwootConversationId('conv-1', 42);
      expect(mockRepo.setChatwootConversationId).toHaveBeenCalledWith('conv-1', 42);
    });

    it('setPendingAgent delegates to repository', async () => {
      mockRepo.setPendingAgent.mockResolvedValue(undefined);
      await conversationService.setPendingAgent('conv-1');
      expect(mockRepo.setPendingAgent).toHaveBeenCalledWith('conv-1');
    });

    it('clearPendingAgent delegates to repository', async () => {
      mockRepo.clearPendingAgent.mockResolvedValue(undefined);
      await conversationService.clearPendingAgent('conv-1');
      expect(mockRepo.clearPendingAgent).toHaveBeenCalledWith('conv-1');
    });

    it('findByChatwootConversationId delegates to repository', async () => {
      const conv = makeConversation({ chatwoot_conversation_id: 42 });
      mockRepo.findByChatwootConversationId.mockResolvedValue(conv);

      const result = await conversationService.findByChatwootConversationId(42);
      expect(result).toEqual(conv);
      expect(mockRepo.findByChatwootConversationId).toHaveBeenCalledWith(42);
    });
  });
});

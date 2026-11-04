import { agentTimeoutService, AgentTimeoutData } from '../agent-timeout.service';
import { redis } from '../../../config/redis';

const mockRedis = redis as jest.Mocked<typeof redis>;

describe('agent-timeout.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const testData: AgentTimeoutData = {
    conversationId: 'conv-1',
    tenantId: 't-1',
    platform: 'viber',
    platformUserId: 'user-1',
    userMessage: 'Zdravo, trebam pomoć',
  };

  describe('startTimeout', () => {
    it('sets timeout key with 180s TTL', async () => {
      await agentTimeoutService.startTimeout(testData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'agent_timeout:conv-1',
        180,
        '1'
      );
    });

    it('sets data key with 210s TTL', async () => {
      await agentTimeoutService.startTimeout(testData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'agent_timeout:data:conv-1',
        210,
        JSON.stringify(testData)
      );
    });

    it('sets both keys', async () => {
      await agentTimeoutService.startTimeout(testData);
      expect(mockRedis.setex).toHaveBeenCalledTimes(2);
    });

    it('uses custom timeout when provided', async () => {
      await agentTimeoutService.startTimeout(testData, 300);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'agent_timeout:conv-1',
        300,
        '1'
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'agent_timeout:data:conv-1',
        330, // 300 + 30 grace period
        JSON.stringify(testData)
      );
    });

    it('uses default 180s when no custom timeout provided', async () => {
      await agentTimeoutService.startTimeout(testData);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'agent_timeout:conv-1',
        180,
        '1'
      );
    });
  });

  describe('cancelTimeout', () => {
    it('deletes timeout key', async () => {
      await agentTimeoutService.cancelTimeout('conv-1');
      expect(mockRedis.del).toHaveBeenCalledWith('agent_timeout:conv-1');
    });

    it('deletes data key', async () => {
      await agentTimeoutService.cancelTimeout('conv-1');
      expect(mockRedis.del).toHaveBeenCalledWith('agent_timeout:data:conv-1');
    });

    it('deletes both keys', async () => {
      await agentTimeoutService.cancelTimeout('conv-1');
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTimeoutData', () => {
    it('returns parsed data when key exists', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      const result = await agentTimeoutService.getTimeoutData('conv-1');
      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('agent_timeout:data:conv-1');
    });

    it('returns null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await agentTimeoutService.getTimeoutData('conv-nonexistent');
      expect(result).toBeNull();
    });
  });
});

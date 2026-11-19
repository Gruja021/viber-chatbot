import { pool } from '../../../config/database';
import { redis } from '../../../config/redis';
import { logger } from '../../../config/logger';
import { dataRetentionService, CleanupResult } from '../data-retention.service';

const mockPool = pool as jest.Mocked<typeof pool>;
const mockRedis = redis as jest.Mocked<typeof redis>;

describe('data-retention.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runCleanup', () => {
    it('deletes old messages in batches', async () => {
      // First batch: 500 deleted, second batch: 100 deleted
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 500, rows: [] }) // messages batch 1
        .mockResolvedValueOnce({ rowCount: 100, rows: [] }) // messages batch 2
        .mockResolvedValueOnce({ rows: [] }); // conversations SELECT (none)

      const result = await dataRetentionService.runCleanup();

      expect(result.messagesDeleted).toBe(600);
      expect(result.conversationsDeleted).toBe(0);
    });

    it('stops message deletion after single batch when less than 500', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 50, rows: [] }) // messages: only 50
        .mockResolvedValueOnce({ rows: [] }); // conversations SELECT (none)

      const result = await dataRetentionService.runCleanup();

      expect(result.messagesDeleted).toBe(50);
      // Only 1 message DELETE query + 1 conversation SELECT query
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('deletes old closed conversations and cleans Redis', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages (none)
        .mockResolvedValueOnce({ rows: [{ id: 'conv-1' }, { id: 'conv-2' }] }) // conversations SELECT
        .mockResolvedValueOnce({ rowCount: 2, rows: [] }); // conversations DELETE

      (mockRedis.del as jest.Mock).mockResolvedValueOnce(4);

      const result = await dataRetentionService.runCleanup();

      expect(result.messagesDeleted).toBe(0);
      expect(result.conversationsDeleted).toBe(2);
      expect(result.redisKeysDeleted).toBe(4);
      expect(mockRedis.del).toHaveBeenCalledWith(
        'conv:conv-1', 'agent_timeout:conv-1', 'agent_timeout:data:conv-1',
        'conv:conv-2', 'agent_timeout:conv-2', 'agent_timeout:data:conv-2'
      );
    });

    it('handles multiple batches of conversations', async () => {
      const batch1Ids = Array.from({ length: 500 }, (_, i) => ({ id: `conv-${i}` }));

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages (none)
        .mockResolvedValueOnce({ rows: batch1Ids }) // conversations SELECT batch 1
        .mockResolvedValueOnce({ rowCount: 500, rows: [] }) // conversations DELETE batch 1
        .mockResolvedValueOnce({ rows: [{ id: 'conv-last' }] }) // conversations SELECT batch 2
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // conversations DELETE batch 2

      (mockRedis.del as jest.Mock)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(2);

      const result = await dataRetentionService.runCleanup();

      expect(result.conversationsDeleted).toBe(501);
      expect(result.redisKeysDeleted).toBe(102);
    });

    it('skips Redis cleanup when no conversations to delete', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [] }); // conversations SELECT (none)

      const result = await dataRetentionService.runCleanup();

      expect(result.conversationsDeleted).toBe(0);
      expect(result.redisKeysDeleted).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('logs completion with result details', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 10, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [] }); // conversations SELECT (none)

      await dataRetentionService.runCleanup();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          messagesDeleted: 10,
          conversationsDeleted: 0,
          redisKeysDeleted: 0,
          durationMs: expect.any(Number),
        }),
        'Data retention cleanup completed'
      );
    });

    it('returns duration in result', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataRetentionService.runCleanup();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles null rowCount gracefully', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: null, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [] }); // conversations

      const result = await dataRetentionService.runCleanup();

      expect(result.messagesDeleted).toBe(0);
    });

    it('uses correct SQL with parameterized interval for messages', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [] }); // conversations

      await dataRetentionService.runCleanup();

      const firstCall = (mockPool.query as jest.Mock).mock.calls[0];
      expect(firstCall[0]).toContain("$1::integer * INTERVAL '1 day'");
      expect(firstCall[0]).toContain('DELETE FROM messages');
      expect(firstCall[1]).toEqual([30, 500]); // MESSAGE_RETENTION_DAYS, BATCH_SIZE
    });

    it('uses correct SQL with parameterized interval and closed status for conversations', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [] }); // conversations SELECT

      await dataRetentionService.runCleanup();

      const secondCall = (mockPool.query as jest.Mock).mock.calls[1];
      expect(secondCall[0]).toContain("conversation_status = 'closed'");
      expect(secondCall[0]).toContain("$1::integer * INTERVAL '1 day'");
      expect(secondCall[1]).toEqual([90, 500]); // CONVERSATION_RETENTION_DAYS, BATCH_SIZE
    });

    it('deletes conversations using ANY($1) with correct IDs', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [{ id: 'aaa' }, { id: 'bbb' }] }) // conversations SELECT
        .mockResolvedValueOnce({ rowCount: 2, rows: [] }); // conversations DELETE

      (mockRedis.del as jest.Mock).mockResolvedValueOnce(3);

      await dataRetentionService.runCleanup();

      const deleteCall = (mockPool.query as jest.Mock).mock.calls[2];
      expect(deleteCall[0]).toContain('DELETE FROM conversations');
      expect(deleteCall[0]).toContain('ANY($1)');
      expect(deleteCall[1]).toEqual([['aaa', 'bbb']]);
    });

    it('cleans 3 Redis keys per conversation (conv, agent_timeout, agent_timeout:data)', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [{ id: 'single-conv' }] }) // conversations SELECT
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // conversations DELETE

      (mockRedis.del as jest.Mock).mockResolvedValueOnce(3);

      await dataRetentionService.runCleanup();

      expect(mockRedis.del).toHaveBeenCalledWith(
        'conv:single-conv',
        'agent_timeout:single-conv',
        'agent_timeout:data:single-conv'
      );
    });

    it('handles both messages and conversations in same run', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 200, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] }) // conversations SELECT
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // conversations DELETE

      (mockRedis.del as jest.Mock).mockResolvedValueOnce(2);

      const result = await dataRetentionService.runCleanup();

      expect(result.messagesDeleted).toBe(200);
      expect(result.conversationsDeleted).toBe(1);
      expect(result.redisKeysDeleted).toBe(2);
    });

    it('returns all zero counts when nothing to delete', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [] }); // conversations

      const result = await dataRetentionService.runCleanup();

      expect(result).toEqual({
        messagesDeleted: 0,
        conversationsDeleted: 0,
        redisKeysDeleted: 0,
        durationMs: expect.any(Number),
      });
    });

    it('propagates database errors', async () => {
      const dbError = new Error('connection refused');
      (mockPool.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(dataRetentionService.runCleanup()).rejects.toThrow('connection refused');
    });

    it('propagates Redis errors during cleanup', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] }); // conversations SELECT

      (mockRedis.del as jest.Mock).mockRejectedValueOnce(new Error('Redis down'));

      await expect(dataRetentionService.runCleanup()).rejects.toThrow('Redis down');
    });

    it('handles Redis del returning non-number gracefully', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] }) // conversations SELECT
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // conversations DELETE

      (mockRedis.del as jest.Mock).mockResolvedValueOnce('OK' as any);

      const result = await dataRetentionService.runCleanup();

      expect(result.redisKeysDeleted).toBe(0);
    });

    it('handles null rowCount on conversation DELETE gracefully', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // messages
        .mockResolvedValueOnce({ rows: [{ id: 'c-1' }] }) // conversations SELECT
        .mockResolvedValueOnce({ rowCount: null, rows: [] }); // conversations DELETE (null)

      (mockRedis.del as jest.Mock).mockResolvedValueOnce(3);

      const result = await dataRetentionService.runCleanup();

      expect(result.conversationsDeleted).toBe(0);
      expect(result.redisKeysDeleted).toBe(3);
    });

    it('processes exactly 3 message batches for 1200 messages', async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 500, rows: [] }) // messages batch 1
        .mockResolvedValueOnce({ rowCount: 500, rows: [] }) // messages batch 2
        .mockResolvedValueOnce({ rowCount: 200, rows: [] }) // messages batch 3
        .mockResolvedValueOnce({ rows: [] }); // conversations SELECT (none)

      const result = await dataRetentionService.runCleanup();

      expect(result.messagesDeleted).toBe(1200);
      // 3 message DELETE queries + 1 conversation SELECT query
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });
  });
});

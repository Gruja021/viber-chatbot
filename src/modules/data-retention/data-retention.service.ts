import { pool } from '../../config/database';
import { redis } from '../../config/redis';
import { logger } from '../../config/logger';

const BATCH_SIZE = 500;
const MESSAGE_RETENTION_DAYS = 30;
const CONVERSATION_RETENTION_DAYS = 90;

export interface CleanupResult {
  messagesDeleted: number;
  conversationsDeleted: number;
  redisKeysDeleted: number;
  durationMs: number;
}

async function deleteOldMessages(): Promise<number> {
  let totalDeleted = 0;

  // Delete messages older than 30 days in batches
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await pool.query(
      `DELETE FROM messages WHERE id IN (
        SELECT id FROM messages
        WHERE created_at < NOW() - INTERVAL '${MESSAGE_RETENTION_DAYS} days'
        LIMIT $1
      )`,
      [BATCH_SIZE]
    );

    const deleted = result.rowCount ?? 0;
    totalDeleted += deleted;

    if (deleted < BATCH_SIZE) {
      break;
    }
  }

  return totalDeleted;
}

async function cleanupRedisKeys(conversationIds: string[]): Promise<number> {
  if (conversationIds.length === 0) return 0;

  const keysToDelete: string[] = [];
  for (const id of conversationIds) {
    keysToDelete.push(`conv:${id}`, `agent_timeout:${id}`, `agent_timeout:data:${id}`);
  }

  if (keysToDelete.length === 0) return 0;

  const deleted = await redis.del(...keysToDelete);
  return typeof deleted === 'number' ? deleted : 0;
}

async function deleteOldConversations(): Promise<{ conversationsDeleted: number; redisKeysDeleted: number }> {
  let totalConversationsDeleted = 0;
  let totalRedisKeysDeleted = 0;

  // Delete closed conversations older than 90 days in batches
  // Messages are CASCADE deleted automatically
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // First, get the IDs so we can clean up Redis
    const selectResult = await pool.query(
      `SELECT id FROM conversations
       WHERE conversation_status = 'closed'
         AND updated_at < NOW() - INTERVAL '${CONVERSATION_RETENTION_DAYS} days'
       LIMIT $1`,
      [BATCH_SIZE]
    );

    const ids: string[] = selectResult.rows.map((r: { id: string }) => r.id);

    if (ids.length === 0) break;

    // Clean up Redis keys for these conversations
    const redisDeleted = await cleanupRedisKeys(ids);
    totalRedisKeysDeleted += redisDeleted;

    // Delete conversations (CASCADE deletes their messages too)
    const deleteResult = await pool.query(
      `DELETE FROM conversations WHERE id = ANY($1)`,
      [ids]
    );

    const deleted = deleteResult.rowCount ?? 0;
    totalConversationsDeleted += deleted;

    if (ids.length < BATCH_SIZE) {
      break;
    }
  }

  return { conversationsDeleted: totalConversationsDeleted, redisKeysDeleted: totalRedisKeysDeleted };
}

export async function runCleanup(): Promise<CleanupResult> {
  const start = Date.now();

  const messagesDeleted = await deleteOldMessages();
  const { conversationsDeleted, redisKeysDeleted } = await deleteOldConversations();

  const durationMs = Date.now() - start;

  const result: CleanupResult = {
    messagesDeleted,
    conversationsDeleted,
    redisKeysDeleted,
    durationMs,
  };

  logger.info(result, 'Data retention cleanup completed');

  return result;
}

export const dataRetentionService = {
  runCleanup,
};

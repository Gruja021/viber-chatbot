import { redis } from '../../config/redis';
import { logger } from '../../config/logger';

const TIMEOUT_TTL = 180;      // 3 minutes
const DATA_TTL = 210;          // 3.5 minutes (grace period)
const KEY_PREFIX = 'agent_timeout:';
const DATA_PREFIX = 'agent_timeout:data:';

export interface AgentTimeoutData {
  conversationId: string;
  tenantId: string;
  viberUserId: string;
  userMessage: string;
}

export const agentTimeoutService = {
  /**
   * Start a 3-minute timeout for agent response.
   * If the agent doesn't respond, the Redis key expires and triggers AI fallback.
   */
  async startTimeout(data: AgentTimeoutData): Promise<void> {
    const timeoutKey = `${KEY_PREFIX}${data.conversationId}`;
    const dataKey = `${DATA_PREFIX}${data.conversationId}`;

    // Set the expiring trigger key (3 min)
    await redis.setex(timeoutKey, TIMEOUT_TTL, '1');

    // Set the data key with slightly longer TTL (grace period for reading after expiry)
    await redis.setex(dataKey, DATA_TTL, JSON.stringify(data));

    logger.debug({ conversationId: data.conversationId }, 'Agent timeout started (180s)');
  },

  /**
   * Cancel the timeout (agent responded in time).
   */
  async cancelTimeout(conversationId: string): Promise<void> {
    const timeoutKey = `${KEY_PREFIX}${conversationId}`;
    const dataKey = `${DATA_PREFIX}${conversationId}`;

    await redis.del(timeoutKey);
    await redis.del(dataKey);

    logger.debug({ conversationId }, 'Agent timeout cancelled');
  },

  /**
   * Get timeout data for AI fallback processing.
   */
  async getTimeoutData(conversationId: string): Promise<AgentTimeoutData | null> {
    const dataKey = `${DATA_PREFIX}${conversationId}`;
    const raw = await redis.get(dataKey);
    if (!raw) return null;
    return JSON.parse(raw);
  },
};

import { pool } from '../../config/database';
import { CreditType, CreditLogEntry, TokenUsage } from './ai-credits.types';

export const aiCreditsRepository = {
  /**
   * Atomically check and deduct credits from a tenant.
   * Uses WHERE condition to prevent race conditions.
   * Returns true if deduction succeeded, false if limit exceeded.
   */
  async checkAndDeductCredits(
    tenantId: string,
    credits: number
  ): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE tenants
       SET credits_used = credits_used + $1, updated_at = NOW()
       WHERE id = $2
         AND (monthly_credit_limit IS NULL
              OR credits_used + $1 <= monthly_credit_limit + bonus_credits)`,
      [credits, tenantId]
    );
    return (rowCount ?? 0) > 0;
  },

  /**
   * Increment the AI message count for a conversation.
   */
  async incrementConversationAiMessageCount(conversationId: string): Promise<number> {
    const { rows } = await pool.query<{ ai_message_count: number }>(
      `UPDATE conversations
       SET ai_message_count = ai_message_count + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING ai_message_count`,
      [conversationId]
    );
    return rows[0]?.ai_message_count ?? 0;
  },

  /**
   * Get current AI message count for a conversation.
   */
  async getConversationAiMessageCount(conversationId: string): Promise<number> {
    const { rows } = await pool.query<{ ai_message_count: number }>(
      'SELECT ai_message_count FROM conversations WHERE id = $1',
      [conversationId]
    );
    return rows[0]?.ai_message_count ?? 0;
  },

  /**
   * Log credit usage to the ai_credit_log table.
   */
  async logCreditUsage(
    tenantId: string,
    conversationId: string,
    creditType: CreditType,
    creditsCharged: number,
    tokenUsage: TokenUsage | null,
    openaiModel: string | null
  ): Promise<CreditLogEntry> {
    const { rows } = await pool.query<CreditLogEntry>(
      `INSERT INTO ai_credit_log
       (tenant_id, conversation_id, credit_type, credits_charged, prompt_tokens, completion_tokens, total_tokens, openai_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        conversationId,
        creditType,
        creditsCharged,
        tokenUsage?.promptTokens ?? null,
        tokenUsage?.completionTokens ?? null,
        tokenUsage?.totalTokens ?? null,
        openaiModel,
      ]
    );
    return rows[0];
  },

  /**
   * Get usage summary for a tenant (current billing period).
   */
  async getUsageSummary(tenantId: string): Promise<{
    credits_used: number;
    bonus_credits: number;
    monthly_credit_limit: number | null;
    credits_reset_at: Date | null;
    per_conversation_message_limit: number | null;
    breakdown: { credit_type: CreditType; total_credits: number; count: number }[];
  }> {
    const tenantResult = await pool.query<{
      credits_used: number;
      bonus_credits: number;
      monthly_credit_limit: number | null;
      credits_reset_at: Date | null;
      per_conversation_message_limit: number | null;
    }>(
      `SELECT credits_used, bonus_credits, monthly_credit_limit, credits_reset_at, per_conversation_message_limit
       FROM tenants WHERE id = $1`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return {
        credits_used: 0,
        bonus_credits: 0,
        monthly_credit_limit: null,
        credits_reset_at: null,
        per_conversation_message_limit: null,
        breakdown: [],
      };
    }

    const tenant = tenantResult.rows[0];

    // Get breakdown by credit type for current month
    const breakdownResult = await pool.query<{
      credit_type: CreditType;
      total_credits: number;
      count: number;
    }>(
      `SELECT credit_type,
              SUM(credits_charged)::integer AS total_credits,
              COUNT(*)::integer AS count
       FROM ai_credit_log
       WHERE tenant_id = $1
         AND created_at >= date_trunc('month', NOW())
       GROUP BY credit_type
       ORDER BY total_credits DESC`,
      [tenantId]
    );

    return {
      ...tenant,
      breakdown: breakdownResult.rows,
    };
  },

  /**
   * Reset monthly credits for all tenants that have a limit.
   * Called on the 1st of each month.
   */
  async resetMonthlyCredits(): Promise<number> {
    const { rowCount } = await pool.query(
      `UPDATE tenants
       SET credits_used = 0, bonus_credits = 0, credits_reset_at = NOW(), updated_at = NOW()
       WHERE monthly_credit_limit IS NOT NULL`
    );
    return rowCount ?? 0;
  },

  /**
   * Get tenant credit fields needed for checks.
   */
  async getTenantCreditInfo(tenantId: string): Promise<{
    monthly_credit_limit: number | null;
    credits_used: number;
    bonus_credits: number;
    per_conversation_message_limit: number | null;
    credit_limit_message: string | null;
  } | null> {
    const { rows } = await pool.query<{
      monthly_credit_limit: number | null;
      credits_used: number;
      bonus_credits: number;
      per_conversation_message_limit: number | null;
      credit_limit_message: string | null;
    }>(
      `SELECT monthly_credit_limit, credits_used, bonus_credits, per_conversation_message_limit, credit_limit_message
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return rows[0] ?? null;
  },
};

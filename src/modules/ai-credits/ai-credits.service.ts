import { logger } from '../../config/logger';
import { aiCreditsRepository } from './ai-credits.repository';
import { CreditType, CREDIT_WEIGHTS, CreditCheckResult, TokenUsage, UsageSummary } from './ai-credits.types';

const DEFAULT_LIMIT_MESSAGE = 'Trenutno nismo u mogućnosti da odgovorimo automatski. Vaša poruka je prosleđena našem timu.';

export const aiCreditsService = {
  /**
   * Check if a tenant has enough credits for a given action.
   * Also checks per-conversation message limit.
   */
  async checkCredits(
    tenantId: string,
    conversationId: string,
    creditType: CreditType
  ): Promise<CreditCheckResult> {
    const info = await aiCreditsRepository.getTenantCreditInfo(tenantId);
    if (!info) {
      return { allowed: false, reason: 'Tenant not found' };
    }

    // Check monthly credit limit
    if (info.monthly_credit_limit !== null) {
      const totalLimit = info.monthly_credit_limit + info.bonus_credits;
      const cost = CREDIT_WEIGHTS[creditType];
      if (info.credits_used + cost > totalLimit) {
        return {
          allowed: false,
          reason: info.credit_limit_message || DEFAULT_LIMIT_MESSAGE,
        };
      }
    }

    // Check per-conversation message limit
    if (info.per_conversation_message_limit !== null) {
      const currentCount = await aiCreditsRepository.getConversationAiMessageCount(conversationId);
      if (currentCount >= info.per_conversation_message_limit) {
        return {
          allowed: false,
          reason: info.credit_limit_message || DEFAULT_LIMIT_MESSAGE,
        };
      }
    }

    return { allowed: true };
  },

  /**
   * Deduct credits atomically and log the usage.
   * Returns true if deduction succeeded.
   */
  async deductCredits(
    tenantId: string,
    conversationId: string,
    creditType: CreditType,
    tokenUsage: TokenUsage | null,
    openaiModel: string | null
  ): Promise<boolean> {
    const cost = CREDIT_WEIGHTS[creditType];

    const deducted = await aiCreditsRepository.checkAndDeductCredits(tenantId, cost);
    if (!deducted) {
      logger.warn({ tenantId, creditType, cost }, 'Credit deduction failed — limit reached');
      return false;
    }

    // Increment per-conversation counter
    await aiCreditsRepository.incrementConversationAiMessageCount(conversationId);

    // Log usage
    await aiCreditsRepository.logCreditUsage(
      tenantId,
      conversationId,
      creditType,
      cost,
      tokenUsage,
      openaiModel
    );

    logger.debug({ tenantId, conversationId, creditType, cost }, 'Credits deducted');
    return true;
  },

  /**
   * Get usage summary for the admin dashboard.
   */
  async getUsageSummary(tenantId: string): Promise<UsageSummary> {
    const data = await aiCreditsRepository.getUsageSummary(tenantId);

    const creditsRemaining = data.monthly_credit_limit !== null
      ? Math.max(0, data.monthly_credit_limit + data.bonus_credits - data.credits_used)
      : null;

    return {
      tenant_id: tenantId,
      monthly_credit_limit: data.monthly_credit_limit,
      credits_used: data.credits_used,
      bonus_credits: data.bonus_credits,
      credits_remaining: creditsRemaining,
      credits_reset_at: data.credits_reset_at,
      per_conversation_message_limit: data.per_conversation_message_limit,
      breakdown: data.breakdown,
    };
  },
};

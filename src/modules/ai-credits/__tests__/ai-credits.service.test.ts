import { aiCreditsService } from '../ai-credits.service';
import { aiCreditsRepository } from '../ai-credits.repository';
import { CREDIT_WEIGHTS } from '../ai-credits.types';

jest.mock('../ai-credits.repository');
const mockRepo = aiCreditsRepository as jest.Mocked<typeof aiCreditsRepository>;

describe('aiCreditsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkCredits', () => {
    it('allows when no monthly limit set (unlimited)', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: null,
        credits_used: 0,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(true);
    });

    it('allows when credits are under limit', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 100,
        credits_used: 50,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(true);
    });

    it('denies when monthly limit exceeded', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 100,
        credits_used: 100,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it('returns default message when monthly limit exceeded and no custom message', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 10,
        credits_used: 10,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('prosleđena našem timu');
    });

    it('accounts for bonus credits in limit check', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 100,
        credits_used: 100,
        bonus_credits: 10,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(true);
    });

    it('accounts for credit weight (database_search costs 2)', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 100,
        credits_used: 99,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'database_search');
      expect(result.allowed).toBe(false);
    });

    it('accounts for credit weight (image_analysis costs 5)', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 100,
        credits_used: 96,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'image_analysis');
      expect(result.allowed).toBe(false);
    });

    it('accounts for credit weight (pdf_analysis costs 10)', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 100,
        credits_used: 91,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'pdf_analysis');
      expect(result.allowed).toBe(false);
    });

    it('allows image_analysis when enough credits remain', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 100,
        credits_used: 95,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'image_analysis');
      expect(result.allowed).toBe(true);
    });

    it('allows pdf_analysis when enough credits remain', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 100,
        credits_used: 90,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'pdf_analysis');
      expect(result.allowed).toBe(true);
    });

    it('denies when per-conversation limit exceeded', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: null,
        credits_used: 0,
        bonus_credits: 0,
        per_conversation_message_limit: 5,
        credit_limit_message: null,
      });
      mockRepo.getConversationAiMessageCount.mockResolvedValue(5);

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('prosleđena našem timu');
    });

    it('returns custom message when per-conversation limit exceeded and custom message set', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: null,
        credits_used: 0,
        bonus_credits: 0,
        per_conversation_message_limit: 3,
        credit_limit_message: 'Limit razgovora dostignut, kontaktirajte nas telefonom.',
      });
      mockRepo.getConversationAiMessageCount.mockResolvedValue(3);

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Limit razgovora dostignut, kontaktirajte nas telefonom.');
    });

    it('allows when under per-conversation limit', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: null,
        credits_used: 0,
        bonus_credits: 0,
        per_conversation_message_limit: 5,
        credit_limit_message: null,
      });
      mockRepo.getConversationAiMessageCount.mockResolvedValue(3);

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(true);
    });

    it('does not check per-conversation limit when it is null', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: null,
        credits_used: 0,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: null,
      });

      await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(mockRepo.getConversationAiMessageCount).not.toHaveBeenCalled();
    });

    it('returns custom message when set', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 10,
        credits_used: 10,
        bonus_credits: 0,
        per_conversation_message_limit: null,
        credit_limit_message: 'Custom limit message',
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Custom limit message');
    });

    it('returns not allowed when tenant not found', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue(null);

      const result = await aiCreditsService.checkCredits('t-999', 'c-1', 'text_response');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Tenant not found');
    });

    it('checks both monthly and per-conversation limits (monthly fails first)', async () => {
      mockRepo.getTenantCreditInfo.mockResolvedValue({
        monthly_credit_limit: 10,
        credits_used: 10,
        bonus_credits: 0,
        per_conversation_message_limit: 5,
        credit_limit_message: null,
      });

      const result = await aiCreditsService.checkCredits('t-1', 'c-1', 'text_response');
      expect(result.allowed).toBe(false);
      // Monthly check fails before per-conversation is even checked
      expect(mockRepo.getConversationAiMessageCount).not.toHaveBeenCalled();
    });
  });

  describe('deductCredits', () => {
    it('deducts credits and logs usage', async () => {
      mockRepo.checkAndDeductCredits.mockResolvedValue(true);
      mockRepo.incrementConversationAiMessageCount.mockResolvedValue(1);
      mockRepo.logCreditUsage.mockResolvedValue({} as any);

      const result = await aiCreditsService.deductCredits(
        't-1', 'c-1', 'text_response',
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'gpt-4o-mini'
      );

      expect(result).toBe(true);
      expect(mockRepo.checkAndDeductCredits).toHaveBeenCalledWith('t-1', 1);
      expect(mockRepo.incrementConversationAiMessageCount).toHaveBeenCalledWith('c-1');
      expect(mockRepo.logCreditUsage).toHaveBeenCalledWith(
        't-1', 'c-1', 'text_response', 1,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'gpt-4o-mini'
      );
    });

    it('deducts 2 credits for database_search', async () => {
      mockRepo.checkAndDeductCredits.mockResolvedValue(true);
      mockRepo.incrementConversationAiMessageCount.mockResolvedValue(1);
      mockRepo.logCreditUsage.mockResolvedValue({} as any);

      await aiCreditsService.deductCredits('t-1', 'c-1', 'database_search', null, null);
      expect(mockRepo.checkAndDeductCredits).toHaveBeenCalledWith('t-1', 2);
    });

    it('deducts 5 credits for image_analysis', async () => {
      mockRepo.checkAndDeductCredits.mockResolvedValue(true);
      mockRepo.incrementConversationAiMessageCount.mockResolvedValue(1);
      mockRepo.logCreditUsage.mockResolvedValue({} as any);

      await aiCreditsService.deductCredits('t-1', 'c-1', 'image_analysis', null, null);
      expect(mockRepo.checkAndDeductCredits).toHaveBeenCalledWith('t-1', 5);
    });

    it('deducts 10 credits for pdf_analysis', async () => {
      mockRepo.checkAndDeductCredits.mockResolvedValue(true);
      mockRepo.incrementConversationAiMessageCount.mockResolvedValue(1);
      mockRepo.logCreditUsage.mockResolvedValue({} as any);

      await aiCreditsService.deductCredits('t-1', 'c-1', 'pdf_analysis', null, null);
      expect(mockRepo.checkAndDeductCredits).toHaveBeenCalledWith('t-1', 10);
    });

    it('passes null tokenUsage and model to logCreditUsage', async () => {
      mockRepo.checkAndDeductCredits.mockResolvedValue(true);
      mockRepo.incrementConversationAiMessageCount.mockResolvedValue(1);
      mockRepo.logCreditUsage.mockResolvedValue({} as any);

      await aiCreditsService.deductCredits('t-1', 'c-1', 'database_search', null, null);
      expect(mockRepo.logCreditUsage).toHaveBeenCalledWith(
        't-1', 'c-1', 'database_search', 2,
        null,
        null
      );
    });

    it('returns false when deduction fails (limit reached)', async () => {
      mockRepo.checkAndDeductCredits.mockResolvedValue(false);

      const result = await aiCreditsService.deductCredits('t-1', 'c-1', 'text_response', null, null);
      expect(result).toBe(false);
      expect(mockRepo.incrementConversationAiMessageCount).not.toHaveBeenCalled();
      expect(mockRepo.logCreditUsage).not.toHaveBeenCalled();
    });
  });

  describe('getUsageSummary', () => {
    it('returns usage summary with remaining credits', async () => {
      mockRepo.getUsageSummary.mockResolvedValue({
        credits_used: 50,
        bonus_credits: 10,
        monthly_credit_limit: 100,
        credits_reset_at: new Date(),
        per_conversation_message_limit: null,
        breakdown: [
          { credit_type: 'text_response', total_credits: 40, count: 40 },
          { credit_type: 'database_search', total_credits: 10, count: 5 },
        ],
      });

      const result = await aiCreditsService.getUsageSummary('t-1');
      expect(result.credits_remaining).toBe(60);
      expect(result.credits_used).toBe(50);
      expect(result.breakdown).toHaveLength(2);
    });

    it('returns null remaining when unlimited', async () => {
      mockRepo.getUsageSummary.mockResolvedValue({
        credits_used: 0,
        bonus_credits: 0,
        monthly_credit_limit: null,
        credits_reset_at: null,
        per_conversation_message_limit: null,
        breakdown: [],
      });

      const result = await aiCreditsService.getUsageSummary('t-1');
      expect(result.credits_remaining).toBeNull();
    });

    it('clamps remaining to 0 when credits_used exceeds limit + bonus', async () => {
      mockRepo.getUsageSummary.mockResolvedValue({
        credits_used: 120,
        bonus_credits: 5,
        monthly_credit_limit: 100,
        credits_reset_at: new Date(),
        per_conversation_message_limit: null,
        breakdown: [
          { credit_type: 'text_response', total_credits: 120, count: 120 },
        ],
      });

      const result = await aiCreditsService.getUsageSummary('t-1');
      expect(result.credits_remaining).toBe(0);
      expect(result.credits_used).toBe(120);
    });

    it('includes tenant_id in result', async () => {
      mockRepo.getUsageSummary.mockResolvedValue({
        credits_used: 0,
        bonus_credits: 0,
        monthly_credit_limit: 100,
        credits_reset_at: null,
        per_conversation_message_limit: null,
        breakdown: [],
      });

      const result = await aiCreditsService.getUsageSummary('t-42');
      expect(result.tenant_id).toBe('t-42');
    });
  });

  describe('CREDIT_WEIGHTS', () => {
    it('defines correct weights for all credit types', () => {
      expect(CREDIT_WEIGHTS.text_response).toBe(1);
      expect(CREDIT_WEIGHTS.database_search).toBe(2);
      expect(CREDIT_WEIGHTS.image_analysis).toBe(5);
      expect(CREDIT_WEIGHTS.pdf_analysis).toBe(10);
    });
  });
});

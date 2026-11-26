import { aiCreditsRepository } from '../ai-credits.repository';

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

describe('aiCreditsRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAndDeductCredits', () => {
    it('returns true when deduction succeeds', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await aiCreditsRepository.checkAndDeductCredits('t-1', 2);
      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenants'),
        [2, 't-1']
      );
    });

    it('returns false when limit would be exceeded', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await aiCreditsRepository.checkAndDeductCredits('t-1', 2);
      expect(result).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      const result = await aiCreditsRepository.checkAndDeductCredits('t-1', 1);
      expect(result).toBe(false);
    });
  });

  describe('incrementConversationAiMessageCount', () => {
    it('returns updated count', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ai_message_count: 5 }] });
      const result = await aiCreditsRepository.incrementConversationAiMessageCount('c-1');
      expect(result).toBe(5);
    });

    it('returns 0 when rows is empty (conversation not found)', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await aiCreditsRepository.incrementConversationAiMessageCount('c-missing');
      expect(result).toBe(0);
    });
  });

  describe('getConversationAiMessageCount', () => {
    it('returns count when conversation found', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ai_message_count: 7 }] });
      const result = await aiCreditsRepository.getConversationAiMessageCount('c-1');
      expect(result).toBe(7);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT ai_message_count'),
        ['c-1']
      );
    });

    it('returns 0 when conversation not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await aiCreditsRepository.getConversationAiMessageCount('c-missing');
      expect(result).toBe(0);
    });
  });

  describe('logCreditUsage', () => {
    it('inserts log entry with token usage', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'log-1', credit_type: 'text_response' }] });
      const result = await aiCreditsRepository.logCreditUsage(
        't-1', 'c-1', 'text_response', 1,
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'gpt-4o-mini'
      );
      expect(result.id).toBe('log-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_credit_log'),
        expect.arrayContaining(['t-1', 'c-1', 'text_response', 1, 100, 50, 150, 'gpt-4o-mini'])
      );
    });

    it('inserts log entry with null token usage', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'log-2', credit_type: 'database_search' }] });
      const result = await aiCreditsRepository.logCreditUsage(
        't-1', 'c-1', 'database_search', 2,
        null,
        null
      );
      expect(result.id).toBe('log-2');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_credit_log'),
        ['t-1', 'c-1', 'database_search', 2, null, null, null, null]
      );
    });
  });

  describe('resetMonthlyCredits', () => {
    it('returns number of tenants reset', async () => {
      mockQuery.mockResolvedValue({ rowCount: 3 });
      const result = await aiCreditsRepository.resetMonthlyCredits();
      expect(result).toBe(3);
    });

    it('returns 0 when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      const result = await aiCreditsRepository.resetMonthlyCredits();
      expect(result).toBe(0);
    });

    it('returns 0 when no tenants have limits', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await aiCreditsRepository.resetMonthlyCredits();
      expect(result).toBe(0);
    });
  });

  describe('getTenantCreditInfo', () => {
    it('returns credit info for tenant', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          monthly_credit_limit: 100,
          credits_used: 50,
          bonus_credits: 0,
          per_conversation_message_limit: null,
          credit_limit_message: null,
        }],
      });

      const result = await aiCreditsRepository.getTenantCreditInfo('t-1');
      expect(result?.monthly_credit_limit).toBe(100);
      expect(result?.credits_used).toBe(50);
    });

    it('returns null when tenant not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await aiCreditsRepository.getTenantCreditInfo('t-999');
      expect(result).toBeNull();
    });
  });

  describe('getUsageSummary', () => {
    it('returns summary with breakdown', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            credits_used: 50,
            bonus_credits: 0,
            monthly_credit_limit: 100,
            credits_reset_at: null,
            per_conversation_message_limit: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { credit_type: 'text_response', total_credits: 40, count: 40 },
          ],
        });

      const result = await aiCreditsRepository.getUsageSummary('t-1');
      expect(result.credits_used).toBe(50);
      expect(result.breakdown).toHaveLength(1);
    });

    it('returns default values when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await aiCreditsRepository.getUsageSummary('t-missing');
      expect(result.credits_used).toBe(0);
      expect(result.bonus_credits).toBe(0);
      expect(result.monthly_credit_limit).toBeNull();
      expect(result.credits_reset_at).toBeNull();
      expect(result.per_conversation_message_limit).toBeNull();
      expect(result.breakdown).toEqual([]);
      // Should NOT make a second query for breakdown
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('returns summary with multiple breakdown types', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            credits_used: 150,
            bonus_credits: 20,
            monthly_credit_limit: 500,
            credits_reset_at: new Date('2026-12-01'),
            per_conversation_message_limit: 10,
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { credit_type: 'text_response', total_credits: 80, count: 80 },
            { credit_type: 'database_search', total_credits: 60, count: 30 },
            { credit_type: 'image_analysis', total_credits: 10, count: 2 },
          ],
        });

      const result = await aiCreditsRepository.getUsageSummary('t-1');
      expect(result.credits_used).toBe(150);
      expect(result.bonus_credits).toBe(20);
      expect(result.per_conversation_message_limit).toBe(10);
      expect(result.breakdown).toHaveLength(3);
    });
  });
});

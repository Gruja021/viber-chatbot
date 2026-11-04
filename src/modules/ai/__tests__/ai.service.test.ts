import { aiService } from '../ai.service';
import { ANTI_HALLUCINATION_PREFIX, NO_DATABASE_SUFFIX } from '../ai.prompts';
import { Tenant } from '../../tenant/tenant.model';
import { Message } from '../../conversation/conversation.model';

// Mock OpenAI
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

// Mock connector factory
const mockQuery = jest.fn();
jest.mock('../../connector/connector.factory', () => ({
  createConnector: jest.fn(),
}));

import { createConnector } from '../../connector/connector.factory';
const mockCreateConnector = createConnector as jest.Mock;

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-1',
    slug: 'test',
    firm_name: 'Test Firm',
    viber_auth_token: 'token',
    telegram_bot_token: null,
    database_type: null,
    database_credentials: null,
    system_prompt: 'You are a helpful assistant for Test Firm.',
    chatwoot_account_id: null,
    chatwoot_inbox_id: null,
    chatwoot_api_token: null,
    timezone: 'Europe/Belgrade',
    working_hours: {},
    handover_keywords: [],
    agent_timeout_seconds: 180,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeMessage(role: 'user' | 'assistant', content: string): Message {
  return {
    id: 'm-1',
    conversation_id: 'c-1',
    role,
    content,
    platform_message_id: null,
    metadata: {},
    created_at: new Date(),
  };
}

describe('aiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateConnector.mockReturnValue(null);
  });

  describe('generateResponse without connector', () => {
    it('returns AI response for simple message', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Zdravo! Kako mogu pomoći?' }, finish_reason: 'stop' }],
      });

      const result = await aiService.generateResponse(makeTenant(), [], 'Zdravo');

      expect(result).toBe('Zdravo! Kako mogu pomoći?');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 1024,
          tools: undefined,
        })
      );
    });

    it('includes NO_DATABASE_SUFFIX in system prompt when no connector', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(makeTenant(), [], 'test');

      const systemMsg = mockCreate.mock.calls[0][0].messages[0];
      expect(systemMsg.role).toBe('system');
      expect(systemMsg.content).toContain(NO_DATABASE_SUFFIX);
    });

    it('includes tenant system_prompt in system message', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      const tenant = makeTenant({ system_prompt: 'Custom instructions here.' });
      await aiService.generateResponse(tenant, [], 'test');

      const systemMsg = mockCreate.mock.calls[0][0].messages[0];
      expect(systemMsg.content).toContain('Custom instructions here.');
      expect(systemMsg.content).toContain(ANTI_HALLUCINATION_PREFIX);
    });

    it('includes conversation history in messages', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      const history = [
        makeMessage('user', 'First question'),
        makeMessage('assistant', 'First answer'),
      ];

      await aiService.generateResponse(makeTenant(), history, 'Follow up');

      const messages = mockCreate.mock.calls[0][0].messages;
      expect(messages).toHaveLength(4); // system + 2 history + user
      expect(messages[1]).toEqual({ role: 'user', content: 'First question' });
      expect(messages[2]).toEqual({ role: 'assistant', content: 'First answer' });
      expect(messages[3]).toEqual({ role: 'user', content: 'Follow up' });
    });
  });

  describe('generateResponse with connector (function calling)', () => {
    beforeEach(() => {
      mockCreateConnector.mockReturnValue({
        query: mockQuery,
        testConnection: jest.fn(),
      });
    });

    it('handles function calling loop', async () => {
      // First call: AI wants to search
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-1',
              type: 'function',
              function: { name: 'search_database', arguments: '{"search_term":"widget"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });

      mockQuery.mockResolvedValue({
        success: true,
        data: [{ name: 'Widget A', price: '10.00' }],
        total_results: 1,
        source: 'google_sheets',
        query_description: 'Search for "widget"',
      });

      // Second call: AI responds with data
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Widget A košta 10.00.' }, finish_reason: 'stop' }],
      });

      const result = await aiService.generateResponse(makeTenant(), [], 'Koliko košta widget?');

      expect(result).toBe('Widget A košta 10.00.');
      expect(mockQuery).toHaveBeenCalledWith('widget');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('sends tools when connector exists', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(makeTenant(), [], 'test');

      expect(mockCreate.mock.calls[0][0].tools).toBeDefined();
      expect(mockCreate.mock.calls[0][0].tools[0].function.name).toBe('search_database');
    });

    it('does not include NO_DATABASE_SUFFIX when connector exists', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(makeTenant(), [], 'test');

      const systemMsg = mockCreate.mock.calls[0][0].messages[0];
      expect(systemMsg.content).not.toContain(NO_DATABASE_SUFFIX);
    });

    it('limits function call iterations to 3', async () => {
      // All calls return tool_calls
      const toolCallResponse = {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-x',
              type: 'function',
              function: { name: 'search_database', arguments: '{"search_term":"x"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };

      mockCreate.mockResolvedValue(toolCallResponse);
      mockQuery.mockResolvedValue({ success: true, data: [], total_results: 0, source: 'test', query_description: '' });

      const result = await aiService.generateResponse(makeTenant(), [], 'test');

      // 1 initial + 3 iterations = 4 calls max
      expect(mockCreate).toHaveBeenCalledTimes(4);
    });
  });

  describe('error handling', () => {
    it('returns user-friendly message on rate limit (429)', async () => {
      const error: any = new Error('Rate limited');
      error.status = 429;
      mockCreate.mockRejectedValue(error);

      const result = await aiService.generateResponse(makeTenant(), [], 'test');

      expect(result).toContain('pokušajte ponovo');
    });

    it('returns generic error message on other errors', async () => {
      mockCreate.mockRejectedValue(new Error('Server error'));

      const result = await aiService.generateResponse(makeTenant(), [], 'test');

      expect(result).toContain('greške');
    });

    it('returns fallback when AI returns empty content', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null }, finish_reason: 'stop' }],
      });

      const result = await aiService.generateResponse(makeTenant(), [], 'test');

      expect(result).toContain('nisam uspeo');
    });
  });
});

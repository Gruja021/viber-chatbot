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
  createConnectorsForTenant: jest.fn(),
}));

// Mock connector repository
jest.mock('../../connector/connector.repository', () => ({
  connectorRepository: {
    findActiveByTenantId: jest.fn(),
  },
}));

import { createConnector, createConnectorsForTenant } from '../../connector/connector.factory';
import { connectorRepository } from '../../connector/connector.repository';
const mockCreateConnector = createConnector as jest.Mock;
const mockCreateConnectorsForTenant = createConnectorsForTenant as jest.Mock;
const mockConnectorRepo = connectorRepository as jest.Mocked<typeof connectorRepository>;

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
    openai_api_key: null,
    openai_model: null,
    chatwoot_account_id: null,
    chatwoot_inbox_id: null,
    chatwoot_api_token: null,
    timezone: 'Europe/Belgrade',
    working_hours: {},
    handover_keywords: [],
    agent_timeout_seconds: 180,
    session_timeout_hours: 24,
    chatwoot_setup_status: 'none',
    chatwoot_setup_error: null,
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
    // Default: no multi-connectors (legacy mode)
    mockConnectorRepo.findActiveByTenantId.mockResolvedValue([]);
  });

  describe('generateResponse without connector', () => {
    it('returns AIResponse with text for simple message', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Zdravo! Kako mogu pomoći?' }, finish_reason: 'stop' }],
      });

      const result = await aiService.generateResponse(makeTenant(), [], 'Zdravo');

      expect(result.text).toBe('Zdravo! Kako mogu pomoći?');
      expect(result.shouldEscalate).toBe(false);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 1024,
        })
      );
    });

    it('does not send tools when no connector and no chatwoot', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(makeTenant(), [], 'test');

      expect(mockCreate.mock.calls[0][0].tools).toBeUndefined();
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

      expect(result.text).toBe('Widget A košta 10.00.');
      expect(result.shouldEscalate).toBe(false);
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

  describe('escalate_to_human tool', () => {
    it('includes escalate_to_human tool when tenant has chatwoot', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(
        makeTenant({ chatwoot_api_token: 'cw-token' }),
        [],
        'test'
      );

      const tools = mockCreate.mock.calls[0][0].tools;
      expect(tools).toBeDefined();
      const escalateTool = tools.find((t: any) => t.function.name === 'escalate_to_human');
      expect(escalateTool).toBeDefined();
    });

    it('does not include escalate_to_human when no chatwoot', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(
        makeTenant({ chatwoot_api_token: null }),
        [],
        'test'
      );

      expect(mockCreate.mock.calls[0][0].tools).toBeUndefined();
    });

    it('returns shouldEscalate=true when AI calls escalate_to_human', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-esc',
              type: 'function',
              function: {
                name: 'escalate_to_human',
                arguments: '{"reason":"Complex billing issue"}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });

      const result = await aiService.generateResponse(
        makeTenant({ chatwoot_api_token: 'cw-token' }),
        [],
        'I need refund'
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.escalationReason).toBe('Complex billing issue');
      expect(result.text).toBeTruthy();
    });
  });

  describe('both tools together', () => {
    it('includes both search_database and escalate_to_human when connector + chatwoot', async () => {
      mockCreateConnector.mockReturnValue({
        query: mockQuery,
        testConnection: jest.fn(),
      });

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(
        makeTenant({ chatwoot_api_token: 'cw-token' }),
        [],
        'test'
      );

      const tools = mockCreate.mock.calls[0][0].tools;
      expect(tools).toBeDefined();
      expect(tools).toHaveLength(2);
      expect(tools[0].function.name).toBe('search_database');
      expect(tools[1].function.name).toBe('escalate_to_human');
    });

    it('escalate_to_human returns immediately even when connector is present', async () => {
      mockCreateConnector.mockReturnValue({
        query: mockQuery,
        testConnection: jest.fn(),
      });

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-esc',
              type: 'function',
              function: {
                name: 'escalate_to_human',
                arguments: '{"reason":"Need human help"}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });

      const result = await aiService.generateResponse(
        makeTenant({ chatwoot_api_token: 'cw-token' }),
        [],
        'complex issue'
      );

      expect(result.shouldEscalate).toBe(true);
      expect(result.escalationReason).toBe('Need human help');
      // Should NOT continue function call loop or call search
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-tenant OpenAI config', () => {
    it('uses tenant openai_model when set', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(
        makeTenant({ openai_model: 'gpt-4o' }),
        [],
        'test'
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o' })
      );
    });

    it('falls back to default model when tenant openai_model is null', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(
        makeTenant({ openai_model: null }),
        [],
        'test'
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o-mini' })
      );
    });

    it('creates OpenAI client with tenant API key when set', async () => {
      const OpenAI = require('openai');
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(
        makeTenant({ openai_api_key: 'sk-tenant-key' }),
        [],
        'test'
      );

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'sk-tenant-key' })
      );
    });
  });

  describe('error handling', () => {
    it('returns user-friendly message on rate limit (429)', async () => {
      const error: any = new Error('Rate limited');
      error.status = 429;
      mockCreate.mockRejectedValue(error);

      const result = await aiService.generateResponse(makeTenant(), [], 'test');

      expect(result.text).toContain('pokušajte ponovo');
      expect(result.shouldEscalate).toBe(false);
    });

    it('returns generic error message on other errors', async () => {
      mockCreate.mockRejectedValue(new Error('Server error'));

      const result = await aiService.generateResponse(makeTenant(), [], 'test');

      expect(result.text).toContain('greške');
      expect(result.shouldEscalate).toBe(false);
    });

    it('returns fallback when AI returns empty content', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null }, finish_reason: 'stop' }],
      });

      const result = await aiService.generateResponse(makeTenant(), [], 'test');

      expect(result.text).toContain('nisam uspeo');
      expect(result.shouldEscalate).toBe(false);
    });
  });

  describe('multi-connector support', () => {
    it('uses multi-connectors when tenant_connectors exist', async () => {
      const mockConn = { query: mockQuery, testConnection: jest.fn() };
      const connMap = new Map([['products', mockConn]]);
      mockConnectorRepo.findActiveByTenantId.mockResolvedValue([
        { id: 'c1', tenant_id: 't-1', name: 'products', description: 'Product catalog', database_type: 'google_sheets', database_credentials: Buffer.from('enc'), is_active: true, priority: 0 } as any,
      ]);
      mockCreateConnectorsForTenant.mockReturnValue(connMap);

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-1', type: 'function',
              function: { name: 'search_database', arguments: '{"search_term":"widget"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });
      mockQuery.mockResolvedValue({ success: true, data: [{ name: 'Widget' }], total_results: 1, source: 'google_sheets', query_description: '' });
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Found Widget' }, finish_reason: 'stop' }],
      });

      const result = await aiService.generateResponse(makeTenant(), [], 'widget');

      expect(result.text).toBe('Found Widget');
      expect(mockCreateConnector).not.toHaveBeenCalled();
    });

    it('builds dynamic search tool with source enum for multiple connectors', async () => {
      const connMap = new Map([
        ['products', { query: jest.fn(), testConnection: jest.fn() }],
        ['prices', { query: jest.fn(), testConnection: jest.fn() }],
      ]);
      mockConnectorRepo.findActiveByTenantId.mockResolvedValue([
        { id: 'c1', name: 'products', description: 'Product catalog', database_type: 'google_sheets', is_active: true } as any,
        { id: 'c2', name: 'prices', description: 'Price list', database_type: 'rest_api', is_active: true } as any,
      ]);
      mockCreateConnectorsForTenant.mockReturnValue(connMap);

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(makeTenant(), [], 'test');

      const tools = mockCreate.mock.calls[0][0].tools;
      expect(tools).toBeDefined();
      const searchTool = tools.find((t: any) => t.function.name === 'search_database');
      expect(searchTool.function.parameters.properties.source.enum).toEqual(['products', 'prices']);
    });

    it('falls back to legacy single connector when no multi-connectors', async () => {
      mockConnectorRepo.findActiveByTenantId.mockResolvedValue([]);
      mockCreateConnector.mockReturnValue({ query: mockQuery, testConnection: jest.fn() });

      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(makeTenant(), [], 'test');

      expect(mockCreateConnector).toHaveBeenCalled();
      const tools = mockCreate.mock.calls[0][0].tools;
      expect(tools).toBeDefined();
      expect(tools[0].function.name).toBe('search_database');
    });

    it('searches specific source when source param provided', async () => {
      const mockProducts = { query: jest.fn().mockResolvedValue({ success: true, data: [], total_results: 0, source: 'google_sheets', query_description: '' }), testConnection: jest.fn() };
      const mockPrices = { query: jest.fn(), testConnection: jest.fn() };
      const connMap = new Map([['products', mockProducts], ['prices', mockPrices]]);
      mockConnectorRepo.findActiveByTenantId.mockResolvedValue([
        { id: 'c1', name: 'products', description: 'Products', database_type: 'google_sheets', is_active: true } as any,
        { id: 'c2', name: 'prices', description: 'Prices', database_type: 'rest_api', is_active: true } as any,
      ]);
      mockCreateConnectorsForTenant.mockReturnValue(connMap);

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-1', type: 'function',
              function: { name: 'search_database', arguments: '{"search_term":"widget","source":"products"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Done' }, finish_reason: 'stop' }],
      });

      await aiService.generateResponse(makeTenant(), [], 'widget');

      expect(mockProducts.query).toHaveBeenCalledWith('widget');
      expect(mockPrices.query).not.toHaveBeenCalled();
    });

    it('searches all connectors when source param is omitted', async () => {
      const mockProducts = { query: jest.fn().mockResolvedValue({ success: true, data: [{ name: 'Widget' }], total_results: 1, source: 'google_sheets', query_description: '' }), testConnection: jest.fn() };
      const mockPrices = { query: jest.fn().mockResolvedValue({ success: true, data: [{ price: '10' }], total_results: 1, source: 'rest_api', query_description: '' }), testConnection: jest.fn() };
      const connMap = new Map([['products', mockProducts], ['prices', mockPrices]]);
      mockConnectorRepo.findActiveByTenantId.mockResolvedValue([
        { id: 'c1', name: 'products', description: 'Products', database_type: 'google_sheets', is_active: true } as any,
        { id: 'c2', name: 'prices', description: 'Prices', database_type: 'rest_api', is_active: true } as any,
      ]);
      mockCreateConnectorsForTenant.mockReturnValue(connMap);

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-1', type: 'function',
              function: { name: 'search_database', arguments: '{"search_term":"widget"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Found in both' }, finish_reason: 'stop' }],
      });

      const result = await aiService.generateResponse(makeTenant(), [], 'widget');

      expect(result.text).toBe('Found in both');
      expect(mockProducts.query).toHaveBeenCalledWith('widget');
      expect(mockPrices.query).toHaveBeenCalledWith('widget');
    });
  });
});

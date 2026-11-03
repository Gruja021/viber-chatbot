import { agentTimeoutService } from '../agent-timeout.service';
import { conversationService } from '../../conversation/conversation.service';
import { aiService } from '../../ai/ai.service';
import { viberService } from '../../webhook/viber.service';
import { chatwootService } from '../../chatwoot/chatwoot.service';
import { tenantService } from '../../tenant/tenant.service';

jest.mock('../agent-timeout.service');
jest.mock('../../conversation/conversation.service');
jest.mock('../../ai/ai.service');
jest.mock('../../webhook/viber.service');
jest.mock('../../chatwoot/chatwoot.service');
jest.mock('../../tenant/tenant.service');

// Mock ioredis constructor
const mockConfig = jest.fn().mockResolvedValue('OK');
const mockSubscribe = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    config: mockConfig,
    subscribe: mockSubscribe,
    on: mockOn,
    disconnect: mockDisconnect,
  }));
});

const mockAgentTimeout = agentTimeoutService as jest.Mocked<typeof agentTimeoutService>;
const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockAiService = aiService as jest.Mocked<typeof aiService>;
const mockViberService = viberService as jest.Mocked<typeof viberService>;
const mockChatwootService = chatwootService as jest.Mocked<typeof chatwootService>;
const mockTenantService = tenantService as jest.Mocked<typeof tenantService>;

// Import after mocks
import { startAgentTimeoutListener, stopAgentTimeoutListener } from '../agent-timeout.listener';

describe('agent-timeout.listener', () => {
  let messageHandler: (channel: string, key: string) => Promise<void>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOn.mockImplementation((event: string, handler: any) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });

    await startAgentTimeoutListener();
  });

  afterEach(() => {
    stopAgentTimeoutListener();
  });

  describe('startAgentTimeoutListener', () => {
    it('configures Redis keyspace notifications', async () => {
      expect(mockConfig).toHaveBeenCalledWith('SET', 'notify-keyspace-events', 'Ex');
    });

    it('subscribes to expired key events', async () => {
      expect(mockSubscribe).toHaveBeenCalledWith('__keyevent@0__:expired');
    });

    it('registers message and error handlers', async () => {
      expect(mockOn).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('stopAgentTimeoutListener', () => {
    it('disconnects subscriber', () => {
      stopAgentTimeoutListener();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('handles stop when not started (no-op)', () => {
      stopAgentTimeoutListener(); // first stop
      mockDisconnect.mockClear();
      stopAgentTimeoutListener(); // second stop — subscriber is null
      expect(mockDisconnect).not.toHaveBeenCalled();
    });
  });

  describe('message handler — key filtering', () => {
    it('ignores non-agent_timeout keys', async () => {
      await messageHandler('__keyevent@0__:expired', 'some_other_key:123');
      expect(mockAgentTimeout.getTimeoutData).not.toHaveBeenCalled();
    });

    it('ignores agent_timeout:data: keys', async () => {
      await messageHandler('__keyevent@0__:expired', 'agent_timeout:data:conv-1');
      expect(mockAgentTimeout.getTimeoutData).not.toHaveBeenCalled();
    });

    it('processes agent_timeout:{conversationId} keys', async () => {
      mockAgentTimeout.getTimeoutData.mockResolvedValue(null);
      await messageHandler('__keyevent@0__:expired', 'agent_timeout:conv-1');
      expect(mockAgentTimeout.getTimeoutData).toHaveBeenCalledWith('conv-1');
    });
  });

  describe('handleTimeoutExpiry', () => {
    const timeoutData = {
      conversationId: 'conv-1',
      tenantId: 't-1',
      viberUserId: 'user-1',
      userMessage: 'Trebam pomoć',
    };

    const tenant = {
      id: 't-1',
      slug: 'test',
      firm_name: 'Test Firm',
      viber_auth_token: 'vtoken',
      chatwoot_api_token: null as string | null,
      chatwoot_account_id: null as number | null,
      chatwoot_inbox_id: null,
    };

    it('skips when timeout data not found', async () => {
      mockAgentTimeout.getTimeoutData.mockResolvedValue(null);

      await messageHandler('__keyevent@0__:expired', 'agent_timeout:conv-1');

      expect(mockConversationService.clearPendingAgent).not.toHaveBeenCalled();
      expect(mockTenantService.getById).not.toHaveBeenCalled();
    });

    it('skips when tenant not found', async () => {
      mockAgentTimeout.getTimeoutData.mockResolvedValue(timeoutData);
      mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
      mockTenantService.getById.mockResolvedValue(null);

      await messageHandler('__keyevent@0__:expired', 'agent_timeout:conv-1');

      expect(mockConversationService.clearPendingAgent).toHaveBeenCalledWith('conv-1');
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });

    it('full AI fallback flow: clears pending, generates AI, sends Viber, saves message', async () => {
      mockAgentTimeout.getTimeoutData.mockResolvedValue(timeoutData);
      mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
      mockTenantService.getById.mockResolvedValue(tenant as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI fallback odgovor');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);
      mockConversationService.addMessage.mockResolvedValue({} as any);

      await messageHandler('__keyevent@0__:expired', 'agent_timeout:conv-1');

      // Clears pending
      expect(mockConversationService.clearPendingAgent).toHaveBeenCalledWith('conv-1');

      // Generates AI response
      expect(mockAiService.generateResponse).toHaveBeenCalledWith(
        tenant,
        [],
        'Trebam pomoć'
      );

      // Sends to Viber
      expect(mockViberService.sendTextMessage).toHaveBeenCalledWith({
        authToken: 'vtoken',
        receiverId: 'user-1',
        text: 'AI fallback odgovor',
        senderName: 'Test Firm',
      });

      // Saves assistant message
      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'conv-1', 'assistant', 'AI fallback odgovor'
      );
    });

    it('logs AI response to Chatwoot when available', async () => {
      const tenantWithChatwoot = {
        ...tenant,
        chatwoot_api_token: 'cw-token',
        chatwoot_account_id: 1,
      };
      const conv = {
        id: 'conv-1',
        chatwoot_conversation_id: 42,
      };

      mockAgentTimeout.getTimeoutData.mockResolvedValue(timeoutData);
      mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
      mockTenantService.getById.mockResolvedValue(tenantWithChatwoot as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI reply');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockChatwootService.sendMessage.mockResolvedValue(undefined);

      await messageHandler('__keyevent@0__:expired', 'agent_timeout:conv-1');

      expect(mockChatwootService.sendMessage).toHaveBeenCalledWith({
        chatwootApiToken: 'cw-token',
        chatwootAccountId: 1,
        conversationId: 42,
        content: '[AI Bot - agent timeout] AI reply',
        messageType: 'outgoing',
      });
    });

    it('does not log to Chatwoot when tenant has no chatwoot_api_token', async () => {
      mockAgentTimeout.getTimeoutData.mockResolvedValue(timeoutData);
      mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
      mockTenantService.getById.mockResolvedValue(tenant as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI reply');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);
      mockConversationService.addMessage.mockResolvedValue({} as any);

      await messageHandler('__keyevent@0__:expired', 'agent_timeout:conv-1');

      expect(mockChatwootService.sendMessage).not.toHaveBeenCalled();
      expect(mockConversationService.getOrCreate).not.toHaveBeenCalled();
    });

    it('skips Chatwoot log when conversation has no chatwoot_conversation_id', async () => {
      const tenantWithChatwoot = {
        ...tenant,
        chatwoot_api_token: 'cw-token',
        chatwoot_account_id: 1,
      };
      const convNoChatwoot = { id: 'conv-1', chatwoot_conversation_id: null };

      mockAgentTimeout.getTimeoutData.mockResolvedValue(timeoutData);
      mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
      mockTenantService.getById.mockResolvedValue(tenantWithChatwoot as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI reply');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getOrCreate.mockResolvedValue(convNoChatwoot as any);

      await messageHandler('__keyevent@0__:expired', 'agent_timeout:conv-1');

      expect(mockConversationService.getOrCreate).toHaveBeenCalled();
      expect(mockChatwootService.sendMessage).not.toHaveBeenCalled();
    });

    it('catches errors in handleTimeoutExpiry without crashing', async () => {
      mockAgentTimeout.getTimeoutData.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      await expect(
        messageHandler('__keyevent@0__:expired', 'agent_timeout:conv-1')
      ).resolves.not.toThrow();
    });
  });
});

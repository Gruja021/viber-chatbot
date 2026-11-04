import { handleIncomingMessage, handleWelcomeMessage } from '../message-handler';
import { conversationService } from '../../conversation/conversation.service';
import { chatwootService } from '../../chatwoot/chatwoot.service';
import { aiService } from '../../ai/ai.service';
import * as businessHoursService from '../../business-hours/business-hours.service';
import { agentTimeoutService } from '../../agent-timeout/agent-timeout.service';
import { PlatformMessenger, PlatformSender } from '../../../types/platform';

jest.mock('../../conversation/conversation.service');
jest.mock('../../chatwoot/chatwoot.service');
jest.mock('../../ai/ai.service');
jest.mock('../../business-hours/business-hours.service');
jest.mock('../../agent-timeout/agent-timeout.service');

const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockChatwootService = chatwootService as jest.Mocked<typeof chatwootService>;
const mockAiService = aiService as jest.Mocked<typeof aiService>;
const mockBusinessHours = businessHoursService as jest.Mocked<typeof businessHoursService>;
const mockAgentTimeout = agentTimeoutService as jest.Mocked<typeof agentTimeoutService>;

const mockMessenger: jest.Mocked<PlatformMessenger> = {
  sendTextMessage: jest.fn().mockResolvedValue(undefined),
};

const makeTenant = (overrides: any = {}) => ({
  id: 't-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  viber_auth_token: 'vtoken',
  telegram_bot_token: null,
  chatwoot_api_token: 'cw-token',
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2,
  timezone: 'Europe/Belgrade',
  working_hours: {},
  handover_keywords: ['agent', 'operater', 'covek'],
  agent_timeout_seconds: 180,
  ...overrides,
});

const makeSender = (overrides: Partial<PlatformSender> = {}): PlatformSender => ({
  platform: 'viber',
  userId: 'user-1',
  userName: 'Test User',
  ...overrides,
});

describe('message-handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBusinessHours.isWithinWorkingHours.mockReturnValue(false);
    mockBusinessHours.matchesHandoverKeyword.mockReturnValue(false);
  });

  describe('handleWelcomeMessage', () => {
    it('creates conversation and sends welcome', async () => {
      const conv = { id: 'conv-1' };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);

      const sender = makeSender();
      await handleWelcomeMessage(makeTenant(), sender, mockMessenger);

      expect(mockConversationService.getOrCreate).toHaveBeenCalledWith('t-1', 'viber', 'user-1', 'Test User');
      expect(mockMessenger.sendTextMessage).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.stringContaining('Dobrodošli')
      );
    });

    it('works with Telegram sender', async () => {
      const conv = { id: 'conv-1' };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);

      const sender = makeSender({ platform: 'telegram', userId: '123' });
      await handleWelcomeMessage(makeTenant(), sender, mockMessenger);

      expect(mockConversationService.getOrCreate).toHaveBeenCalledWith('t-1', 'telegram', '123', 'Test User');
    });
  });

  describe('handleIncomingMessage', () => {
    it('saves user message and generates AI response', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockChatwootService.createConversation.mockResolvedValue(42);
      mockAiService.generateResponse.mockResolvedValue('AI odgovor');

      const tenant = makeTenant();
      const sender = makeSender();

      await handleIncomingMessage(tenant, sender, 'Zdravo!', '555', mockMessenger);

      expect(mockConversationService.addMessage).toHaveBeenCalledWith('conv-1', 'user', 'Zdravo!', '555');
      expect(mockAiService.generateResponse).toHaveBeenCalled();
      expect(mockMessenger.sendTextMessage).toHaveBeenCalledWith(tenant, 'user-1', 'AI odgovor');
      expect(mockConversationService.addMessage).toHaveBeenCalledWith('conv-1', 'assistant', 'AI odgovor');
    });

    it('activates handover on keyword match', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.setHandover.mockResolvedValue(undefined);
      mockChatwootService.createConversation.mockResolvedValue(42);
      mockChatwootService.addInternalNote.mockResolvedValue(undefined);
      mockBusinessHours.matchesHandoverKeyword.mockReturnValue(true);

      await handleIncomingMessage(makeTenant(), makeSender(), 'hocu operatera', '100', mockMessenger);

      expect(mockConversationService.setHandover).toHaveBeenCalledWith('conv-1', 1440);
      expect(mockChatwootService.addInternalNote).toHaveBeenCalled();
      expect(mockMessenger.sendTextMessage).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.stringContaining('prosleđen')
      );
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });

    it('forwards to Chatwoot in handover mode', async () => {
      const conv = { id: 'conv-1', is_handover: true, chatwoot_conversation_id: 42 };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockChatwootService.sendMessage.mockResolvedValue(undefined);

      await handleIncomingMessage(makeTenant(), makeSender(), 'Help me', '555', mockMessenger);

      expect(mockChatwootService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 42, content: 'Help me' })
      );
      expect(mockMessenger.sendTextMessage).not.toHaveBeenCalled();
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });

    it('routes to agent with timeout during working hours', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: 42 };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.setPendingAgent.mockResolvedValue(undefined);
      mockChatwootService.sendMessage.mockResolvedValue(undefined);
      mockAgentTimeout.startTimeout.mockResolvedValue(undefined);
      mockBusinessHours.isWithinWorkingHours.mockReturnValue(true);

      await handleIncomingMessage(makeTenant(), makeSender(), 'Imam pitanje', '100', mockMessenger);

      expect(mockChatwootService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 42, content: 'Imam pitanje' })
      );
      expect(mockConversationService.setPendingAgent).toHaveBeenCalledWith('conv-1');
      expect(mockAgentTimeout.startTimeout).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        tenantId: 't-1',
        platform: 'viber',
        platformUserId: 'user-1',
        userMessage: 'Imam pitanje',
      }, 180);
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });

    it('passes custom agent_timeout_seconds to startTimeout', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: 42 };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.setPendingAgent.mockResolvedValue(undefined);
      mockChatwootService.sendMessage.mockResolvedValue(undefined);
      mockAgentTimeout.startTimeout.mockResolvedValue(undefined);
      mockBusinessHours.isWithinWorkingHours.mockReturnValue(true);

      await handleIncomingMessage(
        makeTenant({ agent_timeout_seconds: 300 }),
        makeSender(),
        'Imam pitanje',
        '100',
        mockMessenger
      );

      expect(mockAgentTimeout.startTimeout).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conv-1' }),
        300
      );
    });

    it('falls back to AI when no Chatwoot during working hours', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI fallback');
      mockBusinessHours.isWithinWorkingHours.mockReturnValue(true);

      await handleIncomingMessage(
        makeTenant({ chatwoot_api_token: null }),
        makeSender(),
        'hello',
        '100',
        mockMessenger
      );

      expect(mockAiService.generateResponse).toHaveBeenCalled();
      expect(mockAgentTimeout.startTimeout).not.toHaveBeenCalled();
    });

    it('works with Telegram sender for AI response', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('Telegram AI reply');

      const sender = makeSender({ platform: 'telegram', userId: '456' });
      const tenant = makeTenant({ chatwoot_api_token: null });

      await handleIncomingMessage(tenant, sender, 'test', '100', mockMessenger);

      expect(mockConversationService.getOrCreate).toHaveBeenCalledWith('t-1', 'telegram', '456', 'Test User');
      expect(mockMessenger.sendTextMessage).toHaveBeenCalledWith(tenant, '456', 'Telegram AI reply');
    });
  });
});

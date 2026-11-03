import { handleWebhook } from '../webhook.controller';
import { conversationService } from '../../conversation/conversation.service';
import { chatwootService } from '../../chatwoot/chatwoot.service';
import { aiService } from '../../ai/ai.service';
import { viberService } from '../viber.service';
import * as businessHoursService from '../../business-hours/business-hours.service';
import { agentTimeoutService } from '../../agent-timeout/agent-timeout.service';

jest.mock('../../conversation/conversation.service');
jest.mock('../../chatwoot/chatwoot.service');
jest.mock('../../ai/ai.service');
jest.mock('../viber.service');
jest.mock('../../business-hours/business-hours.service');
jest.mock('../../agent-timeout/agent-timeout.service');

const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockChatwootService = chatwootService as jest.Mocked<typeof chatwootService>;
const mockAiService = aiService as jest.Mocked<typeof aiService>;
const mockViberService = viberService as jest.Mocked<typeof viberService>;
const mockBusinessHours = businessHoursService as jest.Mocked<typeof businessHoursService>;
const mockAgentTimeout = agentTimeoutService as jest.Mocked<typeof agentTimeoutService>;

const makeTenant = (overrides: any = {}) => ({
  id: 't-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  viber_auth_token: 'vtoken',
  chatwoot_api_token: 'cw-token',
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2,
  timezone: 'Europe/Belgrade',
  working_hours: {},
  handover_keywords: ['agent', 'operater', 'covek'],
  ...overrides,
});

const makeReq = (body: any, tenantOverrides: any = {}) => ({
  tenant: makeTenant(tenantOverrides),
  body,
} as any);

const makeRes = () => {
  const res: any = {};
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('webhook.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: not within working hours, no keyword match
    mockBusinessHours.isWithinWorkingHours.mockReturnValue(false);
    mockBusinessHours.matchesHandoverKeyword.mockReturnValue(false);
  });

  it('acknowledges webhook event and does not process further', async () => {
    const req = makeReq({ event: 'webhook', timestamp: Date.now() });
    const res = makeRes();

    await handleWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ status: 0, status_message: 'ok' });
    expect(mockConversationService.getOrCreate).not.toHaveBeenCalled();
  });

  it('handles conversation_started event', async () => {
    const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
    mockConversationService.getOrCreate.mockResolvedValue(conv as any);
    mockViberService.sendTextMessage.mockResolvedValue(undefined);

    const req = makeReq({
      event: 'conversation_started',
      timestamp: Date.now(),
      sender: { id: 'user-1', name: 'User' },
    });
    const res = makeRes();

    await handleWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ status: 0, status_message: 'ok' });
    expect(mockConversationService.getOrCreate).toHaveBeenCalledWith('t-1', 'user-1', 'User');
    expect(mockViberService.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'user-1',
        authToken: 'vtoken',
      })
    );
  });

  it('skips non-text messages', async () => {
    const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
    mockConversationService.getOrCreate.mockResolvedValue(conv as any);

    const req = makeReq({
      event: 'message',
      timestamp: Date.now(),
      sender: { id: 'user-1', name: 'User' },
      message: { type: 'picture', media: 'http://img.com/pic.jpg' },
    });
    const res = makeRes();

    await handleWebhook(req, res);

    expect(mockConversationService.addMessage).not.toHaveBeenCalled();
    expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
  });

  describe('default flow (off-hours / no config) — AI response', () => {
    it('handles text message — full flow with Chatwoot and AI', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockChatwootService.createConversation.mockResolvedValue(42);
      mockChatwootService.sendMessage.mockResolvedValue(undefined);
      mockAiService.generateResponse.mockResolvedValue('AI odgovor');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 555,
        sender: { id: 'user-1', name: 'User' },
        message: { type: 'text', text: 'Zdravo!' },
      });
      const res = makeRes();

      await handleWebhook(req, res);

      // User message saved
      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'conv-1', 'user', 'Zdravo!', 555
      );
      // Chatwoot conversation created
      expect(mockChatwootService.createConversation).toHaveBeenCalled();
      expect(mockConversationService.setChatwootConversationId).toHaveBeenCalledWith('conv-1', 42);
      // AI called
      expect(mockAiService.generateResponse).toHaveBeenCalled();
      // Reply sent
      expect(mockViberService.sendTextMessage).toHaveBeenCalled();
      // Assistant message saved
      expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2);
    });

    it('works without Chatwoot — AI still responds', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI works');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);

      const tenant = { ...makeTenant(), chatwoot_api_token: null };
      const req = {
        tenant,
        body: {
          event: 'message',
          timestamp: Date.now(),
          message_token: 700,
          sender: { id: 'u-1', name: 'User' },
          message: { type: 'text', text: 'test' },
        },
      } as any;

      await handleWebhook(req, makeRes());

      expect(mockChatwootService.createConversation).not.toHaveBeenCalled();
      expect(mockAiService.generateResponse).toHaveBeenCalled();
      expect(mockViberService.sendTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'AI works' })
      );
    });

    it('backward-compatible: empty working_hours → AI mode', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI reply');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);
      mockBusinessHours.isWithinWorkingHours.mockReturnValue(false);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 100,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'hello' },
      });

      await handleWebhook(req, makeRes());

      expect(mockAiService.generateResponse).toHaveBeenCalled();
      expect(mockAgentTimeout.startTimeout).not.toHaveBeenCalled();
    });

    it('does not crash when AI service throws', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockRejectedValue(new Error('AI exploded'));

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 500,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'test' },
      });

      await expect(handleWebhook(req, makeRes())).resolves.not.toThrow();
      expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
    });
  });

  describe('handover keyword detection', () => {
    it('activates handover when keyword matches', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.setHandover.mockResolvedValue(undefined);
      mockChatwootService.createConversation.mockResolvedValue(42);
      mockChatwootService.addInternalNote.mockResolvedValue(undefined);
      mockViberService.sendTextMessage.mockResolvedValue(undefined);
      mockBusinessHours.matchesHandoverKeyword.mockReturnValue(true);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 100,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'hocu operatera' },
      });

      await handleWebhook(req, makeRes());

      // Should activate handover for 24 hours (1440 minutes)
      expect(mockConversationService.setHandover).toHaveBeenCalledWith('conv-1', 1440);
      // Should send internal note
      expect(mockChatwootService.addInternalNote).toHaveBeenCalled();
      // Should confirm to user
      expect(mockViberService.sendTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('prosleđen'),
        })
      );
      // Should NOT call AI
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });
  });

  describe('handover mode', () => {
    it('forwards to Chatwoot only when in handover mode', async () => {
      const conv = {
        id: 'conv-1',
        is_handover: true,
        chatwoot_conversation_id: 42,
      };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockChatwootService.sendMessage.mockResolvedValue(undefined);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 555,
        sender: { id: 'user-1', name: 'User' },
        message: { type: 'text', text: 'Help me' },
      });
      const res = makeRes();

      await handleWebhook(req, res);

      expect(mockChatwootService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 42, content: 'Help me' })
      );
      expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });

    it('does not call AI service in handover mode', async () => {
      const conv = { id: 'conv-1', is_handover: true, chatwoot_conversation_id: 42 };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockChatwootService.sendMessage.mockResolvedValue(undefined);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 600,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'Help me' },
      });

      await handleWebhook(req, makeRes());

      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
      expect(mockConversationService.getRecentMessages).not.toHaveBeenCalled();
    });
  });

  describe('working hours — route to agent with timeout', () => {
    it('forwards to Chatwoot and starts timeout during working hours', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: 42 };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.setPendingAgent.mockResolvedValue(undefined);
      mockChatwootService.sendMessage.mockResolvedValue(undefined);
      mockAgentTimeout.startTimeout.mockResolvedValue(undefined);
      mockBusinessHours.isWithinWorkingHours.mockReturnValue(true);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 100,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'Imam pitanje' },
      });

      await handleWebhook(req, makeRes());

      // Should forward to Chatwoot
      expect(mockChatwootService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 42,
          content: 'Imam pitanje',
          messageType: 'incoming',
        })
      );
      // Should set pending agent
      expect(mockConversationService.setPendingAgent).toHaveBeenCalledWith('conv-1');
      // Should start timeout
      expect(mockAgentTimeout.startTimeout).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        tenantId: 't-1',
        viberUserId: 'u-1',
        userMessage: 'Imam pitanje',
      });
      // Should NOT call AI
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });

    it('falls back to AI when tenant has no Chatwoot during working hours', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI fallback');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);
      mockBusinessHours.isWithinWorkingHours.mockReturnValue(true);

      const req = makeReq(
        {
          event: 'message',
          timestamp: Date.now(),
          message_token: 100,
          sender: { id: 'u-1', name: 'User' },
          message: { type: 'text', text: 'hello' },
        },
        { chatwoot_api_token: null }
      );

      await handleWebhook(req, makeRes());

      // Should fall through to AI
      expect(mockAiService.generateResponse).toHaveBeenCalled();
      expect(mockAgentTimeout.startTimeout).not.toHaveBeenCalled();
    });
  });

  describe('AI integration', () => {
    it('calls getRecentMessages with conversation id and limit 20', async () => {
      const conv = { id: 'conv-99', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('reply');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 100,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'hello' },
      });

      await handleWebhook(req, makeRes());

      expect(mockConversationService.getRecentMessages).toHaveBeenCalledWith('conv-99', 20);
    });

    it('passes tenant, recent messages and user text to AI service', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      const historyMessages = [
        { id: 'm-1', role: 'user', content: 'previous msg' },
        { id: 'm-2', role: 'assistant', content: 'previous answer' },
      ];

      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue(historyMessages as any);
      mockAiService.generateResponse.mockResolvedValue('AI says hello');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);

      const tenant = makeTenant();
      const req = { tenant, body: {
        event: 'message',
        timestamp: Date.now(),
        message_token: 200,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'Koliko košta?' },
      }} as any;

      await handleWebhook(req, makeRes());

      expect(mockAiService.generateResponse).toHaveBeenCalledWith(
        tenant,
        historyMessages,
        'Koliko košta?'
      );
    });

    it('sends AI response text via Viber', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('Proizvod X košta 100 RSD.');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 300,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'Cena?' },
      });

      await handleWebhook(req, makeRes());

      expect(mockViberService.sendTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Proizvod X košta 100 RSD.',
          receiverId: 'u-1',
          authToken: 'vtoken',
          senderName: 'Test Firm',
        })
      );
    });

    it('saves AI response as assistant message', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('Bot response');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);

      const req = makeReq({
        event: 'message',
        timestamp: Date.now(),
        message_token: 400,
        sender: { id: 'u-1', name: 'User' },
        message: { type: 'text', text: 'test' },
      });

      await handleWebhook(req, makeRes());

      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'conv-1', 'assistant', 'Bot response'
      );
    });
  });
});

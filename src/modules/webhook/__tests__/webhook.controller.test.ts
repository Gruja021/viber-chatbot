import { handleWebhook } from '../webhook.controller';
import { conversationService } from '../../conversation/conversation.service';
import { chatwootService } from '../../chatwoot/chatwoot.service';
import { aiService } from '../../ai/ai.service';
import { viberService } from '../viber.service';

jest.mock('../../conversation/conversation.service');
jest.mock('../../chatwoot/chatwoot.service');
jest.mock('../../ai/ai.service');
jest.mock('../viber.service');

const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockChatwootService = chatwootService as jest.Mocked<typeof chatwootService>;
const mockAiService = aiService as jest.Mocked<typeof aiService>;
const mockViberService = viberService as jest.Mocked<typeof viberService>;

const makeTenant = () => ({
  id: 't-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  viber_auth_token: 'vtoken',
  chatwoot_api_token: 'cw-token',
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2,
});

const makeReq = (body: any) => ({
  tenant: makeTenant(),
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

  it('handles text message — full flow with Chatwoot', async () => {
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
    // Reply sent
    expect(mockViberService.sendTextMessage).toHaveBeenCalled();
    // Assistant message saved
    expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2);
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

      // Second addMessage call should save assistant response
      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'conv-1', 'assistant', 'Bot response'
      );
    });

    it('does not crash when AI service throws — error caught in try/catch', async () => {
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

      // Should not throw — handleWebhook has try/catch
      await expect(handleWebhook(req, makeRes())).resolves.not.toThrow();

      // Viber message should NOT be sent since generateResponse threw
      expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
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

    it('works without Chatwoot — AI still responds', async () => {
      const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
      mockConversationService.getOrCreate.mockResolvedValue(conv as any);
      mockConversationService.addMessage.mockResolvedValue({} as any);
      mockConversationService.getRecentMessages.mockResolvedValue([]);
      mockAiService.generateResponse.mockResolvedValue('AI works');
      mockViberService.sendTextMessage.mockResolvedValue(undefined);

      // Tenant bez Chatwoot tokena
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

      // Chatwoot should not be called
      expect(mockChatwootService.createConversation).not.toHaveBeenCalled();
      expect(mockChatwootService.sendMessage).not.toHaveBeenCalled();

      // AI and Viber should still work
      expect(mockAiService.generateResponse).toHaveBeenCalled();
      expect(mockViberService.sendTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'AI works' })
      );
      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'conv-1', 'assistant', 'AI works'
      );
    });
  });

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

    // Should forward to Chatwoot
    expect(mockChatwootService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 42, content: 'Help me' })
    );
    // Should NOT send Viber reply (human handles it)
    expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
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

    // getOrCreate is called but addMessage is NOT (non-text skipped)
    expect(mockConversationService.addMessage).not.toHaveBeenCalled();
    expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
  });

  it('skips non-text messages — AI not called', async () => {
    const conv = { id: 'conv-1', is_handover: false, chatwoot_conversation_id: null };
    mockConversationService.getOrCreate.mockResolvedValue(conv as any);

    const req = makeReq({
      event: 'message',
      timestamp: Date.now(),
      sender: { id: 'user-1', name: 'User' },
      message: { type: 'picture', media: 'http://img.com/pic.jpg' },
    });

    await handleWebhook(req, makeRes());

    expect(mockAiService.generateResponse).not.toHaveBeenCalled();
  });
});

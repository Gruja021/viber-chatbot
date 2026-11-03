import { handleWebhook } from '../webhook.controller';
import { conversationService } from '../../conversation/conversation.service';
import { chatwootService } from '../../chatwoot/chatwoot.service';
import { viberService } from '../viber.service';

jest.mock('../../conversation/conversation.service');
jest.mock('../../chatwoot/chatwoot.service');
jest.mock('../viber.service');

const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockChatwootService = chatwootService as jest.Mocked<typeof chatwootService>;
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
    mockChatwootService.createConversation.mockResolvedValue(42);
    mockChatwootService.sendMessage.mockResolvedValue(undefined);
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
});

import { handleChatwootWebhook } from '../chatwoot.webhook.controller';
import { conversationService } from '../../conversation/conversation.service';
import { agentTimeoutService } from '../../agent-timeout/agent-timeout.service';
import { viberService } from '../../webhook/viber.service';
import { tenantService } from '../../tenant/tenant.service';

jest.mock('../../conversation/conversation.service');
jest.mock('../../agent-timeout/agent-timeout.service');
jest.mock('../../webhook/viber.service');
jest.mock('../../tenant/tenant.service');

const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockAgentTimeoutService = agentTimeoutService as jest.Mocked<typeof agentTimeoutService>;
const mockViberService = viberService as jest.Mocked<typeof viberService>;
const mockTenantService = tenantService as jest.Mocked<typeof tenantService>;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = (body: any) => ({ body } as any);

describe('chatwoot.webhook.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('acknowledges with 200 immediately', async () => {
    const res = makeRes();
    await handleChatwootWebhook(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('ignores non-message_created events', async () => {
    const res = makeRes();
    await handleChatwootWebhook(makeReq({ event: 'conversation_created' }), res);
    expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
  });

  it('ignores incoming messages (non-outgoing)', async () => {
    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'incoming',
    }), res);
    expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
  });

  it('ignores agent_bot sender type', async () => {
    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'agent_bot' },
      conversation: { id: 42 },
      content: 'Bot reply',
    }), res);
    expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
  });

  it('ignores messages starting with [AI Bot', async () => {
    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'user' },
      conversation: { id: 42 },
      content: '[AI Bot - agent timeout] Some AI response',
    }), res);
    expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
  });

  it('processes agent response: cancels timeout, forwards to Viber, saves message', async () => {
    const conversation = {
      id: 'conv-1',
      tenant_id: 't-1',
      viber_user_id: 'user-1',
      viber_user_name: 'User',
      chatwoot_conversation_id: 42,
      is_handover: false,
      handover_until: null,
      pending_agent_response: true,
      agent_routed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    const tenant = {
      id: 't-1',
      slug: 'test',
      firm_name: 'Test Firm',
      viber_auth_token: 'vtoken',
    };

    mockConversationService.findByChatwootConversationId.mockResolvedValue(conversation as any);
    mockAgentTimeoutService.cancelTimeout.mockResolvedValue(undefined);
    mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
    mockTenantService.getById.mockResolvedValue(tenant as any);
    mockViberService.sendTextMessage.mockResolvedValue(undefined);
    mockConversationService.addMessage.mockResolvedValue({} as any);

    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'user', name: 'Agent Name' },
      conversation: { id: 42 },
      content: 'Agent reply here',
    }), res);

    // Should cancel timeout
    expect(mockAgentTimeoutService.cancelTimeout).toHaveBeenCalledWith('conv-1');

    // Should clear pending
    expect(mockConversationService.clearPendingAgent).toHaveBeenCalledWith('conv-1');

    // Should forward to Viber
    expect(mockViberService.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: 'vtoken',
        receiverId: 'user-1',
        text: 'Agent reply here',
        senderName: 'Test Firm',
      })
    );

    // Should save message
    expect(mockConversationService.addMessage).toHaveBeenCalledWith(
      'conv-1', 'assistant', 'Agent reply here', null, { source: 'chatwoot_agent' }
    );
  });

  it('does nothing when conversation not found', async () => {
    mockConversationService.findByChatwootConversationId.mockResolvedValue(null);

    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'user' },
      conversation: { id: 999 },
      content: 'Agent reply',
    }), res);

    expect(mockAgentTimeoutService.cancelTimeout).not.toHaveBeenCalled();
    expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
  });
});

import { handleChatwootWebhook } from '../chatwoot.webhook.controller';
import { conversationService } from '../../conversation/conversation.service';
import { agentTimeoutService } from '../../agent-timeout/agent-timeout.service';
import { viberService } from '../../webhook/viber.service';
import { telegramService } from '../../webhook/telegram.service';
import { tenantService } from '../../tenant/tenant.service';

jest.mock('../../conversation/conversation.service');
jest.mock('../../agent-timeout/agent-timeout.service');
jest.mock('../../webhook/viber.service');
jest.mock('../../webhook/telegram.service');
jest.mock('../../tenant/tenant.service');

const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockAgentTimeoutService = agentTimeoutService as jest.Mocked<typeof agentTimeoutService>;
const mockViberService = viberService as jest.Mocked<typeof viberService>;
const mockTelegramService = telegramService as jest.Mocked<typeof telegramService>;
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

  it('processes agent response for Viber: cancels timeout, sets human_active, forwards to Viber, saves message', async () => {
    const conversation = {
      id: 'conv-1',
      tenant_id: 't-1',
      platform: 'viber' as const,
      platform_user_id: 'user-1',
      platform_user_name: 'User',
      chatwoot_conversation_id: 42,
      is_handover: false,
      handover_until: null,
      pending_agent_response: true,
      agent_routed_at: new Date(),
      conversation_status: 'pending_human',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const tenant = {
      id: 't-1',
      slug: 'test',
      firm_name: 'Test Firm',
      viber_auth_token: 'vtoken',
      telegram_bot_token: null,
    };

    mockConversationService.findByChatwootConversationId.mockResolvedValue(conversation as any);
    mockAgentTimeoutService.cancelTimeout.mockResolvedValue(undefined);
    mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
    mockConversationService.setStatus.mockResolvedValue(undefined);
    mockConversationService.invalidateCache.mockResolvedValue(undefined);
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

    expect(mockAgentTimeoutService.cancelTimeout).toHaveBeenCalledWith('conv-1');
    expect(mockConversationService.clearPendingAgent).toHaveBeenCalledWith('conv-1');
    expect(mockConversationService.setStatus).toHaveBeenCalledWith('conv-1', 'human_active');
    expect(mockConversationService.invalidateCache).toHaveBeenCalledWith('t-1', 'viber', 'user-1');
    expect(mockViberService.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: 'vtoken',
        receiverId: 'user-1',
        text: 'Agent reply here',
        senderName: 'Test Firm',
      })
    );
    expect(mockConversationService.addMessage).toHaveBeenCalledWith(
      'conv-1', 'assistant', 'Agent reply here', null, { source: 'chatwoot_agent' }
    );
  });

  it('processes agent response for Telegram: forwards to Telegram', async () => {
    const conversation = {
      id: 'conv-2',
      tenant_id: 't-1',
      platform: 'telegram' as const,
      platform_user_id: '789',
      platform_user_name: 'TG User',
      chatwoot_conversation_id: 55,
      is_handover: false,
      handover_until: null,
      pending_agent_response: true,
      agent_routed_at: new Date(),
      conversation_status: 'pending_human',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const tenant = {
      id: 't-1',
      slug: 'test',
      firm_name: 'Test Firm',
      viber_auth_token: null,
      telegram_bot_token: 'tg-token',
    };

    mockConversationService.findByChatwootConversationId.mockResolvedValue(conversation as any);
    mockAgentTimeoutService.cancelTimeout.mockResolvedValue(undefined);
    mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
    mockConversationService.setStatus.mockResolvedValue(undefined);
    mockConversationService.invalidateCache.mockResolvedValue(undefined);
    mockTenantService.getById.mockResolvedValue(tenant as any);
    mockTelegramService.sendTextMessage.mockResolvedValue(undefined);
    mockConversationService.addMessage.mockResolvedValue({} as any);

    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'user', name: 'Agent' },
      conversation: { id: 55 },
      content: 'Telegram agent reply',
    }), res);

    expect(mockTelegramService.sendTextMessage).toHaveBeenCalledWith(
      'tg-token', '789', 'Telegram agent reply'
    );
    expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
    expect(mockConversationService.addMessage).toHaveBeenCalledWith(
      'conv-2', 'assistant', 'Telegram agent reply', null, { source: 'chatwoot_agent' }
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
    expect(mockTelegramService.sendTextMessage).not.toHaveBeenCalled();
  });

  it('ignores outgoing messages with no content', async () => {
    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'user' },
      conversation: { id: 42 },
      content: '',
    }), res);
    expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
  });

  it('ignores outgoing messages with null content', async () => {
    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'user' },
      conversation: { id: 42 },
      content: null,
    }), res);
    expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
  });

  it('ignores outgoing messages with no conversation.id', async () => {
    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'user' },
      conversation: {},
      content: 'Agent reply',
    }), res);
    expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
  });

  it('does not forward to user when tenant not found', async () => {
    const conversation = {
      id: 'conv-1',
      tenant_id: 't-missing',
      platform: 'viber' as const,
      platform_user_id: 'user-1',
      platform_user_name: 'User',
      chatwoot_conversation_id: 42,
      is_handover: false,
      handover_until: null,
      pending_agent_response: true,
      agent_routed_at: new Date(),
      conversation_status: 'pending_human',
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockConversationService.findByChatwootConversationId.mockResolvedValue(conversation as any);
    mockAgentTimeoutService.cancelTimeout.mockResolvedValue(undefined);
    mockConversationService.clearPendingAgent.mockResolvedValue(undefined);
    mockConversationService.setStatus.mockResolvedValue(undefined);
    mockTenantService.getById.mockResolvedValue(null);

    const res = makeRes();
    await handleChatwootWebhook(makeReq({
      event: 'message_created',
      message_type: 'outgoing',
      sender: { type: 'user', name: 'Agent' },
      conversation: { id: 42 },
      content: 'Agent reply',
    }), res);

    expect(mockAgentTimeoutService.cancelTimeout).toHaveBeenCalledWith('conv-1');
    expect(mockViberService.sendTextMessage).not.toHaveBeenCalled();
    expect(mockTelegramService.sendTextMessage).not.toHaveBeenCalled();
  });

  describe('conversation_resolved', () => {
    it('sets status to closed on conversation_status_changed resolved', async () => {
      const conversation = {
        id: 'conv-1',
        tenant_id: 't-1',
        platform: 'viber' as const,
        platform_user_id: 'user-1',
        chatwoot_conversation_id: 42,
      };

      mockConversationService.findByChatwootConversationId.mockResolvedValue(conversation as any);
      mockConversationService.setStatus.mockResolvedValue(undefined);
      mockConversationService.invalidateCache.mockResolvedValue(undefined);

      const res = makeRes();
      await handleChatwootWebhook(makeReq({
        event: 'conversation_status_changed',
        status: 'resolved',
        id: 42,
      }), res);

      expect(mockConversationService.setStatus).toHaveBeenCalledWith('conv-1', 'closed');
      expect(mockConversationService.invalidateCache).toHaveBeenCalledWith('t-1', 'viber', 'user-1');
    });

    it('does nothing when resolved conversation not found', async () => {
      mockConversationService.findByChatwootConversationId.mockResolvedValue(null);

      const res = makeRes();
      await handleChatwootWebhook(makeReq({
        event: 'conversation_status_changed',
        status: 'resolved',
        id: 999,
      }), res);

      expect(mockConversationService.setStatus).not.toHaveBeenCalled();
    });

    it('uses conversation.id as fallback when payload.id is missing', async () => {
      const conversation = {
        id: 'conv-1',
        tenant_id: 't-1',
        platform: 'viber' as const,
        platform_user_id: 'user-1',
        chatwoot_conversation_id: 42,
      };

      mockConversationService.findByChatwootConversationId.mockResolvedValue(conversation as any);
      mockConversationService.setStatus.mockResolvedValue(undefined);
      mockConversationService.invalidateCache.mockResolvedValue(undefined);

      const res = makeRes();
      await handleChatwootWebhook(makeReq({
        event: 'conversation_status_changed',
        status: 'resolved',
        conversation: { id: 42 },
        // no top-level id
      }), res);

      expect(mockConversationService.findByChatwootConversationId).toHaveBeenCalledWith(42);
      expect(mockConversationService.setStatus).toHaveBeenCalledWith('conv-1', 'closed');
    });

    it('does nothing when resolved payload has no id at all', async () => {
      const res = makeRes();
      await handleChatwootWebhook(makeReq({
        event: 'conversation_status_changed',
        status: 'resolved',
        // no id, no conversation
      }), res);

      expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
    });

    it('ignores non-resolved status changes', async () => {
      const res = makeRes();
      await handleChatwootWebhook(makeReq({
        event: 'conversation_status_changed',
        status: 'open',
        id: 42,
      }), res);

      expect(mockConversationService.findByChatwootConversationId).not.toHaveBeenCalled();
    });
  });
});

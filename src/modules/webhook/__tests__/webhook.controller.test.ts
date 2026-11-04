import { handleWebhook } from '../webhook.controller';
import * as messageHandler from '../message-handler';
import { viberService } from '../viber.service';

jest.mock('../message-handler');
jest.mock('../viber.service');

const mockHandleIncoming = messageHandler.handleIncomingMessage as jest.MockedFunction<typeof messageHandler.handleIncomingMessage>;
const mockHandleWelcome = messageHandler.handleWelcomeMessage as jest.MockedFunction<typeof messageHandler.handleWelcomeMessage>;

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
    mockHandleIncoming.mockResolvedValue(undefined);
    mockHandleWelcome.mockResolvedValue(undefined);
  });

  it('acknowledges webhook event and does not process further', async () => {
    const req = makeReq({ event: 'webhook', timestamp: Date.now() });
    const res = makeRes();

    await handleWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ status: 0, status_message: 'ok' });
    expect(mockHandleWelcome).not.toHaveBeenCalled();
    expect(mockHandleIncoming).not.toHaveBeenCalled();
  });

  it('handles conversation_started event', async () => {
    const req = makeReq({
      event: 'conversation_started',
      timestamp: Date.now(),
      sender: { id: 'user-1', name: 'User' },
    });
    const res = makeRes();

    await handleWebhook(req, res);
    expect(res.json).toHaveBeenCalledWith({ status: 0, status_message: 'ok' });
    expect(mockHandleWelcome).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        platform: 'viber',
        userId: 'user-1',
        userName: 'User',
      }),
      expect.anything()
    );
  });

  it('skips non-text messages', async () => {
    const req = makeReq({
      event: 'message',
      timestamp: Date.now(),
      sender: { id: 'user-1', name: 'User' },
      message: { type: 'picture', media: 'http://img.com/pic.jpg' },
    });
    const res = makeRes();

    await handleWebhook(req, res);

    expect(mockHandleIncoming).not.toHaveBeenCalled();
  });

  it('handles text message — delegates to message handler', async () => {
    const req = makeReq({
      event: 'message',
      timestamp: Date.now(),
      message_token: 555,
      sender: { id: 'user-1', name: 'User' },
      message: { type: 'text', text: 'Zdravo!' },
    });
    const res = makeRes();

    await handleWebhook(req, res);

    expect(mockHandleIncoming).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        platform: 'viber',
        userId: 'user-1',
        userName: 'User',
      }),
      'Zdravo!',
      '555',
      expect.anything()
    );
  });

  it('converts message_token to string', async () => {
    const req = makeReq({
      event: 'message',
      timestamp: Date.now(),
      message_token: 12345,
      sender: { id: 'u-1', name: 'User' },
      message: { type: 'text', text: 'test' },
    });

    await handleWebhook(req, makeRes());

    expect(mockHandleIncoming).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'test',
      '12345',
      expect.anything()
    );
  });

  it('does not crash when handler throws', async () => {
    mockHandleIncoming.mockRejectedValue(new Error('boom'));

    const req = makeReq({
      event: 'message',
      timestamp: Date.now(),
      message_token: 500,
      sender: { id: 'u-1', name: 'User' },
      message: { type: 'text', text: 'test' },
    });

    await expect(handleWebhook(req, makeRes())).resolves.not.toThrow();
  });
});

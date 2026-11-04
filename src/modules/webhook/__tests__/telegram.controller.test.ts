import { handleTelegramWebhook } from '../telegram.controller';
import * as messageHandler from '../message-handler';

jest.mock('../message-handler');
jest.mock('../telegram.service');

const mockHandleIncoming = messageHandler.handleIncomingMessage as jest.MockedFunction<typeof messageHandler.handleIncomingMessage>;
const mockHandleWelcome = messageHandler.handleWelcomeMessage as jest.MockedFunction<typeof messageHandler.handleWelcomeMessage>;

const makeTenant = (overrides: any = {}) => ({
  id: 't-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  telegram_bot_token: 'tg-token',
  ...overrides,
});

const makeReq = (body: any, tenantOverrides: any = {}) => ({
  tenant: makeTenant(tenantOverrides),
  body,
} as any);

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('telegram.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleIncoming.mockResolvedValue(undefined);
    mockHandleWelcome.mockResolvedValue(undefined);
  });

  it('acknowledges immediately with 200', async () => {
    const res = makeRes();
    await handleTelegramWebhook(makeReq({ update_id: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('ignores non-text messages', async () => {
    const res = makeRes();
    await handleTelegramWebhook(makeReq({
      update_id: 1,
      message: {
        message_id: 100,
        chat: { id: 123, type: 'private' },
        date: 1234567890,
        // no text, no from
      },
    }), res);

    expect(mockHandleIncoming).not.toHaveBeenCalled();
    expect(mockHandleWelcome).not.toHaveBeenCalled();
  });

  it('handles /start as welcome message', async () => {
    const res = makeRes();
    await handleTelegramWebhook(makeReq({
      update_id: 1,
      message: {
        message_id: 100,
        from: { id: 456, is_bot: false, first_name: 'John', last_name: 'Doe' },
        chat: { id: 456, type: 'private' },
        date: 1234567890,
        text: '/start',
      },
    }), res);

    expect(mockHandleWelcome).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        platform: 'telegram',
        userId: '456',
        userName: 'John Doe',
      }),
      expect.anything()
    );
    expect(mockHandleIncoming).not.toHaveBeenCalled();
  });

  it('handles regular text message', async () => {
    const res = makeRes();
    await handleTelegramWebhook(makeReq({
      update_id: 2,
      message: {
        message_id: 101,
        from: { id: 789, is_bot: false, first_name: 'Jane' },
        chat: { id: 789, type: 'private' },
        date: 1234567890,
        text: 'Zdravo!',
      },
    }), res);

    expect(mockHandleIncoming).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        platform: 'telegram',
        userId: '789',
        userName: 'Jane',
      }),
      'Zdravo!',
      '101',
      expect.anything()
    );
  });

  it('does not crash on error', async () => {
    mockHandleIncoming.mockRejectedValue(new Error('boom'));

    const res = makeRes();
    await expect(handleTelegramWebhook(makeReq({
      update_id: 3,
      message: {
        message_id: 102,
        from: { id: 1, is_bot: false, first_name: 'X' },
        chat: { id: 1, type: 'private' },
        date: 1234567890,
        text: 'test',
      },
    }), res)).resolves.not.toThrow();
  });
});

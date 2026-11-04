import request from 'supertest';
import { app } from '../../../app';
import { tenantService } from '../../tenant/tenant.service';
import { telegramService } from '../telegram.service';
import * as messageHandler from '../message-handler';
import { checkDatabaseConnection } from '../../../config/database';
import { checkRedisConnection } from '../../../config/redis';

jest.mock('../../tenant/tenant.service');
jest.mock('../telegram.service');
jest.mock('../message-handler');

const mockTenantService = tenantService as jest.Mocked<typeof tenantService>;
const mockTelegramService = telegramService as jest.Mocked<typeof telegramService>;
const mockHandleIncoming = messageHandler.handleIncomingMessage as jest.MockedFunction<typeof messageHandler.handleIncomingMessage>;
const mockHandleWelcome = messageHandler.handleWelcomeMessage as jest.MockedFunction<typeof messageHandler.handleWelcomeMessage>;
const mockCheckDb = checkDatabaseConnection as jest.MockedFunction<typeof checkDatabaseConnection>;
const mockCheckRedis = checkRedisConnection as jest.MockedFunction<typeof checkRedisConnection>;

const mockTenant = {
  id: 't-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  viber_auth_token: null,
  telegram_bot_token: 'tg-bot-token-123',
  status: 'active' as const,
  chatwoot_api_token: null,
  chatwoot_account_id: null,
  chatwoot_inbox_id: null,
  database_type: null,
  database_credentials: null,
  system_prompt: 'You are helpful.',
  timezone: 'Europe/Belgrade',
  working_hours: {},
  handover_keywords: [],
  created_at: new Date(),
  updated_at: new Date(),
};

describe('telegram.routes integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleIncoming.mockResolvedValue(undefined);
    mockHandleWelcome.mockResolvedValue(undefined);
  });

  describe('POST /api/telegram/webhook/:tenantSlug', () => {
    it('returns 200 for valid Telegram update', async () => {
      mockTenantService.getBySlug.mockResolvedValue(mockTenant as any);

      const res = await request(app)
        .post('/api/telegram/webhook/test-tenant')
        .send({
          update_id: 1,
          message: {
            message_id: 100,
            from: { id: 456, is_bot: false, first_name: 'John' },
            chat: { id: 456, type: 'private' },
            date: 1234567890,
            text: 'Zdravo',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('calls handleIncomingMessage for text messages', async () => {
      mockTenantService.getBySlug.mockResolvedValue(mockTenant as any);

      await request(app)
        .post('/api/telegram/webhook/test-tenant')
        .send({
          update_id: 2,
          message: {
            message_id: 101,
            from: { id: 789, is_bot: false, first_name: 'Jane' },
            chat: { id: 789, type: 'private' },
            date: 1234567890,
            text: 'Pitanje',
          },
        });

      expect(mockHandleIncoming).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          platform: 'telegram',
          userId: '789',
          userName: 'Jane',
        }),
        'Pitanje',
        '101',
        expect.anything()
      );
    });

    it('calls handleWelcomeMessage for /start command', async () => {
      mockTenantService.getBySlug.mockResolvedValue(mockTenant as any);

      await request(app)
        .post('/api/telegram/webhook/test-tenant')
        .send({
          update_id: 3,
          message: {
            message_id: 102,
            from: { id: 111, is_bot: false, first_name: 'Marko' },
            chat: { id: 111, type: 'private' },
            date: 1234567890,
            text: '/start',
          },
        });

      expect(mockHandleWelcome).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          platform: 'telegram',
          userId: '111',
          userName: 'Marko',
        }),
        expect.anything()
      );
      expect(mockHandleIncoming).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown tenant', async () => {
      mockTenantService.getBySlug.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/telegram/webhook/unknown-tenant')
        .send({ update_id: 1 });

      expect(res.status).toBe(404);
    });

    it('returns 200 for non-text messages without processing', async () => {
      mockTenantService.getBySlug.mockResolvedValue(mockTenant as any);

      const res = await request(app)
        .post('/api/telegram/webhook/test-tenant')
        .send({
          update_id: 4,
          message: {
            message_id: 103,
            chat: { id: 456, type: 'private' },
            date: 1234567890,
            // no text, no from
          },
        });

      expect(res.status).toBe(200);
      expect(mockHandleIncoming).not.toHaveBeenCalled();
      expect(mockHandleWelcome).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/telegram/register-webhook', () => {
    it('returns 401 when no authorization header', async () => {
      const res = await request(app)
        .post('/api/telegram/register-webhook')
        .send({ tenant_id: 't-1' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when token is invalid', async () => {
      const res = await request(app)
        .post('/api/telegram/register-webhook')
        .set('Authorization', 'Bearer wrong-token')
        .send({ tenant_id: 't-1' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when tenant_id is missing', async () => {
      const res = await request(app)
        .post('/api/telegram/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tenant_id is required');
    });

    it('returns 404 when tenant not found', async () => {
      mockTenantService.getById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/telegram/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 'nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tenant not found');
    });

    it('returns 400 when tenant has no telegram_bot_token', async () => {
      mockTenantService.getById.mockResolvedValue({
        ...mockTenant,
        telegram_bot_token: null,
      } as any);

      const res = await request(app)
        .post('/api/telegram/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Tenant has no telegram_bot_token configured');
    });

    it('registers webhook and returns webhook_url', async () => {
      mockTenantService.getById.mockResolvedValue(mockTenant as any);
      mockTelegramService.setWebhook.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/telegram/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Telegram webhook registered');
      expect(res.body.webhook_url).toBe('https://test.example.com/api/telegram/webhook/test-tenant');
      expect(mockTelegramService.setWebhook).toHaveBeenCalledWith(
        'tg-bot-token-123',
        'https://test.example.com/api/telegram/webhook/test-tenant'
      );
    });

    it('returns 500 on unexpected error', async () => {
      mockTenantService.getById.mockRejectedValue(new Error('DB down'));

      const res = await request(app)
        .post('/api/telegram/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1' });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/telegram/test-message', () => {
    it('returns 401 when no authorization header', async () => {
      const res = await request(app)
        .post('/api/telegram/test-message')
        .send({ tenant_id: 't-1', chat_id: '123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer wrong-token')
        .send({ tenant_id: 't-1', chat_id: '123' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when tenant_id is missing', async () => {
      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ chat_id: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tenant_id and chat_id are required');
    });

    it('returns 400 when chat_id is missing', async () => {
      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tenant_id and chat_id are required');
    });

    it('returns 404 when tenant not found', async () => {
      mockTenantService.getById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 'nonexistent', chat_id: '123' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tenant not found');
    });

    it('returns 400 when tenant has no telegram_bot_token', async () => {
      mockTenantService.getById.mockResolvedValue({
        ...mockTenant,
        telegram_bot_token: null,
      } as any);

      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1', chat_id: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Tenant has no telegram_bot_token configured');
    });

    it('sends test message and returns bot info', async () => {
      mockTenantService.getById.mockResolvedValue(mockTenant as any);
      mockTelegramService.getMe.mockResolvedValue({
        id: 999,
        first_name: 'TestBot',
        username: 'test_bot',
      });
      mockTelegramService.sendTextMessage.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1', chat_id: '456' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Test message sent');
      expect(res.body.bot_username).toBe('test_bot');
      expect(res.body.bot_name).toBe('TestBot');
      expect(mockTelegramService.sendTextMessage).toHaveBeenCalledWith(
        'tg-bot-token-123',
        '456',
        expect.stringContaining('Test Firm')
      );
    });

    it('returns 500 when getMe fails', async () => {
      mockTenantService.getById.mockResolvedValue(mockTenant as any);
      mockTelegramService.getMe.mockRejectedValue(new Error('Unauthorized'));

      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1', chat_id: '456' });

      expect(res.status).toBe(500);
    });

    it('returns 500 when sendTextMessage fails', async () => {
      mockTenantService.getById.mockResolvedValue(mockTenant as any);
      mockTelegramService.getMe.mockResolvedValue({
        id: 999,
        first_name: 'TestBot',
        username: 'test_bot',
      });
      mockTelegramService.sendTextMessage.mockRejectedValue(new Error('Chat not found'));

      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1', chat_id: 'bad-chat' });

      expect(res.status).toBe(500);
    });

    it('returns 500 on unexpected DB error', async () => {
      mockTenantService.getById.mockRejectedValue(new Error('DB down'));

      const res = await request(app)
        .post('/api/telegram/test-message')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1', chat_id: '123' });

      expect(res.status).toBe(500);
    });
  });
});

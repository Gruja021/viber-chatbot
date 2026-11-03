import crypto from 'crypto';
import request from 'supertest';
import { app } from '../../../app';
import { tenantService } from '../../tenant/tenant.service';
import { conversationService } from '../../conversation/conversation.service';
import { viberService } from '../viber.service';
import { checkDatabaseConnection } from '../../../config/database';
import { checkRedisConnection } from '../../../config/redis';

jest.mock('../../tenant/tenant.service');
jest.mock('../../conversation/conversation.service');
jest.mock('../viber.service');

const mockTenantService = tenantService as jest.Mocked<typeof tenantService>;
const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockViberService = viberService as jest.Mocked<typeof viberService>;
const mockCheckDb = checkDatabaseConnection as jest.MockedFunction<typeof checkDatabaseConnection>;
const mockCheckRedis = checkRedisConnection as jest.MockedFunction<typeof checkRedisConnection>;

const mockTenant = {
  id: 't-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  viber_auth_token: 'test-viber-token',
  status: 'active' as const,
  chatwoot_api_token: null,
  chatwoot_account_id: null,
  chatwoot_inbox_id: null,
  database_type: null,
  database_credentials: null,
  system_prompt: 'You are helpful.',
  created_at: new Date(),
  updated_at: new Date(),
};

function signBody(body: object, token: string): string {
  const raw = JSON.stringify(body);
  return crypto.createHmac('sha256', token).update(raw).digest('hex');
}

describe('webhook.routes integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/viber/webhook/:tenantSlug', () => {
    it('returns 200 with valid signature', async () => {
      mockTenantService.getBySlug.mockResolvedValue(mockTenant as any);
      mockConversationService.getOrCreate.mockResolvedValue({ id: 'conv-1' } as any);
      mockViberService.sendTextMessage.mockResolvedValue(undefined);

      const body = { event: 'webhook', timestamp: Date.now() };
      const sig = signBody(body, mockTenant.viber_auth_token);

      const res = await request(app)
        .post('/api/viber/webhook/test-tenant')
        .set('x-viber-content-signature', sig)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(0);
    });

    it('returns 403 with invalid signature', async () => {
      mockTenantService.getBySlug.mockResolvedValue(mockTenant as any);

      const body = { event: 'webhook', timestamp: Date.now() };

      const res = await request(app)
        .post('/api/viber/webhook/test-tenant')
        .set('x-viber-content-signature', 'bad-signature')
        .send(body);

      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown tenant', async () => {
      mockTenantService.getBySlug.mockResolvedValue(null);

      const body = { event: 'webhook', timestamp: Date.now() };

      const res = await request(app)
        .post('/api/viber/webhook/unknown-tenant')
        .set('x-viber-content-signature', 'any-sig')
        .send(body);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/viber/register-webhook', () => {
    it('returns 401 when no authorization header', async () => {
      const res = await request(app)
        .post('/api/viber/register-webhook')
        .send({ tenant_id: 'uuid-1' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 401 when token is invalid', async () => {
      const res = await request(app)
        .post('/api/viber/register-webhook')
        .set('Authorization', 'Bearer wrong-token')
        .send({ tenant_id: 'uuid-1' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 400 when tenant_id is missing', async () => {
      const res = await request(app)
        .post('/api/viber/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tenant_id is required');
    });

    it('returns 404 when tenant not found', async () => {
      mockTenantService.getById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/viber/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 'nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tenant not found');
    });

    it('registers webhook and returns webhook_url', async () => {
      mockTenantService.getById.mockResolvedValue({
        ...mockTenant,
        timezone: 'Europe/Belgrade',
        working_hours: {},
        handover_keywords: [],
      } as any);
      mockViberService.setWebhook.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/viber/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 't-1' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Webhook registered');
      expect(res.body.webhook_url).toBe('https://test.example.com/api/viber/webhook/test-tenant');
      expect(mockViberService.setWebhook).toHaveBeenCalledWith(
        'test-viber-token',
        'https://test.example.com/api/viber/webhook/test-tenant'
      );
    });

    it('returns 500 on unexpected error', async () => {
      mockTenantService.getById.mockRejectedValue(new Error('DB down'));

      const res = await request(app)
        .post('/api/viber/register-webhook')
        .set('Authorization', 'Bearer test-admin-token')
        .send({ tenant_id: 'uuid-1' });

      expect(res.status).toBe(500);
    });
  });

  describe('GET /health', () => {
    it('returns 200 when all services are healthy', async () => {
      mockCheckDb.mockResolvedValue(true);
      mockCheckRedis.mockResolvedValue(true);

      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
      expect(res.body.redis).toBe('connected');
    });

    it('returns 503 when database is down', async () => {
      mockCheckDb.mockResolvedValue(false);
      mockCheckRedis.mockResolvedValue(true);

      const res = await request(app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
    });
  });
});

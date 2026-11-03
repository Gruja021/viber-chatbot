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

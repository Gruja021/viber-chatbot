import request from 'supertest';
import { app } from '../../../app';
import { tenantService } from '../tenant.service';
import { checkTenantHealth } from '../tenant.health';
import { chatwootProvisioningService } from '../../chatwoot/chatwoot.provisioning';
import { aiCreditsService } from '../../ai-credits/ai-credits.service';

jest.mock('../tenant.service');
jest.mock('../tenant.health');
jest.mock('../../chatwoot/chatwoot.provisioning');
jest.mock('../../ai-credits/ai-credits.service');
const mockService = tenantService as jest.Mocked<typeof tenantService>;
const mockCheckTenantHealth = checkTenantHealth as jest.MockedFunction<typeof checkTenantHealth>;
const mockProvisioning = chatwootProvisioningService as jest.Mocked<typeof chatwootProvisioningService>;
const mockAiCredits = aiCreditsService as jest.Mocked<typeof aiCreditsService>;

const AUTH_HEADER = `Bearer test-admin-token`;

import { env } from '../../../config/env';

const mockPublicTenant = {
  id: 'uuid-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  database_type: null,
  system_prompt: 'You are helpful.',
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2,
  agent_timeout_seconds: 180,
  chatwoot_setup_status: 'none' as const,
  chatwoot_setup_error: null,
  status: 'active' as const,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

const mockFullTenant = {
  ...mockPublicTenant,
  viber_auth_token: 'vtoken',
  telegram_bot_token: null,
  database_credentials: null,
  chatwoot_api_token: 'cw-token',
  timezone: 'Europe/Belgrade',
  working_hours: {},
  handover_keywords: [],
};

describe('tenant.routes integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/tenants', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/tenants');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 200 with tenants list', async () => {
      mockService.getAll.mockResolvedValue([mockPublicTenant as any]);

      const res = await request(app)
        .get('/api/tenants')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].slug).toBe('test-tenant');
    });
  });

  describe('GET /api/tenants/:id', () => {
    it('returns 404 when tenant not found', async () => {
      mockService.getPublicById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/tenants/nonexistent')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });

    it('returns 200 with tenant', async () => {
      mockService.getPublicById.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .get('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('test-tenant');
    });
  });

  describe('POST /api/tenants', () => {
    it('returns 201 on successful creation', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'test-tenant',
          firm_name: 'Test Firm',
          viber_auth_token: 'token-123',
        });

      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('test-tenant');
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'only-slug' });

      expect(res.status).toBe(400);
    });

    it('returns 409 on duplicate slug/token', async () => {
      const error: any = new Error('duplicate');
      error.code = '23505';
      mockService.create.mockRejectedValue(error);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'existing',
          firm_name: 'Firm',
          viber_auth_token: 'dup-token',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/tenants/:id', () => {
    it('returns 200 on successful update', async () => {
      mockService.update.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ firm_name: 'Updated' });

      expect(res.status).toBe(200);
    });

    it('returns 404 when tenant not found', async () => {
      mockService.update.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/tenants/nonexistent')
        .set('Authorization', AUTH_HEADER)
        .send({ firm_name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/tenants/:id', () => {
    it('returns 200 on successful deactivation', async () => {
      mockService.deactivate.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .delete('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
    });

    it('returns 404 when tenant not found', async () => {
      mockService.deactivate.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/tenants/nonexistent')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/tenants/:id/health', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/tenants/uuid-1/health');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 200 when all checks are healthy', async () => {
      mockCheckTenantHealth.mockResolvedValue({
        tenant_id: 'uuid-1',
        checks: [
          { check: 'database', healthy: true, detail: 'Tenant exists and is active' },
          { check: 'viber', healthy: true, detail: 'Bot: TestBot, subscribers: 5' },
          { check: 'chatwoot', healthy: true, detail: 'Inbox accessible' },
          { check: 'data_source', healthy: true, detail: 'N/A — no data source configured' },
        ],
        allHealthy: true,
      });

      const res = await request(app)
        .get('/api/tenants/uuid-1/health')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.allHealthy).toBe(true);
      expect(res.body.tenant_id).toBe('uuid-1');
      expect(res.body.checks).toHaveLength(4);
    });

    it('returns 503 when some checks fail', async () => {
      mockCheckTenantHealth.mockResolvedValue({
        tenant_id: 'uuid-1',
        checks: [
          { check: 'database', healthy: true, detail: 'Tenant exists and is active' },
          { check: 'viber', healthy: false, detail: 'Failed to reach Viber API' },
          { check: 'chatwoot', healthy: true, detail: 'Inbox accessible' },
          { check: 'data_source', healthy: true, detail: 'N/A — no data source configured' },
        ],
        allHealthy: false,
      });

      const res = await request(app)
        .get('/api/tenants/uuid-1/health')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(503);
      expect(res.body.allHealthy).toBe(false);
      expect(res.body.checks[1]).toMatchObject({ check: 'viber', healthy: false });
    });

    it('returns 503 when tenant not found', async () => {
      mockCheckTenantHealth.mockResolvedValue({
        tenant_id: 'nonexistent',
        checks: [{ check: 'database', healthy: false, detail: 'Tenant not found' }],
        allHealthy: false,
      });

      const res = await request(app)
        .get('/api/tenants/nonexistent/health')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(503);
      expect(res.body.allHealthy).toBe(false);
    });

    it('returns 500 on unexpected error', async () => {
      mockCheckTenantHealth.mockRejectedValue(new Error('Unexpected failure'));

      const res = await request(app)
        .get('/api/tenants/uuid-1/health')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/tenants/:id with credit fields', () => {
    it('updates monthly_credit_limit', async () => {
      mockService.update.mockResolvedValue({ ...mockPublicTenant, monthly_credit_limit: 500 } as any);

      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ monthly_credit_limit: 500 });

      expect(res.status).toBe(200);
      expect(res.body.monthly_credit_limit).toBe(500);
    });

    it('updates per_conversation_message_limit', async () => {
      mockService.update.mockResolvedValue({ ...mockPublicTenant, per_conversation_message_limit: 10 } as any);

      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ per_conversation_message_limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.per_conversation_message_limit).toBe(10);
    });

    it('updates bonus_credits', async () => {
      mockService.update.mockResolvedValue({ ...mockPublicTenant, bonus_credits: 50 } as any);

      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ bonus_credits: 50 });

      expect(res.status).toBe(200);
      expect(res.body.bonus_credits).toBe(50);
    });

    it('updates credit_limit_message', async () => {
      mockService.update.mockResolvedValue({ ...mockPublicTenant, credit_limit_message: 'Custom msg' } as any);

      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ credit_limit_message: 'Custom msg' });

      expect(res.status).toBe(200);
      expect(res.body.credit_limit_message).toBe('Custom msg');
    });

    it('updates auto_escalate_media', async () => {
      mockService.update.mockResolvedValue({ ...mockPublicTenant, auto_escalate_media: false } as any);

      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ auto_escalate_media: false });

      expect(res.status).toBe(200);
      expect(res.body.auto_escalate_media).toBe(false);
    });

    it('rejects invalid credit fields on update', async () => {
      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ monthly_credit_limit: -5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('monthly_credit_limit');
    });
  });

  describe('PUT /api/tenants/:id with agent_timeout_seconds', () => {
    it('returns 200 when updating agent_timeout_seconds', async () => {
      mockService.update.mockResolvedValue({ ...mockPublicTenant, agent_timeout_seconds: 300 } as any);

      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ agent_timeout_seconds: 300 });

      expect(res.status).toBe(200);
      expect(res.body.agent_timeout_seconds).toBe(300);
    });
  });

  describe('GET /api/tenants/:id/agents', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/tenants/uuid-1/agents');
      expect(res.status).toBe(401);
    });

    it('returns 404 when tenant not found', async () => {
      mockService.getById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/tenants/nonexistent/agents')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });

    it('returns 400 when tenant has no Chatwoot config', async () => {
      mockService.getById.mockResolvedValue({
        ...mockFullTenant,
        chatwoot_api_token: null,
      } as any);

      const res = await request(app)
        .get('/api/tenants/uuid-1/agents')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Chatwoot');
    });

    it('returns 200 with agents list', async () => {
      mockService.getById.mockResolvedValue(mockFullTenant as any);
      mockProvisioning.listInboxAgents.mockResolvedValue([
        { id: 1, name: 'Agent 1', email: 'a1@test.com', role: 'agent' },
      ]);

      const res = await request(app)
        .get('/api/tenants/uuid-1/agents')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Agent 1');
    });
  });

  describe('POST /api/tenants/:id/agents', () => {
    it('returns 400 when name or email missing', async () => {
      const res = await request(app)
        .post('/api/tenants/uuid-1/agents')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'Agent' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns 404 when tenant not found', async () => {
      mockService.getById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/tenants/nonexistent/agents')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'Agent', email: 'agent@test.com' });

      expect(res.status).toBe(404);
    });

    it('returns 400 when tenant has no Chatwoot config', async () => {
      mockService.getById.mockResolvedValue({
        ...mockFullTenant,
        chatwoot_api_token: null,
      } as any);

      const res = await request(app)
        .post('/api/tenants/uuid-1/agents')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'Agent', email: 'a@b.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Chatwoot');
    });

    it('returns 500 when Chatwoot API fails on createAgent', async () => {
      mockService.getById.mockResolvedValue(mockFullTenant as any);
      mockProvisioning.createAgent.mockRejectedValue(new Error('Chatwoot error'));

      const res = await request(app)
        .post('/api/tenants/uuid-1/agents')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'Agent', email: 'a@b.com' });

      expect(res.status).toBe(500);
    });

    it('returns 201 on successful agent creation', async () => {
      mockService.getById.mockResolvedValue(mockFullTenant as any);
      mockProvisioning.createAgent.mockResolvedValue({
        id: 10, name: 'New Agent', email: 'new@test.com', role: 'agent',
      });
      mockProvisioning.addAgentsToInbox.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/tenants/uuid-1/agents')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'New Agent', email: 'new@test.com' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('New Agent');
      expect(mockProvisioning.addAgentsToInbox).toHaveBeenCalledWith(
        expect.objectContaining({ agentIds: [10] })
      );
    });
  });

  describe('POST /api/tenants/:id/setup-chatwoot', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).post('/api/tenants/uuid-1/setup-chatwoot');
      expect(res.status).toBe(401);
    });

    it('returns 404 when tenant not found', async () => {
      mockService.getById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/tenants/nonexistent/setup-chatwoot')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tenant not found');
    });

    it('returns 400 when Chatwoot is already configured', async () => {
      mockService.getById.mockResolvedValue({
        ...mockFullTenant,
        chatwoot_account_id: 5,
        chatwoot_api_token: 'existing-token',
      } as any);

      const res = await request(app)
        .post('/api/tenants/uuid-1/setup-chatwoot')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already configured');
    });

    it('returns 400 when CHATWOOT_PLATFORM_TOKEN is not configured', async () => {
      mockService.getById.mockResolvedValue({
        ...mockFullTenant,
        chatwoot_account_id: null,
        chatwoot_api_token: null,
      } as any);

      const originalToken = env.CHATWOOT_PLATFORM_TOKEN;
      (env as any).CHATWOOT_PLATFORM_TOKEN = '';

      const res = await request(app)
        .post('/api/tenants/uuid-1/setup-chatwoot')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('CHATWOOT_PLATFORM_TOKEN');

      (env as any).CHATWOOT_PLATFORM_TOKEN = originalToken;
    });

    it('returns 200 and starts provisioning when valid', async () => {
      mockService.getById.mockResolvedValue({
        ...mockFullTenant,
        chatwoot_account_id: null,
        chatwoot_api_token: null,
      } as any);
      mockService.provisionChatwoot.mockResolvedValue(undefined);

      (env as any).CHATWOOT_PLATFORM_TOKEN = 'platform-test-token';

      const res = await request(app)
        .post('/api/tenants/uuid-1/setup-chatwoot')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Chatwoot setup started');
      expect(res.body.status).toBe('pending');
      expect(mockService.provisionChatwoot).toHaveBeenCalledWith(
        'uuid-1', 'test-tenant', 'Test Firm'
      );

      (env as any).CHATWOOT_PLATFORM_TOKEN = '';
    });

    it('returns 200 even when provisioning rejects (fire-and-forget)', async () => {
      mockService.getById.mockResolvedValue({
        ...mockFullTenant,
        chatwoot_account_id: null,
        chatwoot_api_token: null,
      } as any);
      mockService.provisionChatwoot.mockRejectedValue(new Error('Chatwoot down'));

      (env as any).CHATWOOT_PLATFORM_TOKEN = 'platform-test-token';

      const res = await request(app)
        .post('/api/tenants/uuid-1/setup-chatwoot')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending');

      (env as any).CHATWOOT_PLATFORM_TOKEN = '';
    });
  });

  describe('POST /api/tenants with credit limit fields', () => {
    it('accepts valid monthly_credit_limit', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'credit-co',
          firm_name: 'Credit Co',
          monthly_credit_limit: 500,
        });

      expect(res.status).toBe(201);
    });

    it('rejects negative monthly_credit_limit', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'bad-co',
          firm_name: 'Bad Co',
          monthly_credit_limit: -1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('monthly_credit_limit');
    });

    it('accepts null monthly_credit_limit (unlimited)', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'unlimited-co',
          firm_name: 'Unlimited Co',
          monthly_credit_limit: null,
        });

      expect(res.status).toBe(201);
    });

    it('rejects monthly_credit_limit over 10000000', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'over-limit',
          firm_name: 'Over Limit Co',
          monthly_credit_limit: 10000001,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('monthly_credit_limit');
    });

    it('rejects negative per_conversation_message_limit', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'neg-per-conv',
          firm_name: 'Neg Per Conv Co',
          per_conversation_message_limit: -1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('per_conversation_message_limit');
    });

    it('rejects per_conversation_message_limit of 0', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'zero-conv',
          firm_name: 'Zero Conv Co',
          per_conversation_message_limit: 0,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('per_conversation_message_limit');
    });

    it('rejects per_conversation_message_limit over 10000', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'over-conv',
          firm_name: 'Over Conv Co',
          per_conversation_message_limit: 10001,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('per_conversation_message_limit');
    });

    it('accepts valid per_conversation_message_limit', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'valid-conv',
          firm_name: 'Valid Conv Co',
          per_conversation_message_limit: 50,
        });

      expect(res.status).toBe(201);
    });

    it('rejects negative bonus_credits', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'neg-bonus',
          firm_name: 'Neg Bonus Co',
          bonus_credits: -1,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('bonus_credits');
    });

    it('rejects bonus_credits over 10000000', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'over-bonus',
          firm_name: 'Over Bonus Co',
          bonus_credits: 10000001,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('bonus_credits');
    });

    it('accepts valid bonus_credits', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'good-bonus',
          firm_name: 'Good Bonus Co',
          bonus_credits: 500,
        });

      expect(res.status).toBe(201);
    });

    it('rejects credit_limit_message over 1000 chars', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'long-msg',
          firm_name: 'Long Msg Co',
          credit_limit_message: 'x'.repeat(1001),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('credit_limit_message');
    });

    it('rejects non-string credit_limit_message', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'num-msg',
          firm_name: 'Num Msg Co',
          credit_limit_message: 12345,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('credit_limit_message');
    });

    it('accepts valid credit_limit_message', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'good-msg',
          firm_name: 'Good Msg Co',
          credit_limit_message: 'Custom message for credits exhausted.',
        });

      expect(res.status).toBe(201);
    });

    it('accepts null credit_limit_message', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'null-msg',
          firm_name: 'Null Msg Co',
          credit_limit_message: null,
        });

      expect(res.status).toBe(201);
    });

    it('rejects invalid auto_escalate_media type', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'bad-bool',
          firm_name: 'Bad Bool Co',
          auto_escalate_media: 'yes',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('auto_escalate_media');
    });
  });

  describe('POST /api/tenants with auto_setup_chatwoot', () => {
    it('passes auto_setup_chatwoot to service create', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'auto-setup',
          firm_name: 'Auto Setup Co',
          auto_setup_chatwoot: true,
        });

      expect(res.status).toBe(201);
      expect(mockService.create).toHaveBeenCalledWith(
        expect.objectContaining({ auto_setup_chatwoot: true })
      );
    });

    it('passes auto_setup_chatwoot=false to service create', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({
          slug: 'manual-setup',
          firm_name: 'Manual Setup Co',
          auto_setup_chatwoot: false,
          chatwoot_account_id: 10,
          chatwoot_api_token: 'manual-token',
        });

      expect(res.status).toBe(201);
      expect(mockService.create).toHaveBeenCalledWith(
        expect.objectContaining({ auto_setup_chatwoot: false })
      );
    });
  });

  describe('GET /api/tenants/:id/credit-usage', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/tenants/uuid-1/credit-usage');
      expect(res.status).toBe(401);
    });

    it('returns 404 when tenant not found', async () => {
      mockService.getPublicById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/tenants/nonexistent/credit-usage')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });

    it('returns 500 when getUsageSummary throws', async () => {
      mockService.getPublicById.mockResolvedValue(mockPublicTenant as any);
      mockAiCredits.getUsageSummary.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .get('/api/tenants/uuid-1/credit-usage')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(500);
    });

    it('returns 200 with credit usage summary', async () => {
      mockService.getPublicById.mockResolvedValue(mockPublicTenant as any);
      mockAiCredits.getUsageSummary.mockResolvedValue({
        tenant_id: 'uuid-1',
        monthly_credit_limit: 100,
        credits_used: 50,
        bonus_credits: 0,
        credits_remaining: 50,
        credits_reset_at: null,
        per_conversation_message_limit: null,
        breakdown: [
          { credit_type: 'text_response', total_credits: 40, count: 40 },
          { credit_type: 'database_search', total_credits: 10, count: 5 },
        ],
      });

      const res = await request(app)
        .get('/api/tenants/uuid-1/credit-usage')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.credits_used).toBe(50);
      expect(res.body.credits_remaining).toBe(50);
      expect(res.body.breakdown).toHaveLength(2);
    });
  });

  describe('DELETE /api/tenants/:id/agents/:agentId', () => {
    it('returns 404 when tenant not found', async () => {
      mockService.getById.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/tenants/nonexistent/agents/10')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid agent ID', async () => {
      mockService.getById.mockResolvedValue(mockFullTenant as any);

      const res = await request(app)
        .delete('/api/tenants/uuid-1/agents/abc')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid agent ID');
    });

    it('returns 400 when tenant has no Chatwoot config', async () => {
      mockService.getById.mockResolvedValue({
        ...mockFullTenant,
        chatwoot_api_token: null,
      } as any);

      const res = await request(app)
        .delete('/api/tenants/uuid-1/agents/10')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Chatwoot');
    });

    it('returns 500 when Chatwoot API fails on remove', async () => {
      mockService.getById.mockResolvedValue(mockFullTenant as any);
      mockProvisioning.removeAgentFromInbox.mockRejectedValue(new Error('Chatwoot error'));

      const res = await request(app)
        .delete('/api/tenants/uuid-1/agents/10')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(500);
    });

    it('returns 204 on successful removal', async () => {
      mockService.getById.mockResolvedValue(mockFullTenant as any);
      mockProvisioning.removeAgentFromInbox.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/tenants/uuid-1/agents/10')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(204);
      expect(mockProvisioning.removeAgentFromInbox).toHaveBeenCalledWith(
        'cw-token', 1, 2, [10]
      );
    });
  });
});

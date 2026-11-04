import request from 'supertest';
import { app } from '../../../app';
import { tenantService } from '../tenant.service';
import { checkTenantHealth } from '../tenant.health';
import { chatwootProvisioningService } from '../../chatwoot/chatwoot.provisioning';

jest.mock('../tenant.service');
jest.mock('../tenant.health');
jest.mock('../../chatwoot/chatwoot.provisioning');
const mockService = tenantService as jest.Mocked<typeof tenantService>;
const mockCheckTenantHealth = checkTenantHealth as jest.MockedFunction<typeof checkTenantHealth>;
const mockProvisioning = chatwootProvisioningService as jest.Mocked<typeof chatwootProvisioningService>;

const AUTH_HEADER = `Bearer test-admin-token`;

const mockPublicTenant = {
  id: 'uuid-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  database_type: null,
  system_prompt: 'You are helpful.',
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2,
  agent_timeout_seconds: 180,
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
      mockService.getById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/tenants/nonexistent')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });

    it('returns 200 with tenant', async () => {
      mockService.getById.mockResolvedValue(mockPublicTenant as any);

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

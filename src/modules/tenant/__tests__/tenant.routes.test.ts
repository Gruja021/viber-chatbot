import request from 'supertest';
import { app } from '../../../app';
import { tenantService } from '../tenant.service';

jest.mock('../tenant.service');
const mockService = tenantService as jest.Mocked<typeof tenantService>;

const AUTH_HEADER = `Bearer test-admin-token`;

const mockPublicTenant = {
  id: 'uuid-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  database_type: null,
  system_prompt: 'You are helpful.',
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2,
  status: 'active' as const,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
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
});

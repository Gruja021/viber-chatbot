import request from 'supertest';
import { app } from '../../../app';
import { connectorService } from '../connector.service';
import { connectorRepository } from '../connector.repository';
import { tenantService } from '../../tenant/tenant.service';

jest.mock('../connector.service');
jest.mock('../connector.repository');
jest.mock('../../tenant/tenant.service');

const mockService = connectorService as jest.Mocked<typeof connectorService>;
const mockRepo = connectorRepository as jest.Mocked<typeof connectorRepository>;
const mockTenantService = tenantService as jest.Mocked<typeof tenantService>;

const AUTH_HEADER = 'Bearer test-admin-token';

const mockPublicConnector = {
  id: 'c-1',
  tenant_id: 't-1',
  name: 'products',
  description: 'Product catalog',
  database_type: 'google_sheets' as const,
  has_credentials: true,
  is_active: true,
  priority: 0,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

describe('connector.routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Tenant exists by default
    mockTenantService.getPublicById.mockResolvedValue({ id: 't-1', slug: 'test' } as any);
  });

  describe('GET /api/tenants/:id/connectors', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/tenants/t-1/connectors');
      expect(res.status).toBe(401);
    });

    it('returns 404 when tenant not found', async () => {
      mockTenantService.getPublicById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/tenants/t-1/connectors')
        .set('Authorization', AUTH_HEADER);
      expect(res.status).toBe(404);
    });

    it('returns 200 with connectors list', async () => {
      mockService.getConnectors.mockResolvedValue([mockPublicConnector]);

      const res = await request(app)
        .get('/api/tenants/t-1/connectors')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('products');
    });
  });

  describe('POST /api/tenants/:id/connectors', () => {
    it('returns 400 when required fields missing', async () => {
      const res = await request(app)
        .post('/api/tenants/t-1/connectors')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'test' });

      expect(res.status).toBe(400);
    });

    it('returns 201 on success', async () => {
      mockService.createConnector.mockResolvedValue(mockPublicConnector);

      const res = await request(app)
        .post('/api/tenants/t-1/connectors')
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'products',
          database_type: 'google_sheets',
          database_credentials: '{"spreadsheet_id":"abc"}',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('products');
    });

    it('returns 409 on duplicate name', async () => {
      const error: any = new Error('unique');
      error.code = '23505';
      mockService.createConnector.mockRejectedValue(error);

      const res = await request(app)
        .post('/api/tenants/t-1/connectors')
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'products',
          database_type: 'google_sheets',
          database_credentials: '{"spreadsheet_id":"abc"}',
        });

      expect(res.status).toBe(409);
    });

    it('converts object credentials to JSON string', async () => {
      mockService.createConnector.mockResolvedValue(mockPublicConnector);

      await request(app)
        .post('/api/tenants/t-1/connectors')
        .set('Authorization', AUTH_HEADER)
        .send({
          name: 'products',
          database_type: 'google_sheets',
          database_credentials: { spreadsheet_id: 'abc' },
        });

      expect(mockService.createConnector).toHaveBeenCalledWith(
        't-1',
        expect.objectContaining({
          database_credentials: '{"spreadsheet_id":"abc"}',
        })
      );
    });
  });

  describe('PUT /api/tenants/:id/connectors/:cid', () => {
    it('returns 404 when connector not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/tenants/t-1/connectors/c-1')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'updated' });

      expect(res.status).toBe(404);
    });

    it('returns 404 when connector belongs to different tenant', async () => {
      mockRepo.findById.mockResolvedValue({ tenant_id: 'other-tenant' } as any);

      const res = await request(app)
        .put('/api/tenants/t-1/connectors/c-1')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'updated' });

      expect(res.status).toBe(404);
    });

    it('returns 200 on success', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'c-1', tenant_id: 't-1' } as any);
      mockService.updateConnector.mockResolvedValue({ ...mockPublicConnector, name: 'updated' });

      const res = await request(app)
        .put('/api/tenants/t-1/connectors/c-1')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'updated' });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/tenants/:id/connectors/:cid', () => {
    it('returns 404 when connector not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/tenants/t-1/connectors/c-1')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });

    it('returns 204 on success', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'c-1', tenant_id: 't-1' } as any);
      mockService.deleteConnector.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/tenants/t-1/connectors/c-1')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(204);
    });
  });

  describe('POST /api/tenants/:id/connectors/:cid/test', () => {
    it('returns 404 when connector not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/tenants/t-1/connectors/c-1/test')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(404);
    });

    it('returns test result on success', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'c-1', tenant_id: 't-1' } as any);
      mockService.testConnector.mockResolvedValue({ success: true, detail: 'google_sheets connected' });

      const res = await request(app)
        .post('/api/tenants/t-1/connectors/c-1/test')
        .set('Authorization', AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

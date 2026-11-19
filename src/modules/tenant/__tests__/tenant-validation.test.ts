import request from 'supertest';
import { app } from '../../../app';
import { tenantService } from '../tenant.service';

jest.mock('../tenant.service');
jest.mock('../tenant.health');
jest.mock('../../chatwoot/chatwoot.provisioning');
const mockService = tenantService as jest.Mocked<typeof tenantService>;

const AUTH_HEADER = 'Bearer test-admin-token';

const mockPublicTenant = {
  id: 'uuid-1',
  slug: 'valid-slug',
  firm_name: 'Test Firm',
  status: 'active',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('tenant routes input validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/tenants — slug validation', () => {
    it('rejects slug with uppercase letters', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'Invalid-Slug', firm_name: 'Firm' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('slug');
    });

    it('rejects slug with spaces', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'has space', firm_name: 'Firm' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('slug');
    });

    it('rejects slug starting with hyphen', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: '-starts-bad', firm_name: 'Firm' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('slug');
    });

    it('rejects slug ending with hyphen', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'ends-bad-', firm_name: 'Firm' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('slug');
    });

    it('rejects slug shorter than 3 characters', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'ab', firm_name: 'Firm' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('slug');
    });

    it('accepts valid slug', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'my-company-123', firm_name: 'Firm' });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/tenants — agent_timeout_seconds validation', () => {
    it('rejects negative timeout', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', agent_timeout_seconds: -1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('agent_timeout_seconds');
    });

    it('rejects timeout above 86400', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', agent_timeout_seconds: 86401 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('agent_timeout_seconds');
    });

    it('accepts zero timeout (AI-First mode)', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', agent_timeout_seconds: 0 });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/tenants — session_timeout_hours validation', () => {
    it('rejects zero session timeout', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', session_timeout_hours: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('session_timeout_hours');
    });

    it('rejects session timeout above 720', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', session_timeout_hours: 721 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('session_timeout_hours');
    });
  });

  describe('POST /api/tenants — system_prompt validation', () => {
    it('rejects system_prompt exceeding 10000 characters', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', system_prompt: 'x'.repeat(10001) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('system_prompt');
    });

    it('accepts system_prompt within limit', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', system_prompt: 'You are a helpful assistant.' });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/tenants — timezone validation', () => {
    it('rejects invalid timezone format', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', timezone: 'InvalidTimezone' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('timezone');
    });

    it('accepts valid IANA timezone', async () => {
      mockService.create.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'Firm', timezone: 'Europe/Belgrade' });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/tenants — firm_name validation', () => {
    it('rejects firm_name exceeding 200 characters', async () => {
      const res = await request(app)
        .post('/api/tenants')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'valid-slug', firm_name: 'x'.repeat(201) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('firm_name');
    });
  });

  describe('PUT /api/tenants/:id — validation on update', () => {
    it('rejects invalid slug on update', async () => {
      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ slug: 'BAD SLUG!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('slug');
    });

    it('rejects invalid timeout on update', async () => {
      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ agent_timeout_seconds: -5 });

      expect(res.status).toBe(400);
    });

    it('allows valid partial update', async () => {
      mockService.update.mockResolvedValue(mockPublicTenant as any);

      const res = await request(app)
        .put('/api/tenants/uuid-1')
        .set('Authorization', AUTH_HEADER)
        .send({ firm_name: 'Updated Name' });

      expect(res.status).toBe(200);
    });
  });
});

import { tenantService } from '../tenant.service';
import { tenantRepository } from '../tenant.repository';
import { redis } from '../../../config/redis';
import { Tenant } from '../tenant.model';

jest.mock('../tenant.repository');
const mockRepo = tenantRepository as jest.Mocked<typeof tenantRepository>;
const mockRedis = redis as jest.Mocked<typeof redis>;

const makeTenant = (overrides: Partial<Tenant> = {}): Tenant => ({
  id: 'uuid-1',
  slug: 'test-tenant',
  firm_name: 'Test Firm',
  viber_auth_token: 'secret-token',
  database_type: null,
  database_credentials: null,
  system_prompt: 'You are helpful.',
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2,
  chatwoot_api_token: 'cw-secret',
  timezone: 'Europe/Belgrade',
  working_hours: {},
  handover_keywords: [],
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z' as unknown as Date,
  updated_at: '2024-01-01T00:00:00.000Z' as unknown as Date,
  ...overrides,
});

describe('tenantService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBySlug', () => {
    it('returns cached tenant on cache hit', async () => {
      const tenant = makeTenant();
      mockRedis.get.mockResolvedValue(JSON.stringify(tenant));

      const result = await tenantService.getBySlug('test-tenant');
      expect(result).toEqual(tenant);
      expect(mockRepo.findBySlug).not.toHaveBeenCalled();
    });

    it('fetches from DB and caches on cache miss', async () => {
      const tenant = makeTenant();
      mockRedis.get.mockResolvedValue(null);
      mockRepo.findBySlug.mockResolvedValue(tenant);

      const result = await tenantService.getBySlug('test-tenant');
      expect(result).toEqual(tenant);
      expect(mockRepo.findBySlug).toHaveBeenCalledWith('test-tenant');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'tenant:slug:test-tenant',
        300,
        JSON.stringify(tenant)
      );
    });

    it('returns null when tenant not in DB', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRepo.findBySlug.mockResolvedValue(null);

      const result = await tenantService.getBySlug('nonexistent');
      expect(result).toBeNull();
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('returns cached tenant on cache hit', async () => {
      const tenant = makeTenant();
      mockRedis.get.mockResolvedValue(JSON.stringify(tenant));

      const result = await tenantService.getById('uuid-1');
      expect(result).toEqual(tenant);
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });

    it('fetches from DB and caches on cache miss', async () => {
      const tenant = makeTenant();
      mockRedis.get.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(tenant);

      const result = await tenantService.getById('uuid-1');
      expect(result).toEqual(tenant);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'tenant:id:uuid-1',
        300,
        JSON.stringify(tenant)
      );
    });
  });

  describe('create', () => {
    it('creates tenant and returns public object (no sensitive fields)', async () => {
      const tenant = makeTenant();
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({
        slug: 'test-tenant',
        firm_name: 'Test Firm',
        viber_auth_token: 'secret-token',
      });

      expect(result).not.toHaveProperty('viber_auth_token');
      expect(result).not.toHaveProperty('database_credentials');
      expect(result).not.toHaveProperty('chatwoot_api_token');
      expect(result).toHaveProperty('id', 'uuid-1');
      expect(result).toHaveProperty('slug', 'test-tenant');
      // Should NOT cache on create
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('invalidates cache after update', async () => {
      const existing = makeTenant();
      const updated = makeTenant({ firm_name: 'Updated Firm' });
      mockRepo.findById.mockResolvedValue(existing);
      mockRepo.update.mockResolvedValue(updated);

      const result = await tenantService.update('uuid-1', { firm_name: 'Updated Firm' });
      expect(result).not.toHaveProperty('viber_auth_token');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:slug:test-tenant');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:id:uuid-1');
    });

    it('invalidates new slug cache when slug changes', async () => {
      const existing = makeTenant();
      const updated = makeTenant({ slug: 'new-slug' });
      mockRepo.findById.mockResolvedValue(existing);
      mockRepo.update.mockResolvedValue(updated);

      await tenantService.update('uuid-1', { slug: 'new-slug' });
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:slug:new-slug');
    });

    it('returns null when tenant not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      const result = await tenantService.update('nonexistent', { firm_name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('deactivate', () => {
    it('invalidates cache after deactivation', async () => {
      const existing = makeTenant();
      const deactivated = makeTenant({ status: 'inactive' });
      mockRepo.findById.mockResolvedValue(existing);
      mockRepo.deactivate.mockResolvedValue(deactivated);

      const result = await tenantService.deactivate('uuid-1');
      expect(result).not.toHaveProperty('viber_auth_token');
      expect(result).toHaveProperty('status', 'inactive');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:slug:test-tenant');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:id:uuid-1');
    });

    it('returns null when tenant not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      const result = await tenantService.deactivate('nonexistent');
      expect(result).toBeNull();
    });
  });
});

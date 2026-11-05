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
  telegram_bot_token: null,
  database_type: null,
  database_credentials: null,
  system_prompt: 'You are helpful.',
  openai_api_key: null,
  openai_model: null,
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 2,
  chatwoot_api_token: 'cw-secret',
  timezone: 'Europe/Belgrade',
  working_hours: {},
  handover_keywords: [],
  agent_timeout_seconds: 180,
  session_timeout_hours: 24,
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
      expect(result).toHaveProperty('agent_timeout_seconds', 180);
      // Should NOT cache on create
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('getAll', () => {
    it('returns all tenants as public objects', async () => {
      const tenants = [makeTenant(), makeTenant({ id: 'uuid-2', slug: 'second' })];
      mockRepo.findAll.mockResolvedValue(tenants);

      const result = await tenantService.getAll();
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('viber_auth_token');
      expect(result[0]).not.toHaveProperty('chatwoot_api_token');
      expect(result[0]).toHaveProperty('id', 'uuid-1');
      expect(result[1]).toHaveProperty('id', 'uuid-2');
    });

    it('returns empty array when no tenants exist', async () => {
      mockRepo.findAll.mockResolvedValue([]);
      const result = await tenantService.getAll();
      expect(result).toEqual([]);
    });
  });

  describe('toPublic', () => {
    it('includes agent_timeout_seconds in public tenant', async () => {
      const tenant = makeTenant({ agent_timeout_seconds: 300 });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('agent_timeout_seconds', 300);
    });

    it('includes session_timeout_hours in public tenant', async () => {
      const tenant = makeTenant({ session_timeout_hours: 48 });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('session_timeout_hours', 48);
    });

    it('strips sensitive fields from public tenant', async () => {
      const tenant = makeTenant();
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).not.toHaveProperty('viber_auth_token');
      expect(result).not.toHaveProperty('telegram_bot_token');
      expect(result).not.toHaveProperty('database_credentials');
      expect(result).not.toHaveProperty('chatwoot_api_token');
      expect(result).not.toHaveProperty('openai_api_key');
      expect(result).toHaveProperty('timezone');
      expect(result).toHaveProperty('working_hours');
      expect(result).toHaveProperty('handover_keywords');
      expect(result).toHaveProperty('agent_timeout_seconds');
      expect(result).toHaveProperty('session_timeout_hours');
    });

    it('includes openai_model in public tenant', async () => {
      const tenant = makeTenant({ openai_model: 'gpt-4o' });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('openai_model', 'gpt-4o');
    });

    it('includes has_openai_api_key=true when key is set', async () => {
      const tenant = makeTenant({ openai_api_key: 'sk-test' });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('has_openai_api_key', true);
    });

    it('includes has_openai_api_key=false when key is null', async () => {
      const tenant = makeTenant({ openai_api_key: null });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('has_openai_api_key', false);
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

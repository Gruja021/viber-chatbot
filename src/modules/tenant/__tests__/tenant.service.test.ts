import { tenantService } from '../tenant.service';
import { tenantRepository } from '../tenant.repository';
import { redis } from '../../../config/redis';
import { env } from '../../../config/env';
import { chatwootProvisioningService } from '../../chatwoot/chatwoot.provisioning';
import { Tenant } from '../tenant.model';

jest.mock('../tenant.repository');
jest.mock('../../chatwoot/chatwoot.provisioning');
const mockRepo = tenantRepository as jest.Mocked<typeof tenantRepository>;
const mockRedis = redis as jest.Mocked<typeof redis>;
const mockChatwoot = chatwootProvisioningService as jest.Mocked<typeof chatwootProvisioningService>;

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
  chatwoot_setup_status: 'none',
  chatwoot_setup_error: null,
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
    it('always fetches from DB (sensitive data not cached)', async () => {
      const tenant = makeTenant();
      mockRepo.findBySlug.mockResolvedValue(tenant);

      const result = await tenantService.getBySlug('test-tenant');
      expect(result).toEqual(tenant);
      expect(mockRepo.findBySlug).toHaveBeenCalledWith('test-tenant');
    });

    it('caches non-sensitive data after DB fetch', async () => {
      const tenant = makeTenant();
      mockRepo.findBySlug.mockResolvedValue(tenant);

      await tenantService.getBySlug('test-tenant');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'tenant:slug:test-tenant',
        300,
        expect.any(String)
      );
      // Cached data should NOT contain sensitive tokens
      const cachedJson = (mockRedis.setex as jest.Mock).mock.calls[0][2];
      const cached = JSON.parse(cachedJson);
      expect(cached).not.toHaveProperty('viber_auth_token');
      expect(cached).not.toHaveProperty('chatwoot_api_token');
      expect(cached).not.toHaveProperty('openai_api_key');
    });

    it('returns null when tenant not in DB', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);

      const result = await tenantService.getBySlug('nonexistent');
      expect(result).toBeNull();
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('always fetches from DB for full tenant data', async () => {
      const tenant = makeTenant();
      mockRedis.get.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(tenant);

      const result = await tenantService.getById('uuid-1');
      expect(result).toEqual(tenant);
      expect(mockRepo.findById).toHaveBeenCalledWith('uuid-1');
    });

    it('caches non-sensitive data after DB fetch', async () => {
      const tenant = makeTenant();
      mockRedis.get.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(tenant);

      await tenantService.getById('uuid-1');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'tenant:id:uuid-1',
        300,
        expect.any(String)
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

    it('includes has_viber_token=true when token is set', async () => {
      const tenant = makeTenant({ viber_auth_token: 'viber-token' });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('has_viber_token', true);
    });

    it('includes has_viber_token=false when token is null', async () => {
      const tenant = makeTenant({ viber_auth_token: null });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('has_viber_token', false);
    });

    it('includes has_telegram_token=true when token is set', async () => {
      const tenant = makeTenant({ telegram_bot_token: 'tg-token' });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('has_telegram_token', true);
    });

    it('includes has_telegram_token=false when token is null', async () => {
      const tenant = makeTenant({ telegram_bot_token: null });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X' });
      expect(result).toHaveProperty('has_telegram_token', false);
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

  describe('toPublic - chatwoot_setup_status', () => {
    it('includes chatwoot_setup_status in public tenant', async () => {
      const tenant = makeTenant({ chatwoot_setup_status: 'completed' });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X', auto_setup_chatwoot: false });
      expect(result).toHaveProperty('chatwoot_setup_status', 'completed');
    });

    it('includes chatwoot_setup_error in public tenant', async () => {
      const tenant = makeTenant({ chatwoot_setup_status: 'failed', chatwoot_setup_error: 'Connection refused' });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X', auto_setup_chatwoot: false });
      expect(result).toHaveProperty('chatwoot_setup_error', 'Connection refused');
    });

    it('defaults chatwoot_setup_status to none when null', async () => {
      const tenant = makeTenant({ chatwoot_setup_status: undefined as any });
      mockRepo.create.mockResolvedValue(tenant);

      const result = await tenantService.create({ slug: 'x', firm_name: 'X', auto_setup_chatwoot: false });
      expect(result).toHaveProperty('chatwoot_setup_status', 'none');
    });
  });

  describe('create - auto provisioning', () => {
    it('triggers async provisioning when auto_setup_chatwoot is true and platform token exists', async () => {
      const tenant = makeTenant({ chatwoot_account_id: null, chatwoot_api_token: null });
      mockRepo.create.mockResolvedValue(tenant);
      mockChatwoot.provisionFullAccount.mockResolvedValue({
        chatwoot_account_id: 5,
        chatwoot_inbox_id: 10,
        chatwoot_api_token: 'new-token',
      });
      mockRepo.updateChatwootSetupStatus.mockResolvedValue(tenant);
      mockRepo.update.mockResolvedValue(tenant);
      mockRepo.findById.mockResolvedValue(tenant);

      // Set platform token
      (env as any).CHATWOOT_PLATFORM_TOKEN = 'platform-test-token';

      const result = await tenantService.create({
        slug: 'test-tenant',
        firm_name: 'Test Firm',
        auto_setup_chatwoot: true,
      });

      expect(result).toHaveProperty('chatwoot_setup_status', 'pending');

      // Cleanup
      (env as any).CHATWOOT_PLATFORM_TOKEN = '';
    });

    it('does not trigger provisioning when chatwoot_account_id is provided', async () => {
      const tenant = makeTenant();
      mockRepo.create.mockResolvedValue(tenant);

      (env as any).CHATWOOT_PLATFORM_TOKEN = 'platform-test-token';

      await tenantService.create({
        slug: 'test-tenant',
        firm_name: 'Test Firm',
        chatwoot_account_id: 99,
      });

      expect(mockChatwoot.provisionFullAccount).not.toHaveBeenCalled();

      (env as any).CHATWOOT_PLATFORM_TOKEN = '';
    });

    it('does not trigger provisioning when platform token is empty', async () => {
      const tenant = makeTenant({ chatwoot_account_id: null, chatwoot_api_token: null });
      mockRepo.create.mockResolvedValue(tenant);

      (env as any).CHATWOOT_PLATFORM_TOKEN = '';

      await tenantService.create({
        slug: 'test-tenant',
        firm_name: 'Test Firm',
        auto_setup_chatwoot: true,
      });

      expect(mockChatwoot.provisionFullAccount).not.toHaveBeenCalled();
    });

    it('does not trigger provisioning when auto_setup_chatwoot is false', async () => {
      const tenant = makeTenant({ chatwoot_account_id: null, chatwoot_api_token: null });
      mockRepo.create.mockResolvedValue(tenant);

      (env as any).CHATWOOT_PLATFORM_TOKEN = 'platform-test-token';

      await tenantService.create({
        slug: 'test-tenant',
        firm_name: 'Test Firm',
        auto_setup_chatwoot: false,
      });

      expect(mockChatwoot.provisionFullAccount).not.toHaveBeenCalled();

      (env as any).CHATWOOT_PLATFORM_TOKEN = '';
    });
  });

  describe('provisionChatwoot', () => {
    it('provisions and updates tenant on success', async () => {
      const tenant = makeTenant();
      mockChatwoot.provisionFullAccount.mockResolvedValue({
        chatwoot_account_id: 5,
        chatwoot_inbox_id: 10,
        chatwoot_api_token: 'new-token',
      });
      mockRepo.updateChatwootSetupStatus.mockResolvedValue(tenant);
      mockRepo.update.mockResolvedValue(tenant);
      mockRepo.findById.mockResolvedValue(tenant);

      (env as any).CHATWOOT_PLATFORM_TOKEN = 'platform-token';
      (env as any).WEBHOOK_BASE_URL = 'https://example.com';

      await tenantService.provisionChatwoot('uuid-1', 'test-tenant', 'Test Firm');

      expect(mockRepo.updateChatwootSetupStatus).toHaveBeenCalledWith('uuid-1', 'pending');
      expect(mockChatwoot.provisionFullAccount).toHaveBeenCalledWith({
        platformToken: 'platform-token',
        tenantSlug: 'test-tenant',
        firmName: 'Test Firm',
        webhookBaseUrl: 'https://example.com',
      });
      expect(mockRepo.update).toHaveBeenCalledWith('uuid-1', {
        chatwoot_account_id: 5,
        chatwoot_inbox_id: 10,
        chatwoot_api_token: 'new-token',
      });
      expect(mockRepo.updateChatwootSetupStatus).toHaveBeenCalledWith('uuid-1', 'completed');

      (env as any).CHATWOOT_PLATFORM_TOKEN = '';
    });

    it('sets failed status on error', async () => {
      mockChatwoot.provisionFullAccount.mockRejectedValue(new Error('Connection refused'));
      mockRepo.updateChatwootSetupStatus.mockResolvedValue(makeTenant());

      (env as any).CHATWOOT_PLATFORM_TOKEN = 'platform-token';
      (env as any).WEBHOOK_BASE_URL = 'https://example.com';

      await tenantService.provisionChatwoot('uuid-1', 'test-tenant', 'Test Firm');

      expect(mockRepo.updateChatwootSetupStatus).toHaveBeenCalledWith('uuid-1', 'failed', 'Connection refused');

      (env as any).CHATWOOT_PLATFORM_TOKEN = '';
    });
  });
});

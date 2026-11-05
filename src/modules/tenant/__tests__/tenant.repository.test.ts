import { tenantRepository } from '../tenant.repository';
import { pool } from '../../../config/database';
import { encrypt } from '../../../utils/crypto';

jest.mock('../../../utils/crypto');
const mockQuery = pool.query as jest.Mock;
const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;

describe('tenantRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all tenants ordered by created_at', async () => {
      const mockRows = [{ id: '1', slug: 'a' }, { id: '2', slug: 'b' }];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await tenantRepository.findAll();
      expect(result).toEqual(mockRows);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenants ORDER BY created_at DESC'
      );
    });
  });

  describe('findById', () => {
    it('returns tenant when found', async () => {
      const tenant = { id: 'uuid-1', slug: 'test' };
      mockQuery.mockResolvedValue({ rows: [tenant] });

      const result = await tenantRepository.findById('uuid-1');
      expect(result).toEqual(tenant);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenants WHERE id = $1',
        ['uuid-1']
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await tenantRepository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('returns active tenant by slug', async () => {
      const tenant = { id: 'uuid-1', slug: 'my-firm', status: 'active' };
      mockQuery.mockResolvedValue({ rows: [tenant] });

      const result = await tenantRepository.findBySlug('my-firm');
      expect(result).toEqual(tenant);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenants WHERE slug = $1 AND status = $2',
        ['my-firm', 'active']
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await tenantRepository.findBySlug('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates tenant without database_credentials', async () => {
      const input = {
        slug: 'new-tenant',
        firm_name: 'New Firm',
        viber_auth_token: 'vtoken',
      };
      const created = { id: 'uuid-new', ...input };
      mockQuery.mockResolvedValue({ rows: [created] });

      const result = await tenantRepository.create(input);
      expect(result).toEqual(created);
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        expect.arrayContaining([input.slug, input.firm_name, 'vtoken', null, null])
      );
    });

    it('creates tenant with telegram_bot_token', async () => {
      const input = {
        slug: 'tg-tenant',
        firm_name: 'TG Firm',
        telegram_bot_token: 'tg-token-123',
      };
      const created = { id: 'uuid-tg', ...input };
      mockQuery.mockResolvedValue({ rows: [created] });

      const result = await tenantRepository.create(input);
      expect(result).toEqual(created);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        expect.arrayContaining([input.slug, input.firm_name, null, 'tg-token-123'])
      );
    });

    it('creates tenant with explicit session_timeout_hours', async () => {
      const input = {
        slug: 'new-tenant',
        firm_name: 'New Firm',
        session_timeout_hours: 48,
      };
      const created = { id: 'uuid-new', ...input };
      mockQuery.mockResolvedValue({ rows: [created] });

      const result = await tenantRepository.create(input);
      expect(result).toEqual(created);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        expect.arrayContaining([48])
      );
    });

    it('creates tenant with agent_timeout_seconds=0 (AI-First mode)', async () => {
      const input = {
        slug: 'ai-first',
        firm_name: 'AI First Co',
        agent_timeout_seconds: 0,
      };
      const created = { id: 'uuid-ai', ...input };
      mockQuery.mockResolvedValue({ rows: [created] });

      const result = await tenantRepository.create(input);
      expect(result).toEqual(created);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        expect.arrayContaining([0])
      );
    });

    it('creates tenant with encrypted database_credentials', async () => {
      const input = {
        slug: 'new-tenant',
        firm_name: 'New Firm',
        viber_auth_token: 'vtoken',
        database_credentials: '{"host":"db.example.com"}',
      };
      const encBuf = Buffer.from('encrypted-data');
      mockEncrypt.mockReturnValue(encBuf);
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-new' }] });

      await tenantRepository.create(input);
      expect(mockEncrypt).toHaveBeenCalledWith(input.database_credentials);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        expect.arrayContaining([encBuf])
      );
    });
  });

  describe('update', () => {
    it('updates partial fields', async () => {
      const updated = { id: 'uuid-1', firm_name: 'Updated Firm' };
      mockQuery.mockResolvedValue({ rows: [updated] });

      const result = await tenantRepository.update('uuid-1', { firm_name: 'Updated Firm' });
      expect(result).toEqual(updated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenants SET firm_name'),
        expect.arrayContaining(['Updated Firm', 'uuid-1'])
      );
    });

    it('returns existing tenant when no fields to update', async () => {
      const existing = { id: 'uuid-1', slug: 'test' };
      mockQuery.mockResolvedValue({ rows: [existing] });

      const result = await tenantRepository.update('uuid-1', {});
      expect(result).toEqual(existing);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenants WHERE id = $1',
        ['uuid-1']
      );
    });

    it('encrypts database_credentials when updating', async () => {
      const encBuf = Buffer.from('new-encrypted');
      mockEncrypt.mockReturnValue(encBuf);
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });

      await tenantRepository.update('uuid-1', { database_credentials: '{"new":"creds"}' });
      expect(mockEncrypt).toHaveBeenCalledWith('{"new":"creds"}');
    });

    it('updates slug field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { slug: 'new-slug' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('slug = $1'),
        ['new-slug', 'uuid-1']
      );
    });

    it('updates viber_auth_token field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { viber_auth_token: 'new-token' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('viber_auth_token = $1'),
        ['new-token', 'uuid-1']
      );
    });

    it('updates telegram_bot_token field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { telegram_bot_token: 'tg-new' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('telegram_bot_token = $1'),
        ['tg-new', 'uuid-1']
      );
    });

    it('updates database_type field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { database_type: 'postgresql' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('database_type = $1'),
        ['postgresql', 'uuid-1']
      );
    });

    it('updates system_prompt field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { system_prompt: 'New prompt' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('system_prompt = $1'),
        ['New prompt', 'uuid-1']
      );
    });

    it('updates chatwoot_account_id field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { chatwoot_account_id: 10 });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('chatwoot_account_id = $1'),
        [10, 'uuid-1']
      );
    });

    it('updates chatwoot_inbox_id field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { chatwoot_inbox_id: 20 });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('chatwoot_inbox_id = $1'),
        [20, 'uuid-1']
      );
    });

    it('updates chatwoot_api_token field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { chatwoot_api_token: 'cw-new' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('chatwoot_api_token = $1'),
        ['cw-new', 'uuid-1']
      );
    });

    it('updates timezone field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { timezone: 'UTC' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('timezone = $1'),
        ['UTC', 'uuid-1']
      );
    });

    it('updates working_hours as JSON string', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      const hours = { monday: { start: '09:00', end: '17:00' } };
      await tenantRepository.update('uuid-1', { working_hours: hours });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('working_hours = $1'),
        [JSON.stringify(hours), 'uuid-1']
      );
    });

    it('updates handover_keywords field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { handover_keywords: ['help', 'agent'] });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('handover_keywords = $1'),
        [['help', 'agent'], 'uuid-1']
      );
    });

    it('updates agent_timeout_seconds field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { agent_timeout_seconds: 300 });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('agent_timeout_seconds = $1'),
        [300, 'uuid-1']
      );
    });

    it('updates session_timeout_hours field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { session_timeout_hours: 48 });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('session_timeout_hours = $1'),
        [48, 'uuid-1']
      );
    });

    it('updates status field', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });
      await tenantRepository.update('uuid-1', { status: 'suspended' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        ['suspended', 'uuid-1']
      );
    });

    it('builds correct query with multiple fields and sequential indices', async () => {
      const encBuf = Buffer.from('encrypted');
      mockEncrypt.mockReturnValue(encBuf);
      mockQuery.mockResolvedValue({ rows: [{ id: 'uuid-1' }] });

      await tenantRepository.update('uuid-1', {
        slug: 'slug',
        firm_name: 'name',
        viber_auth_token: 'token',
        telegram_bot_token: 'tg-token',
        database_type: 'postgresql',
        database_credentials: '{}',
        system_prompt: 'prompt',
        chatwoot_account_id: 10,
        chatwoot_inbox_id: 20,
        chatwoot_api_token: 'cw',
        timezone: 'UTC',
        working_hours: { monday: { start: '09:00', end: '17:00' } },
        handover_keywords: ['help'],
        agent_timeout_seconds: 300,
        session_timeout_hours: 48,
        status: 'inactive',
      });

      const [query, values] = mockQuery.mock.calls[0];
      // All 16 fields + id = 17 values
      expect(values).toHaveLength(17);
      expect(query).toContain('slug = $1');
      expect(query).toContain('agent_timeout_seconds = $14');
      expect(query).toContain('session_timeout_hours = $15');
      expect(query).toContain('status = $16');
      expect(query).toContain('WHERE id = $17');
      expect(query).toContain('updated_at = NOW()');
    });

    it('returns null when updated tenant not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await tenantRepository.update('nonexistent', { firm_name: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('deactivate', () => {
    it('sets status to inactive', async () => {
      const deactivated = { id: 'uuid-1', status: 'inactive' };
      mockQuery.mockResolvedValue({ rows: [deactivated] });

      const result = await tenantRepository.deactivate('uuid-1');
      expect(result).toEqual(deactivated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'inactive'"),
        ['uuid-1']
      );
    });

    it('returns null when tenant not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await tenantRepository.deactivate('nonexistent');
      expect(result).toBeNull();
    });
  });
});

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
        expect.arrayContaining([input.slug, input.firm_name, input.viber_auth_token, null, null])
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

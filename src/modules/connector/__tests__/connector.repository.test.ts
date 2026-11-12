import { connectorRepository } from '../connector.repository';
import { pool } from '../../../config/database';
import { encrypt } from '../../../utils/crypto';

jest.mock('../../../utils/crypto');
const mockQuery = pool.query as jest.Mock;
const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;

describe('connectorRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findByTenantId', () => {
    it('returns all connectors for tenant ordered by priority', async () => {
      const rows = [
        { id: 'c-1', tenant_id: 't-1', name: 'products', priority: 0 },
        { id: 'c-2', tenant_id: 't-1', name: 'prices', priority: 1 },
      ];
      mockQuery.mockResolvedValue({ rows });

      const result = await connectorRepository.findByTenantId('t-1');
      expect(result).toEqual(rows);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenant_connectors WHERE tenant_id = $1 ORDER BY priority ASC, created_at ASC',
        ['t-1']
      );
    });

    it('returns empty array when no connectors', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await connectorRepository.findByTenantId('t-1');
      expect(result).toEqual([]);
    });
  });

  describe('findActiveByTenantId', () => {
    it('returns only active connectors', async () => {
      const rows = [{ id: 'c-1', is_active: true }];
      mockQuery.mockResolvedValue({ rows });

      const result = await connectorRepository.findActiveByTenantId('t-1');
      expect(result).toEqual(rows);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenant_connectors WHERE tenant_id = $1 AND is_active = true ORDER BY priority ASC, created_at ASC',
        ['t-1']
      );
    });
  });

  describe('findById', () => {
    it('returns connector when found', async () => {
      const connector = { id: 'c-1', name: 'products' };
      mockQuery.mockResolvedValue({ rows: [connector] });

      const result = await connectorRepository.findById('c-1');
      expect(result).toEqual(connector);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenant_connectors WHERE id = $1',
        ['c-1']
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await connectorRepository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates connector with encrypted credentials', async () => {
      const encBuf = Buffer.from('encrypted-creds');
      mockEncrypt.mockReturnValue(encBuf);
      const created = { id: 'c-new', name: 'products' };
      mockQuery.mockResolvedValue({ rows: [created] });

      const result = await connectorRepository.create('t-1', {
        name: 'products',
        database_type: 'google_sheets',
        database_credentials: '{"spreadsheet_id":"abc"}',
      });

      expect(result).toEqual(created);
      expect(mockEncrypt).toHaveBeenCalledWith('{"spreadsheet_id":"abc"}');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_connectors'),
        ['t-1', 'products', null, 'google_sheets', encBuf, true, 0]
      );
    });

    it('creates connector with optional fields', async () => {
      const encBuf = Buffer.from('enc');
      mockEncrypt.mockReturnValue(encBuf);
      mockQuery.mockResolvedValue({ rows: [{ id: 'c-new' }] });

      await connectorRepository.create('t-1', {
        name: 'data',
        description: 'My data source',
        database_type: 'postgresql',
        database_credentials: '{}',
        is_active: false,
        priority: 5,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_connectors'),
        ['t-1', 'data', 'My data source', 'postgresql', encBuf, false, 5]
      );
    });

    it('defaults is_active to true and priority to 0', async () => {
      mockEncrypt.mockReturnValue(Buffer.from('enc'));
      mockQuery.mockResolvedValue({ rows: [{ id: 'c-new' }] });

      await connectorRepository.create('t-1', {
        name: 'test',
        database_type: 'google_sheets',
        database_credentials: '{}',
      });

      const values = mockQuery.mock.calls[0][1];
      expect(values[5]).toBe(true);  // is_active default
      expect(values[6]).toBe(0);     // priority default
    });
  });

  describe('update', () => {
    it('updates single field', async () => {
      const updated = { id: 'c-1', name: 'new-name' };
      mockQuery.mockResolvedValue({ rows: [updated] });

      const result = await connectorRepository.update('c-1', { name: 'new-name' });
      expect(result).toEqual(updated);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('name = $1'),
        ['new-name', 'c-1']
      );
    });

    it('encrypts database_credentials on update', async () => {
      const encBuf = Buffer.from('new-encrypted');
      mockEncrypt.mockReturnValue(encBuf);
      mockQuery.mockResolvedValue({ rows: [{ id: 'c-1' }] });

      await connectorRepository.update('c-1', { database_credentials: '{"new":"creds"}' });
      expect(mockEncrypt).toHaveBeenCalledWith('{"new":"creds"}');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('database_credentials = $1'),
        [encBuf, 'c-1']
      );
    });

    it('updates multiple fields with sequential indices', async () => {
      const encBuf = Buffer.from('enc');
      mockEncrypt.mockReturnValue(encBuf);
      mockQuery.mockResolvedValue({ rows: [{ id: 'c-1' }] });

      await connectorRepository.update('c-1', {
        name: 'updated',
        description: 'new desc',
        database_type: 'postgresql',
        database_credentials: '{}',
        is_active: false,
        priority: 3,
      });

      const [query, values] = mockQuery.mock.calls[0];
      expect(values).toHaveLength(7); // 6 fields + id
      expect(query).toContain('name = $1');
      expect(query).toContain('description = $2');
      expect(query).toContain('database_type = $3');
      expect(query).toContain('database_credentials = $4');
      expect(query).toContain('is_active = $5');
      expect(query).toContain('priority = $6');
      expect(query).toContain('updated_at = NOW()');
      expect(query).toContain('WHERE id = $7');
    });

    it('returns existing connector when no fields to update', async () => {
      const existing = { id: 'c-1', name: 'products' };
      mockQuery.mockResolvedValue({ rows: [existing] });

      const result = await connectorRepository.update('c-1', {});
      expect(result).toEqual(existing);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM tenant_connectors WHERE id = $1',
        ['c-1']
      );
    });

    it('returns null when connector not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await connectorRepository.update('nonexistent', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when connector deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await connectorRepository.delete('c-1');
      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM tenant_connectors WHERE id = $1',
        ['c-1']
      );
    });

    it('returns false when connector not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await connectorRepository.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      const result = await connectorRepository.delete('c-1');
      expect(result).toBe(false);
    });
  });
});

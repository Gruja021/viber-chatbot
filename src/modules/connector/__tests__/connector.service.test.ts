import { connectorService } from '../connector.service';
import { connectorRepository } from '../connector.repository';
import { TenantConnector } from '../connector.types';
import { createConnectorFromConfig } from '../connector.factory';

jest.mock('../connector.repository');
jest.mock('../connector.factory');

const mockRepo = connectorRepository as jest.Mocked<typeof connectorRepository>;
const mockCreateFromConfig = createConnectorFromConfig as jest.MockedFunction<typeof createConnectorFromConfig>;

function makeConnector(overrides: Partial<TenantConnector> = {}): TenantConnector {
  return {
    id: 'c-1',
    tenant_id: 't-1',
    name: 'products',
    description: 'Product catalog',
    database_type: 'google_sheets',
    database_credentials: Buffer.from('encrypted'),
    is_active: true,
    priority: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('connectorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConnectors', () => {
    it('returns public connectors (credentials stripped)', async () => {
      mockRepo.findByTenantId.mockResolvedValue([makeConnector()]);

      const result = await connectorService.getConnectors('t-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('has_credentials', true);
      expect(result[0]).not.toHaveProperty('database_credentials');
      expect(result[0]).toHaveProperty('name', 'products');
    });

    it('returns empty array when no connectors', async () => {
      mockRepo.findByTenantId.mockResolvedValue([]);
      const result = await connectorService.getConnectors('t-1');
      expect(result).toEqual([]);
    });
  });

  describe('createConnector', () => {
    it('creates connector and returns public object', async () => {
      mockRepo.create.mockResolvedValue(makeConnector());

      const result = await connectorService.createConnector('t-1', {
        name: 'products',
        database_type: 'google_sheets',
        database_credentials: '{"spreadsheet_id":"abc"}',
      });

      expect(result).toHaveProperty('id', 'c-1');
      expect(result).toHaveProperty('has_credentials', true);
      expect(result).not.toHaveProperty('database_credentials');
      expect(mockRepo.create).toHaveBeenCalledWith('t-1', expect.objectContaining({ name: 'products' }));
    });
  });

  describe('updateConnector', () => {
    it('returns updated public connector', async () => {
      mockRepo.update.mockResolvedValue(makeConnector({ name: 'updated' }));

      const result = await connectorService.updateConnector('c-1', { name: 'updated' });

      expect(result).toHaveProperty('name', 'updated');
      expect(result).not.toHaveProperty('database_credentials');
    });

    it('returns null when connector not found', async () => {
      mockRepo.update.mockResolvedValue(null);
      const result = await connectorService.updateConnector('missing', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('deleteConnector', () => {
    it('returns true on success', async () => {
      mockRepo.delete.mockResolvedValue(true);
      const result = await connectorService.deleteConnector('c-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockRepo.delete.mockResolvedValue(false);
      const result = await connectorService.deleteConnector('missing');
      expect(result).toBe(false);
    });
  });

  describe('testConnector', () => {
    it('returns success when connection works', async () => {
      mockRepo.findById.mockResolvedValue(makeConnector());
      mockCreateFromConfig.mockReturnValue({
        query: jest.fn(),
        testConnection: jest.fn().mockResolvedValue(true),
      });

      const result = await connectorService.testConnector('c-1');
      expect(result.success).toBe(true);
      expect(result.detail).toContain('connected');
    });

    it('returns failure when connection fails', async () => {
      mockRepo.findById.mockResolvedValue(makeConnector());
      mockCreateFromConfig.mockReturnValue({
        query: jest.fn(),
        testConnection: jest.fn().mockResolvedValue(false),
      });

      const result = await connectorService.testConnector('c-1');
      expect(result.success).toBe(false);
    });

    it('returns failure when connector not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      const result = await connectorService.testConnector('missing');
      expect(result.success).toBe(false);
      expect(result.detail).toContain('not found');
    });

    it('returns failure when createConnectorFromConfig returns null', async () => {
      mockRepo.findById.mockResolvedValue(makeConnector());
      mockCreateFromConfig.mockReturnValue(null);

      const result = await connectorService.testConnector('c-1');
      expect(result.success).toBe(false);
    });

    it('handles testConnection throwing error', async () => {
      mockRepo.findById.mockResolvedValue(makeConnector());
      mockCreateFromConfig.mockReturnValue({
        query: jest.fn(),
        testConnection: jest.fn().mockRejectedValue(new Error('timeout')),
      });

      const result = await connectorService.testConnector('c-1');
      expect(result.success).toBe(false);
      expect(result.detail).toContain('error');
    });
  });
});

import { logger } from '../../config/logger';
import { connectorRepository } from './connector.repository';
import { TenantConnector, TenantConnectorPublic, CreateConnectorInput, UpdateConnectorInput } from './connector.types';
import { createConnectorFromConfig } from './connector.factory';

function toPublic(connector: TenantConnector): TenantConnectorPublic {
  return {
    id: connector.id,
    tenant_id: connector.tenant_id,
    name: connector.name,
    description: connector.description,
    database_type: connector.database_type,
    has_credentials: !!connector.database_credentials,
    is_active: connector.is_active,
    priority: connector.priority,
    created_at: connector.created_at,
    updated_at: connector.updated_at,
  };
}

export const connectorService = {
  async getConnectors(tenantId: string): Promise<TenantConnectorPublic[]> {
    const connectors = await connectorRepository.findByTenantId(tenantId);
    return connectors.map(toPublic);
  },

  async createConnector(tenantId: string, input: CreateConnectorInput): Promise<TenantConnectorPublic> {
    const connector = await connectorRepository.create(tenantId, input);
    logger.info({ tenantId, connectorId: connector.id, name: connector.name }, 'Connector created');
    return toPublic(connector);
  },

  async updateConnector(id: string, input: UpdateConnectorInput): Promise<TenantConnectorPublic | null> {
    const updated = await connectorRepository.update(id, input);
    if (!updated) return null;
    logger.info({ connectorId: id }, 'Connector updated');
    return toPublic(updated);
  },

  async deleteConnector(id: string): Promise<boolean> {
    const deleted = await connectorRepository.delete(id);
    if (deleted) logger.info({ connectorId: id }, 'Connector deleted');
    return deleted;
  },

  async testConnector(id: string): Promise<{ success: boolean; detail: string }> {
    const connectorRow = await connectorRepository.findById(id);
    if (!connectorRow) {
      return { success: false, detail: 'Connector not found' };
    }

    try {
      const instance = createConnectorFromConfig(connectorRow);
      if (!instance) {
        return { success: false, detail: 'Failed to create connector instance' };
      }
      const ok = await instance.testConnection();
      return {
        success: ok,
        detail: ok ? `${connectorRow.database_type} connected` : `${connectorRow.database_type} connection failed`,
      };
    } catch (err) {
      logger.error({ err, connectorId: id }, 'Connector test failed');
      return { success: false, detail: 'Connection test error' };
    }
  },
};

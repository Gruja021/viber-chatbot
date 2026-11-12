import { logger } from '../../config/logger';
import { decrypt } from '../../utils/crypto';
import { Tenant, DatabaseType } from '../tenant/tenant.model';
import { IDataConnector, GoogleSheetsCredentials, WooCommerceCredentials, SQLCredentials, RestAPICredentials, TenantConnector } from './connector.types';
import { GoogleSheetsConnector } from './GoogleSheetsConnector';
import { WooCommerceConnector } from './WooCommerceConnector';
import { SQLConnector } from './SQLConnector';
import { RestAPIConnector } from './RestAPIConnector';

function buildConnector(dbType: DatabaseType, decryptedCredentials: string): IDataConnector | null {
  const credentials = JSON.parse(decryptedCredentials);

  switch (dbType) {
    case 'google_sheets':
      return new GoogleSheetsConnector(credentials as GoogleSheetsCredentials);
    case 'woocommerce':
      return new WooCommerceConnector(credentials as WooCommerceCredentials);
    case 'postgresql':
      return new SQLConnector(credentials as SQLCredentials, 'postgresql');
    case 'mysql':
      return new SQLConnector(credentials as SQLCredentials, 'mysql');
    case 'rest_api':
      return new RestAPIConnector(credentials as RestAPICredentials);
    default:
      return null;
  }
}

export function createConnector(tenant: Tenant): IDataConnector | null {
  if (!tenant.database_type || !tenant.database_credentials) {
    return null;
  }

  try {
    const decrypted = decrypt(tenant.database_credentials);
    return buildConnector(tenant.database_type, decrypted);
  } catch (err) {
    logger.error({ err, tenantId: tenant.id }, 'Failed to create connector');
    return null;
  }
}

export function createConnectorFromConfig(config: TenantConnector): IDataConnector | null {
  try {
    const decrypted = decrypt(config.database_credentials);
    return buildConnector(config.database_type, decrypted);
  } catch (err) {
    logger.error({ err, connectorId: config.id }, 'Failed to create connector from config');
    return null;
  }
}

export function createConnectorsForTenant(connectors: TenantConnector[]): Map<string, IDataConnector> {
  const map = new Map<string, IDataConnector>();
  for (const config of connectors) {
    const instance = createConnectorFromConfig(config);
    if (instance) {
      map.set(config.name, instance);
    }
  }
  return map;
}

import { logger } from '../../config/logger';
import { decrypt } from '../../utils/crypto';
import { Tenant } from '../tenant/tenant.model';
import { IDataConnector, GoogleSheetsCredentials, WooCommerceCredentials, SQLCredentials } from './connector.types';
import { GoogleSheetsConnector } from './GoogleSheetsConnector';
import { WooCommerceConnector } from './WooCommerceConnector';
import { SQLConnector } from './SQLConnector';

export function createConnector(tenant: Tenant): IDataConnector | null {
  if (!tenant.database_type || !tenant.database_credentials) {
    return null;
  }

  try {
    const decrypted = decrypt(tenant.database_credentials);
    const credentials = JSON.parse(decrypted);

    switch (tenant.database_type) {
      case 'google_sheets':
        return new GoogleSheetsConnector(credentials as GoogleSheetsCredentials);
      case 'woocommerce':
        return new WooCommerceConnector(credentials as WooCommerceCredentials);
      case 'postgresql':
        return new SQLConnector(credentials as SQLCredentials, 'postgresql');
      case 'mysql':
        return new SQLConnector(credentials as SQLCredentials, 'mysql');
      default:
        logger.warn({ databaseType: tenant.database_type }, 'Unknown database type');
        return null;
    }
  } catch (err) {
    logger.error({ err, tenantId: tenant.id }, 'Failed to create connector');
    return null;
  }
}

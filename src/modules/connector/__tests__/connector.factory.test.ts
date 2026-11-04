import { createConnector } from '../connector.factory';
import { GoogleSheetsConnector } from '../GoogleSheetsConnector';
import { WooCommerceConnector } from '../WooCommerceConnector';
import { SQLConnector } from '../SQLConnector';
import { encrypt } from '../../../utils/crypto';
import { Tenant } from '../../tenant/tenant.model';

jest.mock('../GoogleSheetsConnector');
jest.mock('../WooCommerceConnector');
jest.mock('../SQLConnector');

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-1',
    slug: 'test',
    firm_name: 'Test',
    viber_auth_token: 'token',
    telegram_bot_token: null,
    database_type: null,
    database_credentials: null,
    system_prompt: '',
    chatwoot_account_id: null,
    chatwoot_inbox_id: null,
    chatwoot_api_token: null,
    timezone: 'Europe/Belgrade',
    working_hours: {},
    handover_keywords: [],
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('createConnector', () => {
  it('returns null when database_type is null', () => {
    const tenant = makeTenant();
    expect(createConnector(tenant)).toBeNull();
  });

  it('returns null when database_credentials is null', () => {
    const tenant = makeTenant({ database_type: 'google_sheets' });
    expect(createConnector(tenant)).toBeNull();
  });

  it('creates GoogleSheetsConnector for google_sheets type', () => {
    const creds = { spreadsheet_id: 'abc', service_account_key: {} };
    const tenant = makeTenant({
      database_type: 'google_sheets',
      database_credentials: encrypt(JSON.stringify(creds)),
    });

    const connector = createConnector(tenant);
    expect(connector).toBeInstanceOf(GoogleSheetsConnector);
  });

  it('creates WooCommerceConnector for woocommerce type', () => {
    const creds = { store_url: 'https://shop.test', consumer_key: 'ck', consumer_secret: 'cs' };
    const tenant = makeTenant({
      database_type: 'woocommerce',
      database_credentials: encrypt(JSON.stringify(creds)),
    });

    const connector = createConnector(tenant);
    expect(connector).toBeInstanceOf(WooCommerceConnector);
  });

  it('creates SQLConnector for postgresql type', () => {
    const creds = { host: 'localhost', port: 5432, database: 'db', user: 'u', password: 'p', table_name: 't', search_columns: ['c'] };
    const tenant = makeTenant({
      database_type: 'postgresql',
      database_credentials: encrypt(JSON.stringify(creds)),
    });

    const connector = createConnector(tenant);
    expect(connector).toBeInstanceOf(SQLConnector);
  });

  it('creates SQLConnector for mysql type', () => {
    const creds = { host: 'localhost', port: 3306, database: 'db', user: 'u', password: 'p', table_name: 't', search_columns: ['c'] };
    const tenant = makeTenant({
      database_type: 'mysql',
      database_credentials: encrypt(JSON.stringify(creds)),
    });

    const connector = createConnector(tenant);
    expect(connector).toBeInstanceOf(SQLConnector);
  });

  it('returns null for invalid encrypted data', () => {
    const tenant = makeTenant({
      database_type: 'google_sheets',
      database_credentials: Buffer.from('invalid'),
    });

    expect(createConnector(tenant)).toBeNull();
  });
});

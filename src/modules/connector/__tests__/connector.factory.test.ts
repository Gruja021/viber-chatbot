import { createConnector, createConnectorFromConfig, createConnectorsForTenant } from '../connector.factory';
import { GoogleSheetsConnector } from '../GoogleSheetsConnector';
import { WooCommerceConnector } from '../WooCommerceConnector';
import { SQLConnector } from '../SQLConnector';
import { RestAPIConnector } from '../RestAPIConnector';
import { encrypt } from '../../../utils/crypto';
import { Tenant } from '../../tenant/tenant.model';
import { TenantConnector } from '../connector.types';

jest.mock('../GoogleSheetsConnector');
jest.mock('../WooCommerceConnector');
jest.mock('../SQLConnector');
jest.mock('../RestAPIConnector');

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
    openai_api_key: null,
    openai_model: null,
    chatwoot_account_id: null,
    chatwoot_inbox_id: null,
    chatwoot_api_token: null,
    timezone: 'Europe/Belgrade',
    working_hours: {},
    handover_keywords: [],
    agent_timeout_seconds: 180,
    session_timeout_hours: 24,
    chatwoot_setup_status: 'none',
    chatwoot_setup_error: null,
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

  it('creates RestAPIConnector for rest_api type', () => {
    const creds = { base_url: 'https://api.example.com', search_endpoint: '/api/offers', search_param: 'search' };
    const tenant = makeTenant({
      database_type: 'rest_api',
      database_credentials: encrypt(JSON.stringify(creds)),
    });

    const connector = createConnector(tenant);
    expect(connector).toBeInstanceOf(RestAPIConnector);
  });

  it('returns null for invalid encrypted data', () => {
    const tenant = makeTenant({
      database_type: 'google_sheets',
      database_credentials: Buffer.from('invalid'),
    });

    expect(createConnector(tenant)).toBeNull();
  });
});

function makeConnectorConfig(overrides: Partial<TenantConnector> = {}): TenantConnector {
  return {
    id: 'c-1',
    tenant_id: 't-1',
    name: 'products',
    description: 'Product catalog',
    database_type: 'google_sheets',
    database_credentials: encrypt(JSON.stringify({ spreadsheet_id: 'abc', service_account_key: {} })),
    is_active: true,
    priority: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('createConnectorFromConfig', () => {
  it('creates connector from TenantConnector config', () => {
    const config = makeConnectorConfig();
    const connector = createConnectorFromConfig(config);
    expect(connector).toBeInstanceOf(GoogleSheetsConnector);
  });

  it('returns null for invalid encrypted data', () => {
    const config = makeConnectorConfig({
      database_credentials: Buffer.from('invalid'),
    });
    expect(createConnectorFromConfig(config)).toBeNull();
  });

  it('creates RestAPIConnector from config', () => {
    const config = makeConnectorConfig({
      database_type: 'rest_api',
      database_credentials: encrypt(JSON.stringify({ base_url: 'https://api.test', search_endpoint: '/search', search_param: 'q' })),
    });
    expect(createConnectorFromConfig(config)).toBeInstanceOf(RestAPIConnector);
  });
});

describe('createConnectorsForTenant', () => {
  it('creates a map of named connectors', () => {
    const configs = [
      makeConnectorConfig({ name: 'products' }),
      makeConnectorConfig({
        name: 'prices',
        database_type: 'rest_api',
        database_credentials: encrypt(JSON.stringify({ base_url: 'https://api.test', search_endpoint: '/search', search_param: 'q' })),
      }),
    ];

    const map = createConnectorsForTenant(configs);
    expect(map.size).toBe(2);
    expect(map.has('products')).toBe(true);
    expect(map.has('prices')).toBe(true);
  });

  it('skips connectors that fail to create', () => {
    const configs = [
      makeConnectorConfig({ name: 'good' }),
      makeConnectorConfig({ name: 'bad', database_credentials: Buffer.from('invalid') }),
    ];

    const map = createConnectorsForTenant(configs);
    expect(map.size).toBe(1);
    expect(map.has('good')).toBe(true);
    expect(map.has('bad')).toBe(false);
  });

  it('returns empty map for empty input', () => {
    const map = createConnectorsForTenant([]);
    expect(map.size).toBe(0);
  });
});

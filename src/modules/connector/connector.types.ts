export interface ConnectorQueryResult {
  success: boolean;
  data: Record<string, unknown>[];
  total_results: number;
  source: string;
  query_description: string;
}

export interface IDataConnector {
  query(searchTerm: string): Promise<ConnectorQueryResult>;
  testConnection(): Promise<boolean>;
}

export interface GoogleSheetsCredentials {
  spreadsheet_id: string;
  sheet_name?: string;
  service_account_key: object;
}

export interface WooCommerceCredentials {
  store_url: string;
  consumer_key: string;
  consumer_secret: string;
}

export interface SQLCredentials {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  table_name: string;
  search_columns: string[];
  ssl?: boolean;
  ca?: string;
}

export interface RestAPICredentials {
  base_url: string;
  search_endpoint: string;
  search_param: string;
  headers?: Record<string, string>;
  result_path?: string;
}

// --- Multi-connector types ---

import { DatabaseType } from '../tenant/tenant.model';

export interface TenantConnector {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  database_type: DatabaseType;
  database_credentials: Buffer;
  is_active: boolean;
  priority: number;
  created_at: Date;
  updated_at: Date;
}

export interface TenantConnectorPublic {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  database_type: DatabaseType;
  has_credentials: boolean;
  is_active: boolean;
  priority: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateConnectorInput {
  name: string;
  description?: string;
  database_type: DatabaseType;
  database_credentials: string; // plaintext JSON, will be encrypted
  is_active?: boolean;
  priority?: number;
}

export interface UpdateConnectorInput {
  name?: string;
  description?: string;
  database_type?: DatabaseType;
  database_credentials?: string;
  is_active?: boolean;
  priority?: number;
}

export interface NamedConnectorQueryResult extends ConnectorQueryResult {
  connector_name: string;
}

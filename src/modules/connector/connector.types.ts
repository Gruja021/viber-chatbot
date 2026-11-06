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
}

export interface RestAPICredentials {
  base_url: string;
  search_endpoint: string;
  search_param: string;
  headers?: Record<string, string>;
  result_path?: string;
}

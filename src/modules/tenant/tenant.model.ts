export type TenantStatus = 'active' | 'inactive' | 'suspended';
export type DatabaseType = 'google_sheets' | 'woocommerce' | 'postgresql' | 'mysql';

export interface Tenant {
  id: string;
  slug: string;
  firm_name: string;
  viber_auth_token: string;
  database_type: DatabaseType | null;
  database_credentials: Buffer | null;
  system_prompt: string;
  chatwoot_account_id: number | null;
  chatwoot_inbox_id: number | null;
  chatwoot_api_token: string | null;
  status: TenantStatus;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTenantInput {
  slug: string;
  firm_name: string;
  viber_auth_token: string;
  database_type?: DatabaseType;
  database_credentials?: string; // plaintext JSON, will be encrypted
  system_prompt?: string;
  chatwoot_account_id?: number;
  chatwoot_inbox_id?: number;
  chatwoot_api_token?: string;
}

export interface UpdateTenantInput {
  slug?: string;
  firm_name?: string;
  viber_auth_token?: string;
  database_type?: DatabaseType;
  database_credentials?: string;
  system_prompt?: string;
  chatwoot_account_id?: number;
  chatwoot_inbox_id?: number;
  chatwoot_api_token?: string;
  status?: TenantStatus;
}

export interface TenantPublic {
  id: string;
  slug: string;
  firm_name: string;
  database_type: DatabaseType | null;
  system_prompt: string;
  chatwoot_account_id: number | null;
  chatwoot_inbox_id: number | null;
  status: TenantStatus;
  created_at: Date;
  updated_at: Date;
}

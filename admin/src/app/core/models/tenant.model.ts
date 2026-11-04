export type TenantStatus = 'active' | 'inactive' | 'suspended';
export type DatabaseType = 'google_sheets' | 'woocommerce' | 'postgresql' | 'mysql';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface DaySchedule {
  start: string;
  end: string;
}

export type WorkingHours = Partial<Record<DayOfWeek, DaySchedule>>;

export interface Tenant {
  id: string;
  slug: string;
  firm_name: string;
  viber_auth_token: string | null;
  telegram_bot_token: string | null;
  database_type: DatabaseType | null;
  database_credentials: string | null;
  system_prompt: string;
  openai_api_key: string | null;
  openai_model: string | null;
  chatwoot_account_id: number | null;
  chatwoot_inbox_id: number | null;
  chatwoot_api_token: string | null;
  timezone: string;
  working_hours: WorkingHours;
  handover_keywords: string[];
  agent_timeout_seconds: number;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface TenantPublic {
  id: string;
  slug: string;
  firm_name: string;
  database_type: DatabaseType | null;
  system_prompt: string;
  chatwoot_account_id: number | null;
  chatwoot_inbox_id: number | null;
  timezone: string;
  working_hours: WorkingHours;
  handover_keywords: string[];
  agent_timeout_seconds: number;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface ChatwootAgent {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface CreateTenantInput {
  slug: string;
  firm_name: string;
  viber_auth_token?: string;
  telegram_bot_token?: string;
  database_type?: DatabaseType;
  database_credentials?: string;
  system_prompt?: string;
  openai_api_key?: string;
  openai_model?: string;
  chatwoot_account_id?: number;
  chatwoot_inbox_id?: number;
  chatwoot_api_token?: string;
  timezone?: string;
  working_hours?: WorkingHours;
  handover_keywords?: string[];
  agent_timeout_seconds?: number;
}

export interface UpdateTenantInput extends Partial<CreateTenantInput> {
  status?: TenantStatus;
}

export interface TenantHealthCheck {
  check: string;
  healthy: boolean;
  detail: string;
}

export interface TenantHealthResponse {
  tenant_id: string;
  checks: TenantHealthCheck[];
  allHealthy: boolean;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  timestamp: string;
}

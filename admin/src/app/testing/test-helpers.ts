import {
  Tenant,
  ChatwootAgent,
  SystemHealth,
  TenantHealthResponse,
  TenantConnector,
  ChatwootSetupStatus,
} from '../core/models/tenant.model';

export function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    slug: 'test-company',
    firm_name: 'Test Company',
    has_viber_token: true,
    has_telegram_token: true,
    database_type: 'google_sheets',
    has_database_credentials: true,
    system_prompt: 'You are a helpful assistant.',
    openai_model: 'gpt-4o',
    has_openai_api_key: true,
    chatwoot_account_id: 1,
    chatwoot_inbox_id: 10,
    timezone: 'Europe/Belgrade',
    working_hours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
    },
    handover_keywords: ['agent', 'human'],
    agent_timeout_seconds: 180,
    session_timeout_hours: 24,
    chatwoot_setup_status: 'none' as ChatwootSetupStatus,
    chatwoot_setup_error: null,
    monthly_credit_limit: null,
    credits_used: 0,
    bonus_credits: 0,
    credits_reset_at: null,
    per_conversation_message_limit: null,
    credit_limit_message: null,
    auto_escalate_media: true,
    status: 'active',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-06-01T12:00:00Z',
    ...overrides,
  };
}

export function makeChatwootAgent(
  overrides: Partial<ChatwootAgent> = {}
): ChatwootAgent {
  return {
    id: 1,
    name: 'Test Agent',
    email: 'agent@test.com',
    role: 'agent',
    ...overrides,
  };
}

export function makeSystemHealth(
  overrides: Partial<SystemHealth> = {}
): SystemHealth {
  return {
    status: 'ok',
    database: 'connected',
    redis: 'connected',
    timestamp: '2024-06-01T12:00:00Z',
    ...overrides,
  };
}

export function makeTenantConnector(
  overrides: Partial<TenantConnector> = {}
): TenantConnector {
  return {
    id: 'c-1',
    tenant_id: 'tenant-1',
    name: 'products',
    description: 'Product catalog',
    database_type: 'google_sheets',
    has_credentials: true,
    is_active: true,
    priority: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeTenantHealthResponse(
  overrides: Partial<TenantHealthResponse> = {}
): TenantHealthResponse {
  return {
    tenant_id: 'tenant-1',
    checks: [
      { check: 'database', healthy: true, detail: 'Connected' },
      { check: 'webhook', healthy: true, detail: 'Registered' },
    ],
    allHealthy: true,
    ...overrides,
  };
}

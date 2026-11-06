import {
  Tenant,
  ChatwootAgent,
  SystemHealth,
  TenantHealthResponse,
} from '../core/models/tenant.model';

export function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    slug: 'test-company',
    firm_name: 'Test Company',
    viber_auth_token: 'viber-token-123',
    telegram_bot_token: 'telegram-token-456',
    database_type: 'google_sheets',
    has_database_credentials: true,
    system_prompt: 'You are a helpful assistant.',
    openai_api_key: 'sk-test-key',
    openai_model: 'gpt-4o',
    has_openai_api_key: true,
    chatwoot_account_id: 1,
    chatwoot_inbox_id: 10,
    chatwoot_api_token: 'cw-token',
    timezone: 'Europe/Belgrade',
    working_hours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
    },
    handover_keywords: ['agent', 'human'],
    agent_timeout_seconds: 180,
    session_timeout_hours: 24,
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

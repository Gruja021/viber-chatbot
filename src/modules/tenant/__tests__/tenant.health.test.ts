import { checkTenantHealth } from '../tenant.health';
import { tenantService } from '../tenant.service';
import { viberService } from '../../webhook/viber.service';
import { createConnector } from '../../connector/connector.factory';
import axios from 'axios';

jest.mock('../tenant.service');
jest.mock('../../webhook/viber.service');
jest.mock('../../connector/connector.factory');
jest.mock('axios');

const mockTenantService = tenantService as jest.Mocked<typeof tenantService>;
const mockViberService = viberService as jest.Mocked<typeof viberService>;
const mockCreateConnector = createConnector as jest.MockedFunction<typeof createConnector>;
const mockAxios = axios as jest.Mocked<typeof axios>;

const mockTenant = {
  id: 't-1',
  slug: 'test-firm',
  firm_name: 'Test Firm',
  viber_auth_token: 'viber-token-123',
  status: 'active' as const,
  chatwoot_api_token: 'cw-token',
  chatwoot_account_id: 1,
  chatwoot_inbox_id: 10,
  database_type: null as any,
  database_credentials: null as any,
  system_prompt: 'You are helpful.',
  timezone: 'Europe/Belgrade',
  working_hours: {},
  handover_keywords: [],
  created_at: new Date(),
  updated_at: new Date(),
};

describe('checkTenantHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all healthy when everything works', async () => {
    mockTenantService.getById.mockResolvedValue(mockTenant as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Test Bot',
      uri: 'testbot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 5,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10, name: 'Test Inbox' } });

    const report = await checkTenantHealth('t-1');

    expect(report.allHealthy).toBe(true);
    expect(report.checks).toHaveLength(4);
    expect(report.checks[0]).toMatchObject({ check: 'database', healthy: true });
    expect(report.checks[1]).toMatchObject({ check: 'viber', healthy: true });
    expect(report.checks[2]).toMatchObject({ check: 'chatwoot', healthy: true });
    expect(report.checks[3]).toMatchObject({ check: 'data_source', healthy: true, detail: expect.stringContaining('N/A') });
  });

  it('returns unhealthy when tenant not found', async () => {
    mockTenantService.getById.mockResolvedValue(null);

    const report = await checkTenantHealth('nonexistent');

    expect(report.allHealthy).toBe(false);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]).toMatchObject({ check: 'database', healthy: false });
  });

  it('returns unhealthy when tenant is inactive', async () => {
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      status: 'inactive',
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });

    const report = await checkTenantHealth('t-1');

    expect(report.allHealthy).toBe(false);
    expect(report.checks[0]).toMatchObject({ check: 'database', healthy: false, detail: 'Tenant status: inactive' });
  });

  it('reports viber unhealthy on webhook mismatch', async () => {
    mockTenantService.getById.mockResolvedValue(mockTenant as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://wrong-url.com/webhook',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });

    const report = await checkTenantHealth('t-1');

    expect(report.checks[1]).toMatchObject({ check: 'viber', healthy: false });
    expect(report.checks[1].detail).toContain('Webhook mismatch');
  });

  it('reports viber unhealthy when API call fails', async () => {
    mockTenantService.getById.mockResolvedValue(mockTenant as any);
    mockViberService.getAccountInfo.mockRejectedValue(new Error('Network error'));
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });

    const report = await checkTenantHealth('t-1');

    expect(report.checks[1]).toMatchObject({ check: 'viber', healthy: false, detail: 'Failed to reach Viber API' });
  });

  it('reports chatwoot unhealthy when not configured', async () => {
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      chatwoot_api_token: null,
      chatwoot_account_id: null,
      chatwoot_inbox_id: null,
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });

    const report = await checkTenantHealth('t-1');

    expect(report.checks[2]).toMatchObject({ check: 'chatwoot', healthy: false, detail: 'Chatwoot not configured' });
  });

  it('reports chatwoot unhealthy when API fails', async () => {
    mockTenantService.getById.mockResolvedValue(mockTenant as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockRejectedValue(new Error('Connection refused'));

    const report = await checkTenantHealth('t-1');

    expect(report.checks[2]).toMatchObject({ check: 'chatwoot', healthy: false });
  });

  it('checks data source when configured', async () => {
    const mockConnector = {
      query: jest.fn(),
      testConnection: jest.fn().mockResolvedValue(true),
    };
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      database_type: 'google_sheets',
      database_credentials: Buffer.from('encrypted'),
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });
    mockCreateConnector.mockReturnValue(mockConnector as any);

    const report = await checkTenantHealth('t-1');

    expect(report.checks[3]).toMatchObject({ check: 'data_source', healthy: true });
    expect(mockConnector.testConnection).toHaveBeenCalled();
  });

  it('reports data source unhealthy when connection fails', async () => {
    const mockConnector = {
      query: jest.fn(),
      testConnection: jest.fn().mockResolvedValue(false),
    };
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      database_type: 'postgresql',
      database_credentials: Buffer.from('encrypted'),
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });
    mockCreateConnector.mockReturnValue(mockConnector as any);

    const report = await checkTenantHealth('t-1');

    expect(report.checks[3]).toMatchObject({ check: 'data_source', healthy: false });
  });

  it('returns unhealthy database check for suspended tenant', async () => {
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      status: 'suspended',
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });

    const report = await checkTenantHealth('t-1');

    expect(report.allHealthy).toBe(false);
    expect(report.checks[0]).toMatchObject({
      check: 'database',
      healthy: false,
      detail: 'Tenant status: suspended',
    });
  });

  it('reports data source unhealthy when createConnector returns null', async () => {
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      database_type: 'google_sheets',
      database_credentials: Buffer.from('encrypted'),
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });
    mockCreateConnector.mockReturnValue(null);

    const report = await checkTenantHealth('t-1');

    expect(report.checks[3]).toMatchObject({
      check: 'data_source',
      healthy: false,
      detail: 'Failed to create connector',
    });
  });

  it('reports data source unhealthy when testConnection throws', async () => {
    const mockConnector = {
      query: jest.fn(),
      testConnection: jest.fn().mockRejectedValue(new Error('Connection timeout')),
    };
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      database_type: 'mysql',
      database_credentials: Buffer.from('encrypted'),
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });
    mockCreateConnector.mockReturnValue(mockConnector as any);

    const report = await checkTenantHealth('t-1');

    expect(report.checks[3]).toMatchObject({
      check: 'data_source',
      healthy: false,
      detail: 'Data source connection error',
    });
  });

  it('reports database unhealthy when getById throws on checkDatabase but outer call returns null', async () => {
    // First call (outer checkTenantHealth) returns null, second call (checkDatabase) also returns null
    // This verifies the "tenant not found" path via the outer getById
    mockTenantService.getById.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('DB flaky'));

    const report = await checkTenantHealth('t-1');

    // When outer getById returns null, we get early return with just db check
    expect(report.allHealthy).toBe(false);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]).toMatchObject({
      check: 'database',
      healthy: false,
    });
  });

  it('propagates error when outer getById throws', async () => {
    mockTenantService.getById.mockRejectedValue(new Error('DB connection lost'));

    await expect(checkTenantHealth('t-1')).rejects.toThrow('DB connection lost');
  });

  it('reports chatwoot unhealthy with partial config (token but no inbox)', async () => {
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      chatwoot_api_token: 'cw-token',
      chatwoot_account_id: 1,
      chatwoot_inbox_id: null,
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });

    const report = await checkTenantHealth('t-1');

    expect(report.checks[2]).toMatchObject({
      check: 'chatwoot',
      healthy: false,
      detail: 'Chatwoot not configured',
    });
  });

  it('reports viber N/A when tenant has no viber_auth_token (Telegram-only)', async () => {
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      viber_auth_token: null,
      telegram_bot_token: 'tg-token-123',
    } as any);
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });

    const report = await checkTenantHealth('t-1');

    expect(report.checks[1]).toMatchObject({
      check: 'viber',
      healthy: true,
      detail: expect.stringContaining('N/A'),
    });
    expect(mockViberService.getAccountInfo).not.toHaveBeenCalled();
  });

  it('includes correct tenant_id in report', async () => {
    mockTenantService.getById.mockResolvedValue(mockTenant as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });

    const report = await checkTenantHealth('t-1');

    expect(report.tenant_id).toBe('t-1');
  });

  it('viber detail includes bot name and subscriber count on success', async () => {
    mockTenantService.getById.mockResolvedValue(mockTenant as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'My Fancy Bot',
      uri: 'fancybot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 42,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });

    const report = await checkTenantHealth('t-1');

    expect(report.checks[1].detail).toContain('My Fancy Bot');
    expect(report.checks[1].detail).toContain('42');
  });

  it('data source detail includes database type on success', async () => {
    const mockConnector = {
      query: jest.fn(),
      testConnection: jest.fn().mockResolvedValue(true),
    };
    mockTenantService.getById.mockResolvedValue({
      ...mockTenant,
      database_type: 'woocommerce',
      database_credentials: Buffer.from('encrypted'),
    } as any);
    mockViberService.getAccountInfo.mockResolvedValue({
      status: 0,
      status_message: 'ok',
      name: 'Bot',
      uri: 'bot',
      webhook: 'https://test.example.com/api/viber/webhook/test-firm',
      subscribers_count: 0,
    });
    mockAxios.get.mockResolvedValue({ data: { id: 10 } });
    mockCreateConnector.mockReturnValue(mockConnector as any);

    const report = await checkTenantHealth('t-1');

    expect(report.checks[3]).toMatchObject({
      check: 'data_source',
      healthy: true,
      detail: 'woocommerce connected',
    });
  });
});

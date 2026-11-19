import { logger } from '../../config/logger';
import { tenantService } from './tenant.service';
import { viberService } from '../webhook/viber.service';
import { chatwootService } from '../chatwoot/chatwoot.service';
import { createConnector, createConnectorFromConfig } from '../connector/connector.factory';
import { connectorRepository } from '../connector/connector.repository';
import { Tenant } from './tenant.model';
import { env } from '../../config/env';

export interface HealthCheckResult {
  check: string;
  healthy: boolean;
  detail?: string;
}

export interface TenantHealthReport {
  tenant_id: string;
  checks: HealthCheckResult[];
  allHealthy: boolean;
}

async function checkDatabase(tenantId: string): Promise<HealthCheckResult> {
  try {
    const tenant = await tenantService.getById(tenantId);
    if (!tenant) {
      return { check: 'database', healthy: false, detail: 'Tenant not found' };
    }
    if (tenant.status !== 'active') {
      return { check: 'database', healthy: false, detail: `Tenant status: ${tenant.status}` };
    }
    return { check: 'database', healthy: true, detail: 'Tenant exists and is active' };
  } catch (err) {
    return { check: 'database', healthy: false, detail: 'Failed to query tenant' };
  }
}

async function checkViber(tenant: Tenant): Promise<HealthCheckResult> {
  if (!tenant.viber_auth_token) {
    return { check: 'viber', healthy: true, detail: 'N/A — no Viber token configured' };
  }

  try {
    const info = await viberService.getAccountInfo(tenant.viber_auth_token);
    const expectedWebhook = `${env.WEBHOOK_BASE_URL}/api/viber/webhook/${tenant.slug}`;
    const webhookMatch = info.webhook === expectedWebhook;

    if (!webhookMatch) {
      return {
        check: 'viber',
        healthy: false,
        detail: `Webhook mismatch: expected ${expectedWebhook}, got ${info.webhook}`,
      };
    }

    return { check: 'viber', healthy: true, detail: `Bot: ${info.name}, subscribers: ${info.subscribers_count}` };
  } catch (err) {
    return { check: 'viber', healthy: false, detail: 'Failed to reach Viber API' };
  }
}

async function checkChatwoot(tenant: Tenant): Promise<HealthCheckResult> {
  if (!tenant.chatwoot_api_token || !tenant.chatwoot_account_id || !tenant.chatwoot_inbox_id) {
    return { check: 'chatwoot', healthy: false, detail: 'Chatwoot not configured' };
  }

  try {
    // Try to search contacts as a lightweight API check
    const axios = (await import('axios')).default;
    await axios.get(
      `${env.CHATWOOT_BASE_URL}/api/v1/accounts/${tenant.chatwoot_account_id}/inboxes/${tenant.chatwoot_inbox_id}`,
      {
        headers: { 'api_access_token': tenant.chatwoot_api_token },
      }
    );
    return { check: 'chatwoot', healthy: true, detail: 'Inbox accessible' };
  } catch (err) {
    return { check: 'chatwoot', healthy: false, detail: 'Failed to reach Chatwoot API' };
  }
}

async function checkDataSources(tenant: Tenant): Promise<HealthCheckResult[]> {
  // Try multi-connector first
  const connectorConfigs = await connectorRepository.findActiveByTenantId(tenant.id);

  if (connectorConfigs.length > 0) {
    const results: HealthCheckResult[] = [];
    for (const config of connectorConfigs) {
      try {
        const connector = createConnectorFromConfig(config);
        if (!connector) {
          results.push({ check: `data_source:${config.name}`, healthy: false, detail: 'Failed to create connector' });
          continue;
        }
        const ok = await connector.testConnection();
        results.push({
          check: `data_source:${config.name}`,
          healthy: ok,
          detail: ok ? `${config.database_type} connected` : `${config.database_type} connection failed`,
        });
      } catch (err) {
        results.push({ check: `data_source:${config.name}`, healthy: false, detail: 'Connection test error' });
      }
    }
    return results;
  }

  // Legacy fallback
  if (!tenant.database_type || !tenant.database_credentials) {
    return [{ check: 'data_source', healthy: true, detail: 'N/A — no data source configured' }];
  }

  try {
    const connector = createConnector(tenant);
    if (!connector) {
      return [{ check: 'data_source', healthy: false, detail: 'Failed to create connector' }];
    }
    const ok = await connector.testConnection();
    return [{
      check: 'data_source',
      healthy: ok,
      detail: ok ? `${tenant.database_type} connected` : `${tenant.database_type} connection failed`,
    }];
  } catch (err) {
    return [{ check: 'data_source', healthy: false, detail: 'Data source connection error' }];
  }
}

export async function checkTenantHealth(tenantId: string): Promise<TenantHealthReport> {
  const tenant = await tenantService.getById(tenantId);

  const dbCheck = await checkDatabase(tenantId);

  if (!tenant) {
    return {
      tenant_id: tenantId,
      checks: [dbCheck],
      allHealthy: false,
    };
  }

  const [viberCheck, chatwootCheck, dataSourceChecks] = await Promise.all([
    checkViber(tenant),
    checkChatwoot(tenant),
    checkDataSources(tenant),
  ]);

  const checks = [dbCheck, viberCheck, chatwootCheck, ...dataSourceChecks];
  const allHealthy = checks.every((c) => c.healthy);

  logger.info({ tenantId, allHealthy }, 'Tenant health check completed');

  return {
    tenant_id: tenantId,
    checks,
    allHealthy,
  };
}

import { redis } from '../../config/redis';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { tenantRepository } from './tenant.repository';
import { Tenant, CreateTenantInput, UpdateTenantInput, TenantPublic, ChatwootSetupStatus } from './tenant.model';
import { chatwootProvisioningService } from '../chatwoot/chatwoot.provisioning';

const SLUG_TTL = 300;  // 5 min
const ID_TTL = 300;    // 5 min

/** Fields safe to cache in Redis (no secrets/tokens). */
interface TenantCacheEntry {
  id: string;
  slug: string;
  firm_name: string;
  database_type: string | null;
  has_database_credentials: boolean;
  system_prompt: string;
  openai_model: string | null;
  has_openai_api_key: boolean;
  has_viber_token: boolean;
  has_telegram_token: boolean;
  has_chatwoot_api_token: boolean;
  chatwoot_account_id: number | null;
  chatwoot_inbox_id: number | null;
  timezone: string;
  working_hours: any;
  handover_keywords: string[];
  agent_timeout_seconds: number;
  session_timeout_hours: number;
  chatwoot_setup_status: string;
  chatwoot_setup_error: string | null;
  monthly_credit_limit: number | null;
  credits_used: number;
  bonus_credits: number;
  per_conversation_message_limit: number | null;
  auto_escalate_media: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function toCacheEntry(tenant: Tenant): TenantCacheEntry {
  return {
    id: tenant.id,
    slug: tenant.slug,
    firm_name: tenant.firm_name,
    database_type: tenant.database_type,
    has_database_credentials: !!tenant.database_credentials,
    system_prompt: tenant.system_prompt,
    openai_model: tenant.openai_model,
    has_openai_api_key: !!tenant.openai_api_key,
    has_viber_token: !!tenant.viber_auth_token,
    has_telegram_token: !!tenant.telegram_bot_token,
    has_chatwoot_api_token: !!tenant.chatwoot_api_token,
    chatwoot_account_id: tenant.chatwoot_account_id,
    chatwoot_inbox_id: tenant.chatwoot_inbox_id,
    timezone: tenant.timezone,
    working_hours: tenant.working_hours,
    handover_keywords: tenant.handover_keywords,
    agent_timeout_seconds: tenant.agent_timeout_seconds,
    session_timeout_hours: tenant.session_timeout_hours,
    chatwoot_setup_status: tenant.chatwoot_setup_status || 'none',
    chatwoot_setup_error: tenant.chatwoot_setup_error || null,
    monthly_credit_limit: tenant.monthly_credit_limit,
    credits_used: tenant.credits_used,
    bonus_credits: tenant.bonus_credits,
    per_conversation_message_limit: tenant.per_conversation_message_limit,
    auto_escalate_media: tenant.auto_escalate_media,
    status: tenant.status,
    created_at: tenant.created_at,
    updated_at: tenant.updated_at,
  };
}

function toPublic(tenant: Tenant): TenantPublic {
  return {
    id: tenant.id,
    slug: tenant.slug,
    firm_name: tenant.firm_name,
    has_viber_token: !!tenant.viber_auth_token,
    has_telegram_token: !!tenant.telegram_bot_token,
    database_type: tenant.database_type,
    has_database_credentials: !!tenant.database_credentials,
    system_prompt: tenant.system_prompt,
    openai_model: tenant.openai_model,
    has_openai_api_key: !!tenant.openai_api_key,
    chatwoot_account_id: tenant.chatwoot_account_id,
    chatwoot_inbox_id: tenant.chatwoot_inbox_id,
    timezone: tenant.timezone,
    working_hours: tenant.working_hours,
    handover_keywords: tenant.handover_keywords,
    agent_timeout_seconds: tenant.agent_timeout_seconds,
    session_timeout_hours: tenant.session_timeout_hours,
    chatwoot_setup_status: tenant.chatwoot_setup_status || 'none',
    chatwoot_setup_error: tenant.chatwoot_setup_error || null,
    monthly_credit_limit: tenant.monthly_credit_limit,
    credits_used: tenant.credits_used,
    bonus_credits: tenant.bonus_credits,
    credits_reset_at: tenant.credits_reset_at,
    per_conversation_message_limit: tenant.per_conversation_message_limit,
    credit_limit_message: tenant.credit_limit_message,
    auto_escalate_media: tenant.auto_escalate_media,
    status: tenant.status,
    created_at: tenant.created_at,
    updated_at: tenant.updated_at,
  };
}

async function invalidateCache(tenant: Tenant) {
  await Promise.all([
    redis.del(`tenant:slug:${tenant.slug}`),
    redis.del(`tenant:id:${tenant.id}`),
  ]);
  logger.debug({ tenantId: tenant.id, slug: tenant.slug }, 'Tenant cache invalidated');
}

export const tenantService = {
  async getAll(): Promise<TenantPublic[]> {
    const tenants = await tenantRepository.findAll();
    return tenants.map(toPublic);
  },

  async getPublicById(id: string): Promise<TenantPublic | null> {
    const tenant = await this.getById(id);
    return tenant ? toPublic(tenant) : null;
  },

  async getById(id: string): Promise<Tenant | null> {
    // Check cache for quick existence — but always get full tenant from DB
    // (cache only stores public fields, no tokens)
    const cached = await redis.get(`tenant:id:${id}`);
    if (cached) {
      // Cache hit — still need to fetch from DB for sensitive fields
      // But use cache to avoid DB roundtrip when possible
    }

    const tenant = await tenantRepository.findById(id);
    if (tenant) {
      // Cache only non-sensitive fields
      await redis.setex(`tenant:id:${id}`, ID_TTL, JSON.stringify(toCacheEntry(tenant)));
    }
    return tenant;
  },

  async getBySlug(slug: string): Promise<Tenant | null> {
    const tenant = await tenantRepository.findBySlug(slug);
    if (tenant) {
      await redis.setex(`tenant:slug:${slug}`, SLUG_TTL, JSON.stringify(toCacheEntry(tenant)));
    }
    return tenant;
  },

  async create(input: CreateTenantInput): Promise<TenantPublic> {
    const { auto_setup_chatwoot, ...createInput } = input;
    const tenant = await tenantRepository.create(createInput);
    logger.info({ tenantId: tenant.id, slug: tenant.slug }, 'Tenant created');

    // Trigger async Chatwoot provisioning if requested and platform token is available
    const shouldAutoSetup = auto_setup_chatwoot !== false
      && !input.chatwoot_account_id
      && !input.chatwoot_api_token
      && env.CHATWOOT_PLATFORM_TOKEN;

    if (shouldAutoSetup) {
      this.provisionChatwoot(tenant.id, tenant.slug, tenant.firm_name).catch(() => {
        // Error already logged inside provisionChatwoot
      });
      tenant.chatwoot_setup_status = 'pending';
    }

    return toPublic(tenant);
  },

  async update(id: string, input: UpdateTenantInput): Promise<TenantPublic | null> {
    const existing = await tenantRepository.findById(id);
    if (!existing) return null;

    const updated = await tenantRepository.update(id, input);
    if (!updated) return null;

    await invalidateCache(existing);
    if (input.slug && input.slug !== existing.slug) {
      await redis.del(`tenant:slug:${input.slug}`);
    }

    logger.info({ tenantId: id }, 'Tenant updated');
    return toPublic(updated);
  },

  async provisionChatwoot(tenantId: string, slug: string, firmName: string): Promise<void> {
    try {
      await tenantRepository.updateChatwootSetupStatus(tenantId, 'pending');

      const result = await chatwootProvisioningService.provisionFullAccount({
        platformToken: env.CHATWOOT_PLATFORM_TOKEN,
        tenantSlug: slug,
        firmName,
        webhookBaseUrl: env.WEBHOOK_BASE_URL,
      });

      await tenantRepository.update(tenantId, {
        chatwoot_account_id: result.chatwoot_account_id,
        chatwoot_inbox_id: result.chatwoot_inbox_id,
        chatwoot_api_token: result.chatwoot_api_token,
      });
      await tenantRepository.updateChatwootSetupStatus(tenantId, 'completed');

      // Invalidate cache so next read picks up new Chatwoot config
      const tenant = await tenantRepository.findById(tenantId);
      if (tenant) await invalidateCache(tenant);

      logger.info({ tenantId }, 'Chatwoot auto-provisioning completed');
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';
      await tenantRepository.updateChatwootSetupStatus(tenantId, 'failed', errorMsg);
      logger.error({ tenantId, err }, 'Chatwoot auto-provisioning failed');
    }
  },

  async updateChatwootSetupStatus(
    id: string,
    status: ChatwootSetupStatus,
    error: string | null = null
  ): Promise<TenantPublic | null> {
    const tenant = await tenantRepository.updateChatwootSetupStatus(id, status, error);
    return tenant ? toPublic(tenant) : null;
  },

  async deactivate(id: string): Promise<TenantPublic | null> {
    const existing = await tenantRepository.findById(id);
    if (!existing) return null;

    const deactivated = await tenantRepository.deactivate(id);
    if (!deactivated) return null;

    await invalidateCache(existing);
    logger.info({ tenantId: id }, 'Tenant deactivated');
    return toPublic(deactivated);
  },
};

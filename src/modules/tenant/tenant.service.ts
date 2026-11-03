import { redis } from '../../config/redis';
import { logger } from '../../config/logger';
import { tenantRepository } from './tenant.repository';
import { Tenant, CreateTenantInput, UpdateTenantInput, TenantPublic } from './tenant.model';

const SLUG_TTL = 300;  // 5 min
const ID_TTL = 300;    // 5 min

function toPublic(tenant: Tenant): TenantPublic {
  return {
    id: tenant.id,
    slug: tenant.slug,
    firm_name: tenant.firm_name,
    database_type: tenant.database_type,
    system_prompt: tenant.system_prompt,
    chatwoot_account_id: tenant.chatwoot_account_id,
    chatwoot_inbox_id: tenant.chatwoot_inbox_id,
    timezone: tenant.timezone,
    working_hours: tenant.working_hours,
    handover_keywords: tenant.handover_keywords,
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

  async getById(id: string): Promise<Tenant | null> {
    const cached = await redis.get(`tenant:id:${id}`);
    if (cached) return JSON.parse(cached);

    const tenant = await tenantRepository.findById(id);
    if (tenant) {
      await redis.setex(`tenant:id:${id}`, ID_TTL, JSON.stringify(tenant));
    }
    return tenant;
  },

  async getBySlug(slug: string): Promise<Tenant | null> {
    const cached = await redis.get(`tenant:slug:${slug}`);
    if (cached) return JSON.parse(cached);

    const tenant = await tenantRepository.findBySlug(slug);
    if (tenant) {
      await redis.setex(`tenant:slug:${slug}`, SLUG_TTL, JSON.stringify(tenant));
    }
    return tenant;
  },

  async create(input: CreateTenantInput): Promise<TenantPublic> {
    const tenant = await tenantRepository.create(input);
    logger.info({ tenantId: tenant.id, slug: tenant.slug }, 'Tenant created');
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

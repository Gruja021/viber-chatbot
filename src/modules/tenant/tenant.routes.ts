import { Router, Request, Response, NextFunction } from 'express';
import { tenantService } from './tenant.service';
import { checkTenantHealth } from './tenant.health';
import { chatwootProvisioningService } from '../chatwoot/chatwoot.provisioning';
import { aiCreditsService } from '../ai-credits/ai-credits.service';
import { env } from '../../config/env';
import { adminAuth } from '../../middleware/admin-auth';

const router = Router();

router.use(adminAuth);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tenants = await tenantService.getAll();
    res.json(tenants);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await checkTenantHealth(req.params.id as string);
    const status = report.allHealthy ? 200 : 503;
    res.status(status).json(report);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.getPublicById(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

/** Validate tenant input fields. Returns error message or null if valid. */
function validateTenantInput(body: Record<string, unknown>, isCreate: boolean): string | null {
  // Slug validation
  if (isCreate || body.slug !== undefined) {
    const slug = body.slug;
    if (isCreate && !slug) return 'slug is required';
    if (slug && (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug))) {
      return 'slug must be 3-64 chars, lowercase alphanumeric and hyphens, cannot start/end with hyphen';
    }
  }

  if (isCreate && !body.firm_name) return 'firm_name is required';
  if (body.firm_name !== undefined && (typeof body.firm_name !== 'string' || body.firm_name.length > 200)) {
    return 'firm_name must be a string with max 200 characters';
  }

  // Timeout bounds
  if (body.agent_timeout_seconds !== undefined) {
    const val = Number(body.agent_timeout_seconds);
    if (isNaN(val) || val < 0 || val > 86400) {
      return 'agent_timeout_seconds must be between 0 and 86400';
    }
  }
  if (body.session_timeout_hours !== undefined) {
    const val = Number(body.session_timeout_hours);
    if (isNaN(val) || val < 1 || val > 720) {
      return 'session_timeout_hours must be between 1 and 720';
    }
  }

  // System prompt length
  if (body.system_prompt !== undefined) {
    if (typeof body.system_prompt !== 'string' || body.system_prompt.length > 10000) {
      return 'system_prompt must be a string with max 10000 characters';
    }
  }

  // Credit limits
  if (body.monthly_credit_limit !== undefined && body.monthly_credit_limit !== null) {
    const val = Number(body.monthly_credit_limit);
    if (isNaN(val) || val < 0 || val > 10000000) {
      return 'monthly_credit_limit must be between 0 and 10000000, or null for unlimited';
    }
  }
  if (body.per_conversation_message_limit !== undefined && body.per_conversation_message_limit !== null) {
    const val = Number(body.per_conversation_message_limit);
    if (isNaN(val) || val < 1 || val > 10000) {
      return 'per_conversation_message_limit must be between 1 and 10000, or null for unlimited';
    }
  }
  if (body.bonus_credits !== undefined) {
    const val = Number(body.bonus_credits);
    if (isNaN(val) || val < 0 || val > 10000000) {
      return 'bonus_credits must be between 0 and 10000000';
    }
  }
  if (body.credit_limit_message !== undefined && body.credit_limit_message !== null) {
    if (typeof body.credit_limit_message !== 'string' || body.credit_limit_message.length > 1000) {
      return 'credit_limit_message must be a string with max 1000 characters';
    }
  }
  if (body.auto_escalate_media !== undefined) {
    if (typeof body.auto_escalate_media !== 'boolean') {
      return 'auto_escalate_media must be a boolean';
    }
  }

  // Timezone (basic IANA-like validation)
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || !/^[A-Za-z_]+\/[A-Za-z_]+/.test(body.timezone as string)) {
      return 'timezone must be a valid IANA timezone (e.g., Europe/Belgrade)';
    }
  }

  return null;
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = { ...req.body };

    const validationError = validateTenantInput(body, true);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (body.database_credentials && typeof body.database_credentials === 'object') {
      body.database_credentials = JSON.stringify(body.database_credentials);
    }
    const tenant = await tenantService.create(body);
    res.status(201).json(tenant);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Tenant with this slug or viber_auth_token already exists' });
      return;
    }
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = { ...req.body };

    const validationError = validateTenantInput(body, false);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (body.database_credentials && typeof body.database_credentials === 'object') {
      body.database_credentials = JSON.stringify(body.database_credentials);
    }
    const tenant = await tenantService.update(req.params.id as string, body);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.deactivate(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

// --- Credit usage ---

router.get('/:id/credit-usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.getPublicById(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    const usage = await aiCreditsService.getUsageSummary(req.params.id as string);
    res.json(usage);
  } catch (err) {
    next(err);
  }
});

// --- Chatwoot auto-provisioning retry ---

router.post('/:id/setup-chatwoot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.getById(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    if (tenant.chatwoot_account_id && tenant.chatwoot_api_token) {
      res.status(400).json({ error: 'Chatwoot is already configured for this tenant' });
      return;
    }

    if (!env.CHATWOOT_PLATFORM_TOKEN) {
      res.status(400).json({ error: 'CHATWOOT_PLATFORM_TOKEN is not configured' });
      return;
    }

    // Fire-and-forget provisioning
    tenantService.provisionChatwoot(tenant.id, tenant.slug, tenant.firm_name).catch(() => {});

    res.json({ message: 'Chatwoot setup started', status: 'pending' });
  } catch (err) {
    next(err);
  }
});

// --- Agent management routes (proxy to Chatwoot) ---

router.get('/:id/agents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.getById(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    if (!tenant.chatwoot_api_token || !tenant.chatwoot_account_id || !tenant.chatwoot_inbox_id) {
      res.status(400).json({ error: 'Tenant has no Chatwoot configuration' });
      return;
    }

    const agents = await chatwootProvisioningService.listInboxAgents(
      tenant.chatwoot_api_token,
      tenant.chatwoot_account_id,
      tenant.chatwoot_inbox_id
    );
    res.json(agents);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/agents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      res.status(400).json({ error: 'name and email are required' });
      return;
    }

    const tenant = await tenantService.getById(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    if (!tenant.chatwoot_api_token || !tenant.chatwoot_account_id || !tenant.chatwoot_inbox_id) {
      res.status(400).json({ error: 'Tenant has no Chatwoot configuration' });
      return;
    }

    // Create agent in Chatwoot
    const agent = await chatwootProvisioningService.createAgent(
      tenant.chatwoot_api_token,
      tenant.chatwoot_account_id,
      name,
      email
    );

    // Add agent to tenant's inbox
    await chatwootProvisioningService.addAgentsToInbox({
      chatwootApiToken: tenant.chatwoot_api_token,
      chatwootAccountId: tenant.chatwoot_account_id,
      inboxId: tenant.chatwoot_inbox_id,
      agentIds: [agent.id],
    });

    res.status(201).json(agent);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/agents/:agentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.getById(req.params.id as string);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }
    if (!tenant.chatwoot_api_token || !tenant.chatwoot_account_id || !tenant.chatwoot_inbox_id) {
      res.status(400).json({ error: 'Tenant has no Chatwoot configuration' });
      return;
    }

    const agentId = parseInt(req.params.agentId as string, 10);
    if (isNaN(agentId)) {
      res.status(400).json({ error: 'Invalid agent ID' });
      return;
    }

    await chatwootProvisioningService.removeAgentFromInbox(
      tenant.chatwoot_api_token,
      tenant.chatwoot_account_id,
      tenant.chatwoot_inbox_id,
      [agentId]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as tenantRoutes };

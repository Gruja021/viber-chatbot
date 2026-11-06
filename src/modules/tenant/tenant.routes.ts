import { Router, Request, Response, NextFunction } from 'express';
import { tenantService } from './tenant.service';
import { checkTenantHealth } from './tenant.health';
import { chatwootProvisioningService } from '../chatwoot/chatwoot.provisioning';
import { env } from '../../config/env';

const router = Router();

// Admin auth middleware
function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== env.ADMIN_API_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

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

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = { ...req.body };
    const { slug, firm_name } = body;
    if (!slug || !firm_name) {
      res.status(400).json({ error: 'slug and firm_name are required' });
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

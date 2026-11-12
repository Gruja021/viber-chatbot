import { Router, Request, Response, NextFunction } from 'express';
import { connectorService } from './connector.service';
import { connectorRepository } from './connector.repository';
import { tenantService } from '../tenant/tenant.service';
import { env } from '../../config/env';

const router = Router({ mergeParams: true });

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

// Verify tenant exists middleware
async function verifyTenant(req: Request, res: Response, next: NextFunction) {
  const tenant = await tenantService.getPublicById(req.params.id as string);
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }
  next();
}

router.use(verifyTenant);

// GET /api/tenants/:id/connectors
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const connectors = await connectorService.getConnectors(req.params.id as string);
    res.json(connectors);
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants/:id/connectors
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, database_type, database_credentials } = req.body;
    if (!name || !database_type || !database_credentials) {
      res.status(400).json({ error: 'name, database_type, and database_credentials are required' });
      return;
    }

    const body = { ...req.body };
    if (typeof body.database_credentials === 'object') {
      body.database_credentials = JSON.stringify(body.database_credentials);
    }

    const connector = await connectorService.createConnector(req.params.id as string, body);
    res.status(201).json(connector);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'A connector with this name already exists for this tenant' });
      return;
    }
    next(err);
  }
});

// PUT /api/tenants/:id/connectors/:cid
router.put('/:cid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await connectorRepository.findById(req.params.cid as string);
    if (!existing || existing.tenant_id !== req.params.id as string) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }

    const body = { ...req.body };
    if (body.database_credentials && typeof body.database_credentials === 'object') {
      body.database_credentials = JSON.stringify(body.database_credentials);
    }

    const updated = await connectorService.updateConnector(req.params.cid as string, body);
    if (!updated) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'A connector with this name already exists for this tenant' });
      return;
    }
    next(err);
  }
});

// DELETE /api/tenants/:id/connectors/:cid
router.delete('/:cid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await connectorRepository.findById(req.params.cid as string);
    if (!existing || existing.tenant_id !== req.params.id as string) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }

    await connectorService.deleteConnector(req.params.cid as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants/:id/connectors/:cid/test
router.post('/:cid/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await connectorRepository.findById(req.params.cid as string);
    if (!existing || existing.tenant_id !== req.params.id as string) {
      res.status(404).json({ error: 'Connector not found' });
      return;
    }

    const result = await connectorService.testConnector(req.params.cid as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as connectorRoutes };

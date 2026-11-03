import { Router, Request, Response, NextFunction } from 'express';
import { tenantService } from './tenant.service';
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

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await tenantService.getById(req.params.id as string);
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
    const { slug, firm_name, viber_auth_token } = req.body;
    if (!slug || !firm_name || !viber_auth_token) {
      res.status(400).json({ error: 'slug, firm_name, and viber_auth_token are required' });
      return;
    }
    const tenant = await tenantService.create(req.body);
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
    const tenant = await tenantService.update(req.params.id as string, req.body);
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

export { router as tenantRoutes };

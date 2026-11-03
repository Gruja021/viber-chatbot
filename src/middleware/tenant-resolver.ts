import { Request, Response, NextFunction } from 'express';
import { tenantService } from '../modules/tenant/tenant.service';
import { logger } from '../config/logger';

export async function tenantResolver(req: Request, res: Response, next: NextFunction) {
  const tenantSlug = req.params.tenantSlug as string;
  if (!tenantSlug) {
    res.status(400).json({ error: 'Missing tenant slug' });
    return;
  }

  const tenant = await tenantService.getBySlug(tenantSlug);
  if (!tenant) {
    logger.warn({ tenantSlug }, 'Tenant not found or inactive');
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  req.tenant = tenant;
  next();
}

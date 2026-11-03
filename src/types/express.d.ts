import { Tenant } from '../modules/tenant/tenant.model';

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      rawBody?: Buffer;
    }
  }
}

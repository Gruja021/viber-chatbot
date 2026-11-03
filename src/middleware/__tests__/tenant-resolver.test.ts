import { tenantResolver } from '../tenant-resolver';
import { tenantService } from '../../modules/tenant/tenant.service';

jest.mock('../../modules/tenant/tenant.service');

const mockTenantService = tenantService as jest.Mocked<typeof tenantService>;

describe('tenantResolver middleware', () => {
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('returns 400 when tenant slug is missing', async () => {
    req.params = {};
    await tenantResolver(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing tenant slug' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when tenant is not found', async () => {
    req.params.tenantSlug = 'nonexistent';
    mockTenantService.getBySlug.mockResolvedValue(null);

    await tenantResolver(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.tenant and calls next() when tenant is found', async () => {
    const mockTenant = {
      id: 'uuid-1',
      slug: 'my-tenant',
      firm_name: 'Test Firm',
      viber_auth_token: 'token',
      status: 'active' as const,
    };
    req.params.tenantSlug = 'my-tenant';
    mockTenantService.getBySlug.mockResolvedValue(mockTenant as any);

    await tenantResolver(req, res, next);
    expect(req.tenant).toEqual(mockTenant);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

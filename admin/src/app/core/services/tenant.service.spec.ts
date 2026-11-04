import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TenantService } from './tenant.service';
import { makeTenant, makeSystemHealth, makeTenantHealthResponse } from '../../testing/test-helpers';

describe('TenantService', () => {
  let service: TenantService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TenantService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // getSystemHealth
  it('should GET system health', () => {
    const mockHealth = makeSystemHealth();
    service.getSystemHealth().subscribe((result) => {
      expect(result).toEqual(mockHealth);
    });
    const req = httpTesting.expectOne('/health');
    expect(req.request.method).toBe('GET');
    req.flush(mockHealth);
  });

  // getTenants
  it('should GET all tenants', () => {
    const tenants = [makeTenant(), makeTenant({ id: 'tenant-2', slug: 'other' })];
    service.getTenants().subscribe((result) => {
      expect(result.length).toBe(2);
    });
    const req = httpTesting.expectOne('/api/tenants');
    expect(req.request.method).toBe('GET');
    req.flush(tenants);
  });

  // getTenant
  it('should GET a single tenant by id', () => {
    const tenant = makeTenant();
    service.getTenant('tenant-1').subscribe((result) => {
      expect(result.slug).toBe('test-company');
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1');
    expect(req.request.method).toBe('GET');
    req.flush(tenant);
  });

  // createTenant
  it('should POST to create a tenant', () => {
    const input = { slug: 'new-co', firm_name: 'New Co' };
    const created = makeTenant({ id: 'new-id', slug: 'new-co', firm_name: 'New Co' });

    service.createTenant(input).subscribe((result) => {
      expect(result.id).toBe('new-id');
    });
    const req = httpTesting.expectOne('/api/tenants');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush(created);
  });

  // updateTenant
  it('should PUT to update a tenant', () => {
    const updates = { firm_name: 'Updated Name' };
    const updated = makeTenant({ firm_name: 'Updated Name' });

    service.updateTenant('tenant-1', updates).subscribe((result) => {
      expect(result.firm_name).toBe('Updated Name');
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(updates);
    req.flush(updated);
  });

  // deleteTenant
  it('should DELETE a tenant', () => {
    const deactivated = makeTenant({ status: 'inactive' });

    service.deleteTenant('tenant-1').subscribe((result) => {
      expect(result.status).toBe('inactive');
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(deactivated);
  });

  // getTenantHealth
  it('should GET tenant health', () => {
    const health = makeTenantHealthResponse();

    service.getTenantHealth('tenant-1').subscribe((result) => {
      expect(result.allHealthy).toBeTrue();
      expect(result.checks.length).toBe(2);
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1/health');
    expect(req.request.method).toBe('GET');
    req.flush(health);
  });

  // Verify URL construction
  it('should use correct base URL for getSystemHealth', () => {
    service.getSystemHealth().subscribe();
    const req = httpTesting.expectOne('/health');
    expect(req.request.url).toBe('/health');
    req.flush(makeSystemHealth());
  });

  it('should use correct base URL for getTenants', () => {
    service.getTenants().subscribe();
    const req = httpTesting.expectOne('/api/tenants');
    expect(req.request.url).toBe('/api/tenants');
    req.flush([]);
  });

  it('should use correct URL for getTenant', () => {
    service.getTenant('abc-123').subscribe();
    const req = httpTesting.expectOne('/api/tenants/abc-123');
    expect(req.request.url).toBe('/api/tenants/abc-123');
    req.flush(makeTenant());
  });

  it('should use correct URL for createTenant', () => {
    service.createTenant({ slug: 'x', firm_name: 'X' }).subscribe();
    const req = httpTesting.expectOne('/api/tenants');
    expect(req.request.url).toBe('/api/tenants');
    req.flush(makeTenant());
  });

  it('should use correct URL for updateTenant', () => {
    service.updateTenant('id-1', { firm_name: 'Y' }).subscribe();
    const req = httpTesting.expectOne('/api/tenants/id-1');
    expect(req.request.url).toBe('/api/tenants/id-1');
    req.flush(makeTenant());
  });

  it('should use correct URL for deleteTenant', () => {
    service.deleteTenant('id-2').subscribe();
    const req = httpTesting.expectOne('/api/tenants/id-2');
    expect(req.request.url).toBe('/api/tenants/id-2');
    req.flush(makeTenant());
  });

  it('should use correct URL for getTenantHealth', () => {
    service.getTenantHealth('id-3').subscribe();
    const req = httpTesting.expectOne('/api/tenants/id-3/health');
    expect(req.request.url).toBe('/api/tenants/id-3/health');
    req.flush(makeTenantHealthResponse());
  });
});

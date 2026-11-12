import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConnectorService } from './connector.service';

function makeConnector(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    tenant_id: 'tenant-1',
    name: 'products',
    description: 'Product catalog',
    database_type: 'google_sheets',
    has_credentials: true,
    is_active: true,
    priority: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ConnectorService', () => {
  let service: ConnectorService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConnectorService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should GET connectors for a tenant', () => {
    const connectors = [makeConnector(), makeConnector({ id: 'c-2', name: 'prices' })];
    service.getConnectors('tenant-1').subscribe((result) => {
      expect(result.length).toBe(2);
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors');
    expect(req.request.method).toBe('GET');
    req.flush(connectors);
  });

  it('should POST to create a connector', () => {
    const connector = makeConnector();
    service.createConnector('tenant-1', {
      name: 'products',
      database_type: 'google_sheets',
      database_credentials: '{"spreadsheet_id":"abc"}',
    }).subscribe((result) => {
      expect(result.name).toBe('products');
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('products');
    req.flush(connector);
  });

  it('should PUT to update a connector', () => {
    const updated = makeConnector({ name: 'updated' });
    service.updateConnector('tenant-1', 'c-1', { name: 'updated' }).subscribe((result) => {
      expect(result.name).toBe('updated');
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors/c-1');
    expect(req.request.method).toBe('PUT');
    req.flush(updated);
  });

  it('should DELETE a connector', () => {
    service.deleteConnector('tenant-1', 'c-1').subscribe();
    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors/c-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('should POST to test a connector', () => {
    service.testConnector('tenant-1', 'c-1').subscribe((result) => {
      expect(result.success).toBeTrue();
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors/c-1/test');
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, detail: 'google_sheets connected' });
  });

  it('should use correct URL for different tenant IDs', () => {
    service.getConnectors('abc-123').subscribe();
    const req = httpTesting.expectOne('/api/tenants/abc-123/connectors');
    expect(req.request.url).toBe('/api/tenants/abc-123/connectors');
    req.flush([]);
  });

  it('should propagate error on getConnectors failure', () => {
    let errorCaught = false;
    service.getConnectors('tenant-1').subscribe({
      error: () => { errorCaught = true; },
    });
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush(
      { error: 'Not found' },
      { status: 404, statusText: 'Not Found' }
    );
    expect(errorCaught).toBeTrue();
  });

  it('should propagate error on createConnector failure', () => {
    let errorCaught = false;
    service.createConnector('tenant-1', {
      name: 'dup', database_type: 'google_sheets', database_credentials: '{}',
    }).subscribe({
      error: () => { errorCaught = true; },
    });
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush(
      { error: 'Duplicate' },
      { status: 409, statusText: 'Conflict' }
    );
    expect(errorCaught).toBeTrue();
  });

  it('should return empty array when no connectors', () => {
    service.getConnectors('tenant-1').subscribe((result) => {
      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TenantConnectorsComponent } from './tenant-connectors.component';
import { TenantConnector } from '../../core/models/tenant.model';

function makeConnector(overrides: Partial<TenantConnector> = {}): TenantConnector {
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

describe('TenantConnectorsComponent', () => {
  let component: TenantConnectorsComponent;
  let fixture: ComponentFixture<TenantConnectorsComponent>;
  let httpTesting: HttpTestingController;
  let snackBar: MatSnackBar;

  function setup(routeId: string | null = 'tenant-1') {
    TestBed.configureTestingModule({
      imports: [TenantConnectorsComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => routeId } },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TenantConnectorsComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
    snackBar = fixture.debugElement.injector.get(MatSnackBar);
    spyOn(snackBar, 'open');
  }

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);
    expect(component).toBeTruthy();
  });

  it('should load connectors on init', () => {
    setup();
    fixture.detectChanges();

    const connectors = [makeConnector(), makeConnector({ id: 'c-2', name: 'prices' })];
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush(connectors);

    expect(component.connectors()).toEqual(connectors);
    expect(component.loading()).toBeFalse();
  });

  it('should set loading false on load error', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush('', { status: 500, statusText: 'Error' });

    expect(component.loading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Failed to load data sources', 'OK', jasmine.any(Object));
  });

  it('should not make request when route id is empty', () => {
    setup(null);
    fixture.detectChanges();
    httpTesting.expectNone('/api/tenants/null/connectors');
  });

  it('should add connector', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);

    component.form.patchValue({
      name: 'products',
      database_type: 'google_sheets',
      database_credentials: '{"spreadsheet_id":"abc"}',
    });
    component.addConnector();

    expect(component.adding()).toBeTrue();

    const newConnector = makeConnector();
    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('products');
    req.flush(newConnector);

    expect(component.adding()).toBeFalse();
    expect(component.connectors()).toContain(jasmine.objectContaining({ id: 'c-1' }));
    expect(snackBar.open).toHaveBeenCalledWith('Data source added successfully', 'OK', jasmine.any(Object));
  });

  it('should not add connector when form is invalid', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);

    component.form.patchValue({ name: '', database_credentials: '' });
    component.addConnector();
    // No POST request should be made
  });

  it('should show error on add failure', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);

    component.form.patchValue({
      name: 'test',
      database_type: 'google_sheets',
      database_credentials: '{}',
    });
    component.addConnector();

    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush('', { status: 500, statusText: 'Error' });

    expect(component.adding()).toBeFalse();
  });

  it('should delete connector on confirm', () => {
    setup();
    spyOn(window, 'confirm').and.returnValue(true);
    fixture.detectChanges();

    const connectors = [makeConnector({ id: 'c-5', name: 'old' })];
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush(connectors);

    component.deleteConnector(connectors[0]);

    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors/c-5');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(component.connectors().length).toBe(0);
    expect(snackBar.open).toHaveBeenCalledWith('Data source deleted', 'OK', jasmine.any(Object));
  });

  it('should not delete connector when user cancels', () => {
    setup();
    spyOn(window, 'confirm').and.returnValue(false);
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([makeConnector()]);

    component.deleteConnector(makeConnector());
    // No DELETE request
  });

  it('should test connector', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([makeConnector()]);

    component.testConnector(makeConnector());

    expect(component.testing()).toBeTrue();
    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors/c-1/test');
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, detail: 'google_sheets connected' });

    expect(component.testing()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('OK: google_sheets connected', 'OK', jasmine.any(Object));
  });

  it('should toggle connector active state', () => {
    setup();
    fixture.detectChanges();

    const connector = makeConnector({ is_active: true });
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([connector]);

    component.toggleActive(connector);

    const req = httpTesting.expectOne('/api/tenants/tenant-1/connectors/c-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ is_active: false });
    req.flush({ ...connector, is_active: false });

    expect(component.connectors()[0].is_active).toBeFalse();
  });

  it('should have correct displayed columns', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);
    expect(component.displayedColumns).toEqual(['name', 'database_type', 'description', 'is_active', 'priority', 'actions']);
  });

  it('should require name in form', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);
    component.form.get('name')?.setValue('');
    expect(component.form.get('name')?.hasError('required')).toBeTrue();
  });

  it('should validate name pattern', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);
    component.form.get('name')?.setValue('Invalid Name');
    expect(component.form.get('name')?.hasError('pattern')).toBeTrue();
  });

  it('should require database_credentials in form', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/connectors').flush([]);
    component.form.get('database_credentials')?.setValue('');
    expect(component.form.get('database_credentials')?.hasError('required')).toBeTrue();
  });
});

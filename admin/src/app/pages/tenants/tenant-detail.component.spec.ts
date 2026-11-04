import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TenantDetailComponent } from './tenant-detail.component';
import { makeTenant, makeTenantHealthResponse } from '../../testing/test-helpers';

describe('TenantDetailComponent', () => {
  let component: TenantDetailComponent;
  let fixture: ComponentFixture<TenantDetailComponent>;
  let httpTesting: HttpTestingController;
  let router: Router;
  let snackBar: MatSnackBar;

  function setup(routeId: string | null = 'tenant-1') {
    TestBed.configureTestingModule({
      imports: [TenantDetailComponent],
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

    fixture = TestBed.createComponent(TenantDetailComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    // Get snackBar from the component's own injector
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
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());
    expect(component).toBeTruthy();
  });

  it('should load tenant from route param', () => {
    setup('tenant-1');
    fixture.detectChanges();
    const tenant = makeTenant();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(tenant);

    expect(component.tenant()).toEqual(tenant);
    expect(component.loading()).toBeFalse();
  });

  it('should navigate to /tenants on load error', () => {
    setup('bad-id');
    fixture.detectChanges();

    httpTesting.expectOne('/api/tenants/bad-id').flush('', { status: 404, statusText: 'Not Found' });

    expect(snackBar.open).toHaveBeenCalledWith('Tenant not found', 'OK', jasmine.any(Object));
    expect(router.navigate).toHaveBeenCalledWith(['/tenants']);
  });

  it('should not make request when route id is null', () => {
    setup(null);
    fixture.detectChanges();
    httpTesting.expectNone('/api/tenants/null');
  });

  it('should detect working hours', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({
      working_hours: { monday: { start: '09:00', end: '17:00' } },
    }));

    expect(component.hasWorkingHours()).toBeTrue();
  });

  it('should return false for empty working hours', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ working_hours: {} }));

    expect(component.hasWorkingHours()).toBeFalse();
  });

  it('should return false for hasWorkingHours when no tenant', () => {
    setup(null);
    fixture.detectChanges();
    expect(component.hasWorkingHours()).toBeFalse();
  });

  it('should run health check', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.runHealthCheck();
    expect(component.healthLoading()).toBeTrue();

    const healthRes = makeTenantHealthResponse();
    httpTesting.expectOne('/api/tenants/tenant-1/health').flush(healthRes);

    expect(component.healthResult()).toEqual(healthRes);
    expect(component.healthLoading()).toBeFalse();
  });

  it('should set healthLoading false on health check error', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.runHealthCheck();
    httpTesting.expectOne('/api/tenants/tenant-1/health').flush('', { status: 500, statusText: 'Error' });

    expect(component.healthLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Health check failed', 'OK', jasmine.any(Object));
  });

  it('should not run health check without tenant', () => {
    setup(null);
    fixture.detectChanges();
    component.runHealthCheck();
    httpTesting.expectNone('/api/tenants/null/health');
  });

  it('should clear health result before running check', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.healthResult.set(makeTenantHealthResponse());
    component.runHealthCheck();
    expect(component.healthResult()).toBeNull();

    httpTesting.expectOne('/api/tenants/tenant-1/health').flush(makeTenantHealthResponse());
  });

  it('should deactivate tenant on confirm', () => {
    setup();
    spyOn(window, 'confirm').and.returnValue(true);
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.deactivate();
    const updated = makeTenant({ status: 'inactive' });
    httpTesting.expectOne('/api/tenants/tenant-1').flush(updated);

    expect(component.tenant()!.status).toBe('inactive');
    expect(snackBar.open).toHaveBeenCalledWith('Tenant deactivated', 'OK', jasmine.any(Object));
  });

  it('should not deactivate when user cancels', () => {
    setup();
    spyOn(window, 'confirm').and.returnValue(false);
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.deactivate();
    // No additional request after the initial load
  });

  it('should show error on deactivate failure', () => {
    setup();
    spyOn(window, 'confirm').and.returnValue(true);
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.deactivate();
    httpTesting.expectOne('/api/tenants/tenant-1').flush('', { status: 500, statusText: 'Error' });

    expect(snackBar.open).toHaveBeenCalledWith('Failed to deactivate tenant', 'OK', jasmine.any(Object));
  });

  it('should not deactivate without tenant loaded', () => {
    setup(null);
    fixture.detectChanges();
    component.deactivate();
  });

  it('should display agent_timeout_seconds in CRM card', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ agent_timeout_seconds: 300 }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('300s');
  });

  it('should show Manage Agents button when Chatwoot is configured', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ chatwoot_account_id: 1 }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Manage Agents');
  });

  it('should not show Manage Agents button when no Chatwoot config', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ chatwoot_account_id: null }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('Manage Agents');
  });

  it('should display agent_timeout_seconds from tenant', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());
    expect(component.tenant()!.agent_timeout_seconds).toBe(180);
  });
});

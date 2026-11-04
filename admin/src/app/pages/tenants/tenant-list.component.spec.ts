import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TenantListComponent } from './tenant-list.component';
import { makeTenant } from '../../testing/test-helpers';
import { Tenant } from '../../core/models/tenant.model';

describe('TenantListComponent', () => {
  let component: TenantListComponent;
  let fixture: ComponentFixture<TenantListComponent>;
  let httpTesting: HttpTestingController;
  let snackBar: MatSnackBar;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [TenantListComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TenantListComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
    // Get snackBar from the component's own injector
    snackBar = fixture.debugElement.injector.get(MatSnackBar);
    spyOn(snackBar, 'open');
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  function flushTenants(tenants: Tenant[] = [makeTenant()]): void {
    httpTesting.expectOne('/api/tenants').flush(tenants);
  }

  it('should create', () => {
    fixture.detectChanges();
    flushTenants();
    expect(component).toBeTruthy();
  });

  it('should load tenants on init', () => {
    fixture.detectChanges();
    const tenants = [makeTenant(), makeTenant({ id: 't2', slug: 'other' })];
    flushTenants(tenants);

    expect(component.tenants().length).toBe(2);
    expect(component.loading()).toBeFalse();
  });

  it('should set loading to true initially', () => {
    expect(component.loading()).toBeTrue();
    fixture.detectChanges();
    flushTenants();
  });

  it('should set tenants to empty on error', () => {
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants').flush('', { status: 500, statusText: 'Error' });
    expect(component.tenants()).toEqual([]);
  });

  it('should filter by all status (show all)', () => {
    fixture.detectChanges();
    flushTenants([
      makeTenant({ id: '1', status: 'active' }),
      makeTenant({ id: '2', status: 'inactive' }),
    ]);

    component.statusFilter = 'all';
    expect(component.filteredTenants().length).toBe(2);
  });

  it('should filter by active status', () => {
    fixture.detectChanges();
    flushTenants([
      makeTenant({ id: '1', status: 'active' }),
      makeTenant({ id: '2', status: 'inactive' }),
      makeTenant({ id: '3', status: 'active' }),
    ]);

    component.statusFilter = 'active';
    expect(component.filteredTenants().length).toBe(2);
    expect(component.filteredTenants().every(t => t.status === 'active')).toBeTrue();
  });

  it('should filter by inactive status', () => {
    fixture.detectChanges();
    flushTenants([
      makeTenant({ id: '1', status: 'active' }),
      makeTenant({ id: '2', status: 'inactive' }),
    ]);

    component.statusFilter = 'inactive';
    expect(component.filteredTenants().length).toBe(1);
    expect(component.filteredTenants()[0].status).toBe('inactive');
  });

  it('should filter by suspended status', () => {
    fixture.detectChanges();
    flushTenants([
      makeTenant({ id: '1', status: 'active' }),
      makeTenant({ id: '2', status: 'suspended' }),
    ]);

    component.statusFilter = 'suspended';
    expect(component.filteredTenants().length).toBe(1);
  });

  it('should return green for active status', () => {
    expect(component.getStatusColor('active')).toBe('#4caf50');
  });

  it('should return grey for inactive status', () => {
    expect(component.getStatusColor('inactive')).toBe('#9e9e9e');
  });

  it('should return orange for suspended status', () => {
    expect(component.getStatusColor('suspended')).toBe('#ff9800');
  });

  it('should deactivate tenant on confirm', () => {
    fixture.detectChanges();
    const tenant = makeTenant();
    flushTenants([tenant]);

    spyOn(window, 'confirm').and.returnValue(true);

    component.deactivate(tenant);

    const deleteReq = httpTesting.expectOne('/api/tenants/tenant-1');
    expect(deleteReq.request.method).toBe('DELETE');
    deleteReq.flush(makeTenant({ status: 'inactive' }));

    expect(snackBar.open).toHaveBeenCalledWith(
      `${tenant.firm_name} deactivated`, 'OK', jasmine.objectContaining({ duration: 3000 })
    );

    // Reload tenants request
    httpTesting.expectOne('/api/tenants').flush([]);
  });

  it('should not deactivate when user cancels confirm', () => {
    fixture.detectChanges();
    flushTenants();

    spyOn(window, 'confirm').and.returnValue(false);
    component.deactivate(makeTenant());

    httpTesting.expectNone('/api/tenants/tenant-1');
  });

  it('should show error snackbar on deactivate failure', () => {
    fixture.detectChanges();
    flushTenants();

    spyOn(window, 'confirm').and.returnValue(true);

    component.deactivate(makeTenant());
    httpTesting.expectOne('/api/tenants/tenant-1').flush('', { status: 500, statusText: 'Error' });

    expect(snackBar.open).toHaveBeenCalledWith(
      'Failed to deactivate tenant', 'OK', jasmine.objectContaining({ duration: 3000 })
    );
  });
});

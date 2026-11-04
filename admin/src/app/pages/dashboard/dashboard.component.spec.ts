import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { makeTenant, makeSystemHealth } from '../../testing/test-helpers';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  function flushInitialRequests(): void {
    httpTesting.expectOne('/health').flush(makeSystemHealth());
    httpTesting.expectOne('/api/tenants').flush([makeTenant()]);
  }

  it('should create', () => {
    fixture.detectChanges();
    flushInitialRequests();
    expect(component).toBeTruthy();
  });

  it('should call loadHealth on init', () => {
    spyOn(component, 'loadHealth').and.callThrough();
    fixture.detectChanges();
    expect(component.loadHealth).toHaveBeenCalled();
    flushInitialRequests();
  });

  it('should set healthLoading to true initially', () => {
    expect(component.healthLoading()).toBeTrue();
    fixture.detectChanges();
    flushInitialRequests();
  });

  it('should set health signal on success', () => {
    fixture.detectChanges();
    const healthData = makeSystemHealth();
    httpTesting.expectOne('/health').flush(healthData);
    httpTesting.expectOne('/api/tenants').flush([]);

    expect(component.health()).toEqual(healthData);
    expect(component.healthLoading()).toBeFalse();
  });

  it('should set health to null on error', () => {
    fixture.detectChanges();
    httpTesting.expectOne('/health').flush('', { status: 500, statusText: 'Error' });
    httpTesting.expectOne('/api/tenants').flush([]);

    expect(component.health()).toBeNull();
    expect(component.healthLoading()).toBeFalse();
  });

  it('should load tenants on init', () => {
    fixture.detectChanges();
    const tenants = [makeTenant(), makeTenant({ id: 't2', status: 'inactive' })];
    httpTesting.expectOne('/health').flush(makeSystemHealth());
    httpTesting.expectOne('/api/tenants').flush(tenants);

    expect(component.tenants().length).toBe(2);
    expect(component.tenantsLoading()).toBeFalse();
  });

  it('should set tenants to empty array on error', () => {
    fixture.detectChanges();
    httpTesting.expectOne('/health').flush(makeSystemHealth());
    httpTesting.expectOne('/api/tenants').flush('', { status: 500, statusText: 'Error' });

    expect(component.tenants()).toEqual([]);
    expect(component.tenantsLoading()).toBeFalse();
  });

  it('should count active tenants', () => {
    fixture.detectChanges();
    const tenants = [
      makeTenant({ id: '1', status: 'active' }),
      makeTenant({ id: '2', status: 'active' }),
      makeTenant({ id: '3', status: 'inactive' }),
    ];
    httpTesting.expectOne('/health').flush(makeSystemHealth());
    httpTesting.expectOne('/api/tenants').flush(tenants);

    expect(component.activeTenants()).toBe(2);
  });

  it('should return 0 active tenants when all are inactive', () => {
    fixture.detectChanges();
    httpTesting.expectOne('/health').flush(makeSystemHealth());
    httpTesting.expectOne('/api/tenants').flush([
      makeTenant({ id: '1', status: 'inactive' }),
    ]);

    expect(component.activeTenants()).toBe(0);
  });

  it('should return recent tenants sorted by date descending', () => {
    fixture.detectChanges();
    const tenants = [
      makeTenant({ id: '1', firm_name: 'Oldest', created_at: '2024-01-01T00:00:00Z' }),
      makeTenant({ id: '2', firm_name: 'Newest', created_at: '2024-06-01T00:00:00Z' }),
      makeTenant({ id: '3', firm_name: 'Middle', created_at: '2024-03-01T00:00:00Z' }),
    ];
    httpTesting.expectOne('/health').flush(makeSystemHealth());
    httpTesting.expectOne('/api/tenants').flush(tenants);

    const recent = component.recentTenants();
    expect(recent[0].firm_name).toBe('Newest');
    expect(recent[1].firm_name).toBe('Middle');
    expect(recent[2].firm_name).toBe('Oldest');
  });

  it('should limit recent tenants to 5', () => {
    fixture.detectChanges();
    const tenants = Array.from({ length: 8 }, (_, i) =>
      makeTenant({ id: `t${i}`, created_at: `2024-0${i + 1}-01T00:00:00Z` })
    );
    httpTesting.expectOne('/health').flush(makeSystemHealth());
    httpTesting.expectOne('/api/tenants').flush(tenants);

    expect(component.recentTenants().length).toBe(5);
  });

  it('should refresh health on loadHealth call', () => {
    fixture.detectChanges();
    flushInitialRequests();

    component.loadHealth();
    expect(component.healthLoading()).toBeTrue();
    httpTesting.expectOne('/health').flush(makeSystemHealth({ status: 'degraded' }));
    expect(component.health()!.status).toBe('degraded');
  });

  it('should set tenantsLoading to true initially', () => {
    expect(component.tenantsLoading()).toBeTrue();
    fixture.detectChanges();
    flushInitialRequests();
  });
});

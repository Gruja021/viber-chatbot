import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TenantAgentsComponent } from './tenant-agents.component';
import { makeChatwootAgent } from '../../testing/test-helpers';

describe('TenantAgentsComponent', () => {
  let component: TenantAgentsComponent;
  let fixture: ComponentFixture<TenantAgentsComponent>;
  let httpTesting: HttpTestingController;
  let snackBar: MatSnackBar;

  function setup(routeId: string | null = 'tenant-1') {
    TestBed.configureTestingModule({
      imports: [TenantAgentsComponent],
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

    fixture = TestBed.createComponent(TenantAgentsComponent);
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
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([]);
    expect(component).toBeTruthy();
  });

  it('should load agents on init', () => {
    setup();
    fixture.detectChanges();

    const agents = [makeChatwootAgent(), makeChatwootAgent({ id: 2, name: 'Agent 2' })];
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush(agents);

    expect(component.agents()).toEqual(agents);
    expect(component.loading()).toBeFalse();
  });

  it('should set loading false on load error', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush('', { status: 500, statusText: 'Error' });

    expect(component.loading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Failed to load agents', 'OK', jasmine.any(Object));
  });

  it('should not make request when route id is empty', () => {
    setup(null);
    fixture.detectChanges();
    httpTesting.expectNone('/api/tenants/null/agents');
  });

  it('should add agent', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([]);

    component.form.patchValue({ name: 'New Agent', email: 'new@test.com' });
    component.addAgent();

    expect(component.adding()).toBeTrue();

    const newAgent = makeChatwootAgent({ id: 10, name: 'New Agent', email: 'new@test.com' });
    const req = httpTesting.expectOne('/api/tenants/tenant-1/agents');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'New Agent', email: 'new@test.com' });
    req.flush(newAgent);

    expect(component.adding()).toBeFalse();
    expect(component.agents()).toContain(jasmine.objectContaining({ id: 10 }));
    expect(snackBar.open).toHaveBeenCalledWith('Agent added successfully', 'OK', jasmine.any(Object));
  });

  it('should not add agent when form is invalid', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([]);

    component.form.patchValue({ name: '', email: '' });
    component.addAgent();
    // No POST request should be made
  });

  it('should show error on add failure', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([]);

    component.form.patchValue({ name: 'Agent', email: 'a@b.com' });
    component.addAgent();

    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush('', { status: 500, statusText: 'Error' });

    expect(component.adding()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Failed to add agent', 'OK', jasmine.any(Object));
  });

  it('should remove agent on confirm', () => {
    setup();
    spyOn(window, 'confirm').and.returnValue(true);
    fixture.detectChanges();

    const agents = [makeChatwootAgent({ id: 5, name: 'Agent 5' })];
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush(agents);

    component.removeAgent(agents[0]);

    const req = httpTesting.expectOne('/api/tenants/tenant-1/agents/5');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(component.agents().length).toBe(0);
    expect(snackBar.open).toHaveBeenCalledWith('Agent removed', 'OK', jasmine.any(Object));
  });

  it('should not remove agent when user cancels', () => {
    setup();
    spyOn(window, 'confirm').and.returnValue(false);
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([makeChatwootAgent()]);

    component.removeAgent(makeChatwootAgent());
    // No DELETE request
  });

  it('should show error on remove failure', () => {
    setup();
    spyOn(window, 'confirm').and.returnValue(true);
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([makeChatwootAgent()]);

    component.removeAgent(makeChatwootAgent());
    httpTesting.expectOne('/api/tenants/tenant-1/agents/1').flush('', { status: 500, statusText: 'Error' });

    expect(component.removing()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Failed to remove agent', 'OK', jasmine.any(Object));
  });

  it('should have correct displayed columns', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([]);
    expect(component.displayedColumns).toEqual(['name', 'email', 'role', 'actions']);
  });

  it('should require name in form', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([]);
    component.form.get('name')?.setValue('');
    expect(component.form.get('name')?.hasError('required')).toBeTrue();
  });

  it('should require valid email in form', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([]);
    component.form.get('email')?.setValue('invalid');
    expect(component.form.get('email')?.hasError('email')).toBeTrue();
  });
});

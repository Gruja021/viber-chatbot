import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TenantFormComponent } from './tenant-form.component';
import { makeTenant } from '../../testing/test-helpers';

describe('TenantFormComponent', () => {
  let component: TenantFormComponent;
  let fixture: ComponentFixture<TenantFormComponent>;
  let httpTesting: HttpTestingController;
  let router: Router;
  let snackBar: MatSnackBar;

  function setup(routeId: string | null = null) {
    TestBed.configureTestingModule({
      imports: [TenantFormComponent],
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

    fixture = TestBed.createComponent(TenantFormComponent);
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

  // ---- Create mode ----
  describe('Create mode', () => {
    beforeEach(() => {
      setup(null);
      fixture.detectChanges();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should be in create mode (isEdit false)', () => {
      expect(component.isEdit()).toBeFalse();
    });

    it('should have empty form initially', () => {
      expect(component.form.get('slug')?.value).toBe('');
      expect(component.form.get('firm_name')?.value).toBe('');
    });

    it('should require slug', () => {
      component.form.get('slug')?.setValue('');
      expect(component.form.get('slug')?.hasError('required')).toBeTrue();
    });

    it('should validate slug pattern (lowercase, numbers, hyphens)', () => {
      component.form.get('slug')?.setValue('INVALID SLUG!');
      expect(component.form.get('slug')?.hasError('pattern')).toBeTrue();

      component.form.get('slug')?.setValue('valid-slug-123');
      expect(component.form.get('slug')?.hasError('pattern')).toBeFalse();
    });

    it('should require firm_name', () => {
      component.form.get('firm_name')?.setValue('');
      expect(component.form.get('firm_name')?.hasError('required')).toBeTrue();
    });

    it('should have default timezone Europe/Belgrade', () => {
      expect(component.form.get('timezone')?.value).toBe('Europe/Belgrade');
    });

    it('should have empty handoverKeywords', () => {
      expect(component.handoverKeywords).toEqual([]);
    });

    it('should submit create tenant', () => {
      component.form.patchValue({ slug: 'new-co', firm_name: 'New Co' });
      component.onSubmit();

      expect(component.saving()).toBeTrue();

      const req = httpTesting.expectOne('/api/tenants');
      expect(req.request.method).toBe('POST');
      const created = makeTenant({ id: 'new-id', slug: 'new-co' });
      req.flush(created);

      expect(component.saving()).toBeFalse();
      expect(router.navigate).toHaveBeenCalledWith(['/tenants', 'new-id']);
      expect(snackBar.open).toHaveBeenCalledWith('Tenant created successfully', 'OK', jasmine.any(Object));
    });

    it('should show error on create failure', () => {
      component.form.patchValue({ slug: 'fail', firm_name: 'Fail Co' });
      component.onSubmit();

      httpTesting.expectOne('/api/tenants').flush(
        { error: 'Slug already exists' },
        { status: 409, statusText: 'Conflict' }
      );

      expect(component.saving()).toBeFalse();
      expect(snackBar.open).toHaveBeenCalledWith('Slug already exists', 'OK', jasmine.any(Object));
    });

    it('should not submit when form is invalid', () => {
      component.form.patchValue({ slug: '', firm_name: '' });
      component.onSubmit();
      httpTesting.expectNone('/api/tenants');
    });
  });

  // ---- Edit mode ----
  describe('Edit mode', () => {
    beforeEach(() => {
      setup('tenant-1');
    });

    it('should be in edit mode', () => {
      fixture.detectChanges();
      httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());
      expect(component.isEdit()).toBeTrue();
    });

    it('should load tenant data into form', () => {
      fixture.detectChanges();
      const tenant = makeTenant({ slug: 'loaded-co', firm_name: 'Loaded Co' });
      httpTesting.expectOne('/api/tenants/tenant-1').flush(tenant);

      expect(component.form.get('slug')?.value).toBe('loaded-co');
      expect(component.form.get('firm_name')?.value).toBe('Loaded Co');
    });

    it('should populate handoverKeywords from tenant', () => {
      fixture.detectChanges();
      httpTesting.expectOne('/api/tenants/tenant-1').flush(
        makeTenant({ handover_keywords: ['help', 'support'] })
      );
      expect(component.handoverKeywords).toEqual(['help', 'support']);
    });

    it('should set formLoading during load', () => {
      fixture.detectChanges();
      expect(component.formLoading()).toBeTrue();
      httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());
      expect(component.formLoading()).toBeFalse();
    });

    it('should navigate to /tenants on load error', () => {
      fixture.detectChanges();
      httpTesting.expectOne('/api/tenants/tenant-1').flush('', { status: 404, statusText: 'Not Found' });

      expect(snackBar.open).toHaveBeenCalledWith('Failed to load tenant', 'OK', jasmine.any(Object));
      expect(router.navigate).toHaveBeenCalledWith(['/tenants']);
    });

    it('should submit update tenant', () => {
      fixture.detectChanges();
      httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

      component.form.patchValue({ firm_name: 'Updated Name' });
      component.onSubmit();

      const req = httpTesting.expectOne('/api/tenants/tenant-1');
      expect(req.request.method).toBe('PUT');
      req.flush(makeTenant({ firm_name: 'Updated Name' }));

      expect(router.navigate).toHaveBeenCalledWith(['/tenants', 'tenant-1']);
      expect(snackBar.open).toHaveBeenCalledWith('Tenant updated successfully', 'OK', jasmine.any(Object));
    });

    it('should show error on update failure', () => {
      fixture.detectChanges();
      httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

      component.onSubmit();
      httpTesting.expectOne('/api/tenants/tenant-1').flush(
        { error: 'Update failed' },
        { status: 500, statusText: 'Error' }
      );

      expect(snackBar.open).toHaveBeenCalledWith('Update failed', 'OK', jasmine.any(Object));
    });
  });

  // ---- Working hours ----
  describe('Working hours', () => {
    beforeEach(() => {
      setup(null);
      fixture.detectChanges();
    });

    it('should detect disabled day', () => {
      expect(component.isDayEnabled('monday')).toBeFalse();
    });

    it('should enable day with default hours', () => {
      component.toggleDay('monday', true);
      expect(component.isDayEnabled('monday')).toBeTrue();
      const group = component.form.get(['working_hours', 'monday']);
      expect(group?.value).toEqual({ start: '09:00', end: '17:00' });
    });

    it('should disable day by clearing hours', () => {
      component.toggleDay('tuesday', true);
      expect(component.isDayEnabled('tuesday')).toBeTrue();

      component.toggleDay('tuesday', false);
      expect(component.isDayEnabled('tuesday')).toBeFalse();
    });
  });

  // ---- Handover keywords ----
  describe('Handover keywords', () => {
    beforeEach(() => {
      setup(null);
      fixture.detectChanges();
    });

    it('should add keyword', () => {
      const mockEvent = {
        value: 'help',
        chipInput: { clear: jasmine.createSpy('clear') },
      } as any;
      component.addKeyword(mockEvent);
      expect(component.handoverKeywords).toContain('help');
      expect(mockEvent.chipInput.clear).toHaveBeenCalled();
    });

    it('should not add duplicate keyword', () => {
      component.handoverKeywords = ['help'];
      const mockEvent = {
        value: 'help',
        chipInput: { clear: jasmine.createSpy('clear') },
      } as any;
      component.addKeyword(mockEvent);
      expect(component.handoverKeywords.length).toBe(1);
    });

    it('should not add empty keyword', () => {
      const mockEvent = {
        value: '  ',
        chipInput: { clear: jasmine.createSpy('clear') },
      } as any;
      component.addKeyword(mockEvent);
      expect(component.handoverKeywords.length).toBe(0);
    });

    it('should remove keyword', () => {
      component.handoverKeywords = ['help', 'agent', 'support'];
      component.removeKeyword('agent');
      expect(component.handoverKeywords).toEqual(['help', 'support']);
    });
  });
});

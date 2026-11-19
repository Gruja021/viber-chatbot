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

  it('should display session_timeout_hours in DOM', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ session_timeout_hours: 48 }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('48h');
    expect(compiled.textContent).toContain('Session Timeout');
  });

  it('should display AI-First label when agent_timeout_seconds is 0', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ agent_timeout_seconds: 0, chatwoot_account_id: 1 })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('AI-First');
  });

  it('should display tenant openai_model in AI Configuration', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ openai_model: 'gpt-4o' }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('gpt-4o');
    expect(compiled.textContent).toContain('Model');
  });

  it('should display default model text when openai_model is null', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ openai_model: null }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Default (gpt-4o-mini)');
  });

  it('should display API key status when has_openai_api_key is true', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ has_openai_api_key: true }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Configured (tenant-specific)');
  });

  it('should display global key status when has_openai_api_key is false', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant({ has_openai_api_key: false }));
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Using global key');
  });

  it('should display Human-First label when agent_timeout_seconds > 0', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ agent_timeout_seconds: 120, chatwoot_account_id: 1 })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Human-First');
  });

  // Platform Actions tests
  it('should show Viber section when viber_auth_token is set', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ has_viber_token: true, has_telegram_token: false })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Platform Actions');
    expect(compiled.textContent).toContain('Viber');
  });

  it('should show Telegram section when telegram_bot_token is set', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ has_viber_token: false, has_telegram_token: true })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Platform Actions');
    expect(compiled.textContent).toContain('Telegram');
  });

  it('should not show Platform Actions when no platform tokens', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ has_viber_token: false, has_telegram_token: false })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('Platform Actions');
  });

  it('should call registerViberWebhook and show snackbar', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.registerViberWebhook();
    expect(component.webhookLoading()).toBeTrue();

    httpTesting.expectOne('/api/viber/register-webhook').flush({
      message: 'Webhook registered',
      webhook_url: 'https://example.com/api/viber/webhook/test-company',
    });

    expect(component.webhookLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith(
      jasmine.stringContaining('Webhook registered'),
      'OK',
      jasmine.any(Object)
    );
  });

  it('should show error snackbar on Viber webhook failure', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.registerViberWebhook();
    httpTesting.expectOne('/api/viber/register-webhook').flush('', { status: 500, statusText: 'Error' });

    expect(component.webhookLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Failed to register Viber webhook', 'OK', jasmine.any(Object));
  });

  it('should call registerTelegramWebhook and show snackbar', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.registerTelegramWebhook();
    expect(component.webhookLoading()).toBeTrue();

    httpTesting.expectOne('/api/telegram/register-webhook').flush({
      message: 'Telegram webhook registered',
      webhook_url: 'https://example.com/api/telegram/webhook/test-company',
    });

    expect(component.webhookLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith(
      jasmine.stringContaining('Webhook registered'),
      'OK',
      jasmine.any(Object)
    );
  });

  it('should show error snackbar on Telegram webhook failure', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.registerTelegramWebhook();
    httpTesting.expectOne('/api/telegram/register-webhook').flush('', { status: 500, statusText: 'Error' });

    expect(component.webhookLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Failed to register Telegram webhook', 'OK', jasmine.any(Object));
  });

  it('should call sendViberTestMessage with prompted user ID', () => {
    setup();
    spyOn(window, 'prompt').and.returnValue('viber-user-123');
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.sendViberTest();
    expect(component.testMessageLoading()).toBeTrue();

    const req = httpTesting.expectOne('/api/viber/test-message');
    expect(req.request.body).toEqual({ tenant_id: 'tenant-1', viber_user_id: 'viber-user-123' });
    req.flush({ message: 'Test message sent' });

    expect(component.testMessageLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Test message sent', 'OK', jasmine.any(Object));
  });

  it('should not send Viber test when prompt is cancelled', () => {
    setup();
    spyOn(window, 'prompt').and.returnValue(null);
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.sendViberTest();
    expect(component.testMessageLoading()).toBeFalse();
  });

  it('should show error on Viber test message failure', () => {
    setup();
    spyOn(window, 'prompt').and.returnValue('viber-user-123');
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.sendViberTest();
    httpTesting.expectOne('/api/viber/test-message').flush('', { status: 500, statusText: 'Error' });

    expect(component.testMessageLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Failed to send test message', 'OK', jasmine.any(Object));
  });

  it('should call sendTelegramTestMessage with prompted chat ID', () => {
    setup();
    spyOn(window, 'prompt').and.returnValue('98765');
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.sendTelegramTest();
    expect(component.testMessageLoading()).toBeTrue();

    const req = httpTesting.expectOne('/api/telegram/test-message');
    expect(req.request.body).toEqual({ tenant_id: 'tenant-1', chat_id: '98765' });
    req.flush({ message: 'Test message sent' });

    expect(component.testMessageLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith('Test message sent', 'OK', jasmine.any(Object));
  });

  it('should not send Telegram test when prompt is cancelled', () => {
    setup();
    spyOn(window, 'prompt').and.returnValue(null);
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());

    component.sendTelegramTest();
    expect(component.testMessageLoading()).toBeFalse();
  });

  // Chatwoot setup status tests
  it('should show pending status with spinner', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_setup_status: 'pending', chatwoot_account_id: null })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('setup in progress');
  });

  it('should show failed status with error message', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_setup_status: 'failed', chatwoot_setup_error: 'Connection refused', chatwoot_account_id: null })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('setup failed');
    expect(compiled.textContent).toContain('Connection refused');
    expect(compiled.textContent).toContain('Retry Setup');
  });

  it('should show completed status when auto-provisioned', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_setup_status: 'completed', chatwoot_account_id: 5 })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('auto-provisioned successfully');
  });

  it('should show Setup Chatwoot button when no config and status is none', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_setup_status: 'none', chatwoot_account_id: null })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Setup Chatwoot');
  });

  it('should call setupChatwoot on retry click', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_setup_status: 'failed', chatwoot_account_id: null })
    );

    component.retryChatwootSetup();
    expect(component.chatwootSetupLoading()).toBeTrue();

    httpTesting.expectOne('/api/tenants/tenant-1/setup-chatwoot').flush({
      message: 'Chatwoot setup started',
      status: 'pending',
    });

    expect(component.chatwootSetupLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith(
      jasmine.stringContaining('Chatwoot setup started'),
      'OK',
      jasmine.any(Object)
    );
  });

  it('should show error on retry failure', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_setup_status: 'failed', chatwoot_account_id: null })
    );

    component.retryChatwootSetup();
    httpTesting.expectOne('/api/tenants/tenant-1/setup-chatwoot').flush(
      { error: 'CHATWOOT_PLATFORM_TOKEN is not configured' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.chatwootSetupLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith(
      'CHATWOOT_PLATFORM_TOKEN is not configured',
      'OK',
      jasmine.any(Object)
    );
  });

  it('should not retry without tenant', () => {
    setup(null);
    fixture.detectChanges();
    component.retryChatwootSetup();
    httpTesting.expectNone('/api/tenants/null/setup-chatwoot');
  });

  it('should show CRM card even without chatwoot_account_id', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_account_id: null, chatwoot_setup_status: 'none' })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Chatwoot CRM');
  });

  it('should not show Manage Agents when chatwoot_account_id is null', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_account_id: null, chatwoot_setup_status: 'none' })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('Manage Agents');
  });

  it('should not show setup button when status is pending', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_account_id: null, chatwoot_setup_status: 'pending' })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain('Setup Chatwoot');
    expect(compiled.textContent).not.toContain('Retry Setup');
  });

  it('should show hint text when no chatwoot config and not pending', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_account_id: null, chatwoot_setup_status: 'none' })
    );
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No Chatwoot configuration');
  });

  it('should show fallback error message when retry error has no nested error', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(
      makeTenant({ chatwoot_setup_status: 'failed', chatwoot_account_id: null })
    );

    component.retryChatwootSetup();
    httpTesting.expectOne('/api/tenants/tenant-1/setup-chatwoot').flush(
      'Server Error',
      { status: 500, statusText: 'Internal Server Error' }
    );

    expect(component.chatwootSetupLoading()).toBeFalse();
    expect(snackBar.open).toHaveBeenCalledWith(
      'Failed to start Chatwoot setup',
      'OK',
      jasmine.any(Object)
    );
  });

  // Security: Tenant model should not expose secret fields
  it('should not have raw secret tokens in tenant response model', () => {
    setup();
    fixture.detectChanges();
    const tenant = makeTenant();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(tenant);

    const t = component.tenant()!;
    // Verify the Tenant model uses boolean flags instead of raw tokens
    expect(t.has_viber_token).toBeDefined();
    expect(t.has_telegram_token).toBeDefined();
    expect(t.has_openai_api_key).toBeDefined();
    // Verify raw token fields do NOT exist on the model
    expect((t as any).viber_auth_token).toBeUndefined();
    expect((t as any).telegram_bot_token).toBeUndefined();
    expect((t as any).openai_api_key).toBeUndefined();
    expect((t as any).chatwoot_api_token).toBeUndefined();
  });

  it('should show Manage Connectors link in Data Sources section', () => {
    setup();
    fixture.detectChanges();
    httpTesting.expectOne('/api/tenants/tenant-1').flush(makeTenant());
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Data Sources');
    expect(compiled.textContent).toContain('Manage Connectors');
  });
});

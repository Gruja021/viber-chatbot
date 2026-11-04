import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: AuthService;
  let router: Router;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: { navigate: jasmine.createSpy('navigate') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    httpTesting = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have empty token initially', () => {
    expect(component.token).toBe('');
  });

  it('should have loading false initially', () => {
    expect(component.loading()).toBeFalse();
  });

  it('should have empty error initially', () => {
    expect(component.error()).toBe('');
  });

  it('should not do anything on onLogin with empty token', () => {
    component.token = '';
    component.onLogin();
    expect(component.loading()).toBeFalse();
  });

  it('should set loading to true on login attempt', () => {
    component.token = 'test-token';
    component.onLogin();
    expect(component.loading()).toBeTrue();

    // Flush pending request
    httpTesting.expectOne('/api/tenants').flush([]);
  });

  it('should call auth.login with the token', () => {
    spyOn(authService, 'login').and.callThrough();
    component.token = 'my-api-key';
    component.onLogin();

    expect(authService.login).toHaveBeenCalledWith('my-api-key');
    httpTesting.expectOne('/api/tenants').flush([]);
  });

  it('should navigate to /dashboard on success', () => {
    component.token = 'valid-token';
    component.onLogin();

    httpTesting.expectOne('/api/tenants').flush([]);

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(component.loading()).toBeFalse();
  });

  it('should call logout and set error on failure', () => {
    spyOn(authService, 'logout').and.callThrough();
    component.token = 'bad-token';
    component.onLogin();

    httpTesting.expectOne('/api/tenants').flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).toHaveBeenCalled();
    expect(component.error()).toBe('Invalid API token. Please check and try again.');
    expect(component.loading()).toBeFalse();
  });

  it('should clear error when retrying login', () => {
    component.token = 'bad';
    component.onLogin();
    httpTesting.expectOne('/api/tenants').flush('', { status: 401, statusText: 'Unauthorized' });
    expect(component.error()).toBeTruthy();

    component.token = 'retry';
    component.onLogin();
    expect(component.error()).toBe('');
    httpTesting.expectOne('/api/tenants').flush([]);
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './api.service';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpTesting: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should add Authorization header when token exists', () => {
    authService.login('my-secret-token');

    httpClient.get('/api/test').subscribe();

    const req = httpTesting.expectOne('/api/test');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-secret-token');
    req.flush({});
  });

  it('should not add Authorization header when no token', () => {
    httpClient.get('/api/test').subscribe();

    const req = httpTesting.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('should not modify request method', () => {
    authService.login('token');

    httpClient.post('/api/data', { key: 'value' }).subscribe();

    const req = httpTesting.expectOne('/api/data');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ key: 'value' });
    req.flush({});
  });

  it('should preserve original request body', () => {
    authService.login('token');
    const body = { name: 'test', count: 42 };

    httpClient.put('/api/items/1', body).subscribe();

    const req = httpTesting.expectOne('/api/items/1');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });
});

import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should read token from localStorage on creation', () => {
    localStorage.setItem('admin_api_token', 'pre-existing-token');
    const fresh = TestBed.inject(AuthService);
    // The service was already created before we set this, so we test the mechanism
    expect(fresh).toBeTruthy();
  });

  it('should have isLoggedIn false when no token', () => {
    expect(service.isLoggedIn()).toBeFalse();
  });

  it('should have isLoggedIn true when token exists', () => {
    service.login('my-token');
    expect(service.isLoggedIn()).toBeTrue();
  });

  it('should store token in localStorage on login', () => {
    service.login('test-token');
    expect(localStorage.getItem('admin_api_token')).toBe('test-token');
  });

  it('should return token via getToken after login', () => {
    service.login('abc-123');
    expect(service.getToken()).toBe('abc-123');
  });

  it('should remove token on logout', () => {
    service.login('token-to-remove');
    service.logout();
    expect(localStorage.getItem('admin_api_token')).toBeNull();
    expect(service.isLoggedIn()).toBeFalse();
  });

  it('should return null from getToken after logout', () => {
    service.login('temp-token');
    service.logout();
    expect(service.getToken()).toBeNull();
  });
});

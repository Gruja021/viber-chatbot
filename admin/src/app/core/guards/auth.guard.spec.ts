import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            createUrlTree: jasmine.createSpy('createUrlTree').and.callFake(
              (commands: string[]) => ({ toString: () => commands.join('/') } as unknown as UrlTree)
            ),
          },
        },
      ],
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return true when user is logged in', () => {
    authService.login('valid-token');

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(result).toBeTrue();
  });

  it('should return UrlTree to /login when user is not logged in', () => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(result).not.toBeTrue();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('should return true after login and false after logout', () => {
    authService.login('token');
    let result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(result).toBeTrue();

    authService.logout();
    result = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(result).not.toBeTrue();
  });

  it('should redirect to /login path', () => {
    TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});

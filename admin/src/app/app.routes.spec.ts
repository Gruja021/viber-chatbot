import { routes } from './app.routes';
import { authGuard } from './core/guards/auth.guard';

describe('App Routes', () => {
  it('should have a login route', () => {
    const loginRoute = routes.find(r => r.path === 'login');
    expect(loginRoute).toBeTruthy();
    expect(loginRoute!.loadComponent).toBeDefined();
  });

  it('should have a wildcard route', () => {
    const wildcard = routes.find(r => r.path === '**');
    expect(wildcard).toBeTruthy();
    expect(wildcard!.loadComponent).toBeDefined();
  });

  it('should have a protected parent route with authGuard', () => {
    const protectedRoute = routes.find(r => r.path === '' && r.children);
    expect(protectedRoute).toBeTruthy();
    expect(protectedRoute!.canActivate).toContain(authGuard);
  });

  it('should have dashboard route as child', () => {
    const parent = routes.find(r => r.path === '' && r.children);
    const dashboard = parent!.children!.find(r => r.path === 'dashboard');
    expect(dashboard).toBeTruthy();
    expect(dashboard!.loadComponent).toBeDefined();
  });

  it('should have tenants list route', () => {
    const parent = routes.find(r => r.path === '' && r.children);
    const tenants = parent!.children!.find(r => r.path === 'tenants');
    expect(tenants).toBeTruthy();
  });

  it('should have tenants/new route', () => {
    const parent = routes.find(r => r.path === '' && r.children);
    const newTenant = parent!.children!.find(r => r.path === 'tenants/new');
    expect(newTenant).toBeTruthy();
  });

  it('should have tenants/:id route', () => {
    const parent = routes.find(r => r.path === '' && r.children);
    const detail = parent!.children!.find(r => r.path === 'tenants/:id');
    expect(detail).toBeTruthy();
  });

  it('should redirect empty path to dashboard', () => {
    const parent = routes.find(r => r.path === '' && r.children);
    const redirect = parent!.children!.find(r => r.path === '' && r.redirectTo === 'dashboard');
    expect(redirect).toBeTruthy();
    expect(redirect!.pathMatch).toBe('full');
  });
});

import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'tenants', loadComponent: () => import('./pages/tenants/tenant-list.component').then(m => m.TenantListComponent) },
      { path: 'tenants/new', loadComponent: () => import('./pages/tenants/tenant-form.component').then(m => m.TenantFormComponent) },
      { path: 'tenants/:id/edit', loadComponent: () => import('./pages/tenants/tenant-form.component').then(m => m.TenantFormComponent) },
      { path: 'tenants/:id/agents', loadComponent: () => import('./pages/tenants/tenant-agents.component').then(m => m.TenantAgentsComponent) },
      { path: 'tenants/:id', loadComponent: () => import('./pages/tenants/tenant-detail.component').then(m => m.TenantDetailComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent) },
];

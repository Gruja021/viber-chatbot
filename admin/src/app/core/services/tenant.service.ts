import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Tenant,
  CreateTenantInput,
  UpdateTenantInput,
  TenantHealthResponse,
  SystemHealth,
} from '../models/tenant.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TenantService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  getSystemHealth(): Observable<SystemHealth> {
    return this.http.get<SystemHealth>(`${this.baseUrl}/health`);
  }

  getTenants(): Observable<Tenant[]> {
    return this.http.get<Tenant[]>(`${this.baseUrl}/api/tenants`);
  }

  getTenant(id: string): Observable<Tenant> {
    return this.http.get<Tenant>(`${this.baseUrl}/api/tenants/${id}`);
  }

  createTenant(input: CreateTenantInput): Observable<Tenant> {
    return this.http.post<Tenant>(`${this.baseUrl}/api/tenants`, input);
  }

  updateTenant(id: string, input: UpdateTenantInput): Observable<Tenant> {
    return this.http.put<Tenant>(`${this.baseUrl}/api/tenants/${id}`, input);
  }

  deleteTenant(id: string): Observable<Tenant> {
    return this.http.delete<Tenant>(`${this.baseUrl}/api/tenants/${id}`);
  }

  getTenantHealth(id: string): Observable<TenantHealthResponse> {
    return this.http.get<TenantHealthResponse>(
      `${this.baseUrl}/api/tenants/${id}/health`
    );
  }
}

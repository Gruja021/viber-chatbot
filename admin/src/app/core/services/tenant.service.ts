import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Tenant,
  CreateTenantInput,
  UpdateTenantInput,
  TenantHealthResponse,
  SystemHealth,
  CreditUsageSummary,
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

  registerViberWebhook(tenantId: string): Observable<{ message: string; webhook_url: string }> {
    return this.http.post<{ message: string; webhook_url: string }>(
      `${this.baseUrl}/api/viber/register-webhook`,
      { tenant_id: tenantId }
    );
  }

  registerTelegramWebhook(tenantId: string): Observable<{ message: string; webhook_url: string }> {
    return this.http.post<{ message: string; webhook_url: string }>(
      `${this.baseUrl}/api/telegram/register-webhook`,
      { tenant_id: tenantId }
    );
  }

  sendViberTestMessage(tenantId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/api/viber/test-message`,
      { tenant_id: tenantId, viber_user_id: userId }
    );
  }

  sendTelegramTestMessage(tenantId: string, chatId: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/api/telegram/test-message`,
      { tenant_id: tenantId, chat_id: chatId }
    );
  }

  setupChatwoot(tenantId: string): Observable<{ message: string; status: string }> {
    return this.http.post<{ message: string; status: string }>(
      `${this.baseUrl}/api/tenants/${tenantId}/setup-chatwoot`,
      {}
    );
  }

  getCreditUsage(tenantId: string): Observable<CreditUsageSummary> {
    return this.http.get<CreditUsageSummary>(
      `${this.baseUrl}/api/tenants/${tenantId}/credit-usage`
    );
  }
}

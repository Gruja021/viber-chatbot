import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TenantConnector, CreateConnectorInput, UpdateConnectorInput } from '../models/tenant.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ConnectorService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  getConnectors(tenantId: string): Observable<TenantConnector[]> {
    return this.http.get<TenantConnector[]>(`${this.baseUrl}/api/tenants/${tenantId}/connectors`);
  }

  createConnector(tenantId: string, input: CreateConnectorInput): Observable<TenantConnector> {
    return this.http.post<TenantConnector>(`${this.baseUrl}/api/tenants/${tenantId}/connectors`, input);
  }

  updateConnector(tenantId: string, connectorId: string, input: UpdateConnectorInput): Observable<TenantConnector> {
    return this.http.put<TenantConnector>(`${this.baseUrl}/api/tenants/${tenantId}/connectors/${connectorId}`, input);
  }

  deleteConnector(tenantId: string, connectorId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/tenants/${tenantId}/connectors/${connectorId}`);
  }

  testConnector(tenantId: string, connectorId: string): Observable<{ success: boolean; detail: string }> {
    return this.http.post<{ success: boolean; detail: string }>(
      `${this.baseUrl}/api/tenants/${tenantId}/connectors/${connectorId}/test`, {}
    );
  }
}

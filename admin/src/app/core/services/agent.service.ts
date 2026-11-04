import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatwootAgent } from '../models/tenant.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AgentService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  getAgents(tenantId: string): Observable<ChatwootAgent[]> {
    return this.http.get<ChatwootAgent[]>(`${this.baseUrl}/api/tenants/${tenantId}/agents`);
  }

  addAgent(tenantId: string, name: string, email: string): Observable<ChatwootAgent> {
    return this.http.post<ChatwootAgent>(`${this.baseUrl}/api/tenants/${tenantId}/agents`, { name, email });
  }

  removeAgent(tenantId: string, agentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/tenants/${tenantId}/agents/${agentId}`);
  }
}

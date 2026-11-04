import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AgentService } from './agent.service';
import { makeChatwootAgent } from '../../testing/test-helpers';

describe('AgentService', () => {
  let service: AgentService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AgentService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // getAgents
  it('should GET agents for a tenant', () => {
    const agents = [makeChatwootAgent(), makeChatwootAgent({ id: 2, name: 'Agent 2' })];
    service.getAgents('tenant-1').subscribe((result) => {
      expect(result.length).toBe(2);
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1/agents');
    expect(req.request.method).toBe('GET');
    req.flush(agents);
  });

  // addAgent
  it('should POST to add an agent', () => {
    const agent = makeChatwootAgent({ id: 10, name: 'New Agent', email: 'new@test.com' });
    service.addAgent('tenant-1', 'New Agent', 'new@test.com').subscribe((result) => {
      expect(result.id).toBe(10);
    });
    const req = httpTesting.expectOne('/api/tenants/tenant-1/agents');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'New Agent', email: 'new@test.com' });
    req.flush(agent);
  });

  // removeAgent
  it('should DELETE an agent', () => {
    service.removeAgent('tenant-1', 10).subscribe();
    const req = httpTesting.expectOne('/api/tenants/tenant-1/agents/10');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // URL construction
  it('should use correct URL for getAgents', () => {
    service.getAgents('abc-123').subscribe();
    const req = httpTesting.expectOne('/api/tenants/abc-123/agents');
    expect(req.request.url).toBe('/api/tenants/abc-123/agents');
    req.flush([]);
  });

  it('should use correct URL for addAgent', () => {
    service.addAgent('abc-123', 'Agent', 'a@b.com').subscribe();
    const req = httpTesting.expectOne('/api/tenants/abc-123/agents');
    expect(req.request.url).toBe('/api/tenants/abc-123/agents');
    req.flush(makeChatwootAgent());
  });

  it('should use correct URL for removeAgent', () => {
    service.removeAgent('abc-123', 42).subscribe();
    const req = httpTesting.expectOne('/api/tenants/abc-123/agents/42');
    expect(req.request.url).toBe('/api/tenants/abc-123/agents/42');
    req.flush(null);
  });

  // Error handling
  it('should propagate error on getAgents failure', () => {
    let errorCaught = false;
    service.getAgents('tenant-1').subscribe({
      error: () => { errorCaught = true; },
    });
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush(
      { error: 'No Chatwoot config' },
      { status: 400, statusText: 'Bad Request' }
    );
    expect(errorCaught).toBeTrue();
  });

  it('should propagate error on addAgent failure', () => {
    let errorCaught = false;
    service.addAgent('tenant-1', 'Agent', 'a@b.com').subscribe({
      error: () => { errorCaught = true; },
    });
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush(
      { error: 'Email taken' },
      { status: 409, statusText: 'Conflict' }
    );
    expect(errorCaught).toBeTrue();
  });

  it('should propagate error on removeAgent failure', () => {
    let errorCaught = false;
    service.removeAgent('tenant-1', 10).subscribe({
      error: () => { errorCaught = true; },
    });
    httpTesting.expectOne('/api/tenants/tenant-1/agents/10').flush(
      { error: 'Not found' },
      { status: 404, statusText: 'Not Found' }
    );
    expect(errorCaught).toBeTrue();
  });

  it('should return empty array when no agents', () => {
    service.getAgents('tenant-1').subscribe((result) => {
      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });
    httpTesting.expectOne('/api/tenants/tenant-1/agents').flush([]);
  });
});

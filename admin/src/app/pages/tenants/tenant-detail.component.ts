import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, TitleCasePipe, KeyValuePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { HealthBadgeComponent } from '../../shared/components/health-badge.component';
import { TenantService } from '../../core/services/tenant.service';
import { Tenant, TenantHealthResponse, CreditUsageSummary } from '../../core/models/tenant.model';

@Component({
  selector: 'app-tenant-detail',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    TitleCasePipe,
    KeyValuePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressBarModule,
    NavbarComponent,
    HealthBadgeComponent,
  ],
  template: `
    <app-navbar />
    <div class="page-container">
      @if (loading()) {
        <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (tenant()) {
        <div class="header-row">
          <div>
            <h1>{{ tenant()!.firm_name }}</h1>
            <p class="subtitle">{{ tenant()!.slug }}</p>
          </div>
          <div class="actions">
            <button mat-raised-button [routerLink]="['/tenants', tenant()!.id, 'edit']">
              <mat-icon>edit</mat-icon> Edit
            </button>
            <button mat-raised-button color="warn" (click)="deactivate()"
                    [disabled]="tenant()!.status === 'inactive'">
              <mat-icon>block</mat-icon> Deactivate
            </button>
          </div>
        </div>

        <div class="cards-grid">
          <!-- Status & Platforms -->
          <mat-card>
            <mat-card-header><mat-card-title>Overview</mat-card-title></mat-card-header>
            <mat-card-content>
              <mat-list>
                <mat-list-item>
                  <span matListItemTitle>Status</span>
                  <span matListItemLine>
                    <span class="status-badge" [class.active]="tenant()!.status === 'active'">{{ tenant()!.status }}</span>
                  </span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Platforms</span>
                  <span matListItemLine>
                    {{ tenant()!.has_viber_token ? 'Viber' : '' }}
                    {{ tenant()!.has_viber_token && tenant()!.has_telegram_token ? ' · ' : '' }}
                    {{ tenant()!.has_telegram_token ? 'Telegram' : '' }}
                    {{ !tenant()!.has_viber_token && !tenant()!.has_telegram_token ? 'None configured' : '' }}
                  </span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Data Sources</span>
                  <span matListItemLine>
                    <a [routerLink]="['/tenants', tenant()!.id, 'connectors']">Manage Connectors</a>
                  </span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Timezone</span>
                  <span matListItemLine>{{ tenant()!.timezone }}</span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Created</span>
                  <span matListItemLine>{{ tenant()!.created_at | date:'medium' }}</span>
                </mat-list-item>
              </mat-list>
            </mat-card-content>
          </mat-card>

          <!-- Health Check -->
          <mat-card>
            <mat-card-header><mat-card-title>Health Check</mat-card-title></mat-card-header>
            <mat-card-content>
              @if (healthLoading()) {
                <mat-spinner diameter="32"></mat-spinner>
              } @else if (healthResult()) {
                <div class="health-checks">
                  @for (check of healthResult()!.checks; track check.check) {
                    <div class="health-row">
                      <app-health-badge [healthy]="check.healthy" [label]="check.check" />
                      <span class="health-detail">{{ check.detail }}</span>
                    </div>
                  }
                </div>
              } @else {
                <p class="hint">Click "Run Health Check" to verify tenant connectivity.</p>
              }
            </mat-card-content>
            <mat-card-actions>
              <button mat-button (click)="runHealthCheck()" [disabled]="healthLoading()">
                <mat-icon>play_arrow</mat-icon> Run Health Check
              </button>
            </mat-card-actions>
          </mat-card>
        </div>

        <!-- Platform Actions -->
        @if (tenant()!.has_viber_token || tenant()!.has_telegram_token) {
          <mat-card>
            <mat-card-header><mat-card-title>Platform Actions</mat-card-title></mat-card-header>
            <mat-card-content>
              @if (tenant()!.has_viber_token) {
                <h4 class="platform-heading">Viber</h4>
                <div class="platform-actions">
                  <button mat-raised-button (click)="registerViberWebhook()"
                          [disabled]="webhookLoading()">
                    <mat-icon>link</mat-icon> Register Webhook
                  </button>
                  <button mat-raised-button (click)="sendViberTest()"
                          [disabled]="testMessageLoading()">
                    <mat-icon>send</mat-icon> Send Test Message
                  </button>
                </div>
              }
              @if (tenant()!.has_telegram_token) {
                <h4 class="platform-heading">Telegram</h4>
                <div class="platform-actions">
                  <button mat-raised-button (click)="registerTelegramWebhook()"
                          [disabled]="webhookLoading()">
                    <mat-icon>link</mat-icon> Register Webhook
                  </button>
                  <button mat-raised-button (click)="sendTelegramTest()"
                          [disabled]="testMessageLoading()">
                    <mat-icon>send</mat-icon> Send Test Message
                  </button>
                </div>
              }
            </mat-card-content>
          </mat-card>
        }

        <!-- AI Configuration -->
        <mat-card>
          <mat-card-header><mat-card-title>AI Configuration</mat-card-title></mat-card-header>
          <mat-card-content>
            <mat-list>
              <mat-list-item>
                <span matListItemTitle>Model</span>
                <span matListItemLine>{{ tenant()!.openai_model || 'Default (gpt-4o-mini)' }}</span>
              </mat-list-item>
              <mat-list-item>
                <span matListItemTitle>API Key</span>
                <span matListItemLine>{{ tenant()!.has_openai_api_key ? 'Configured (tenant-specific)' : 'Using global key' }}</span>
              </mat-list-item>
            </mat-list>
            @if (tenant()!.system_prompt) {
              <h4 style="margin: 16px 0 8px;">System Prompt</h4>
              <pre class="prompt-text">{{ tenant()!.system_prompt }}</pre>
            }
          </mat-card-content>
        </mat-card>

        <!-- CRM -->
        <mat-card>
          <mat-card-header><mat-card-title>Chatwoot CRM</mat-card-title></mat-card-header>
          <mat-card-content>
            @if (tenant()!.chatwoot_account_id) {
              <mat-list>
                <mat-list-item>
                  <span matListItemTitle>Account ID</span>
                  <span matListItemLine>{{ tenant()!.chatwoot_account_id }}</span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Inbox ID</span>
                  <span matListItemLine>{{ tenant()!.chatwoot_inbox_id }}</span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Agent Timeout</span>
                  <span matListItemLine>{{ tenant()!.agent_timeout_seconds }}s ({{ tenant()!.agent_timeout_seconds === 0 ? 'AI-First' : 'Human-First' }})</span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Session Timeout</span>
                  <span matListItemLine>{{ tenant()!.session_timeout_hours }}h</span>
                </mat-list-item>
              </mat-list>
            }

            <!-- Chatwoot Setup Status -->
            @if (tenant()!.chatwoot_setup_status === 'pending') {
              <div class="setup-status setup-pending">
                <mat-spinner diameter="20"></mat-spinner>
                <span>Chatwoot setup in progress...</span>
              </div>
            }
            @if (tenant()!.chatwoot_setup_status === 'failed') {
              <div class="setup-status setup-failed">
                <mat-icon>error</mat-icon>
                <span>Chatwoot setup failed: {{ tenant()!.chatwoot_setup_error }}</span>
              </div>
            }
            @if (tenant()!.chatwoot_setup_status === 'completed' && tenant()!.chatwoot_account_id) {
              <div class="setup-status setup-completed">
                <mat-icon>check_circle</mat-icon>
                <span>Chatwoot auto-provisioned successfully</span>
              </div>
            }
            @if (!tenant()!.chatwoot_account_id && tenant()!.chatwoot_setup_status !== 'pending') {
              <p class="hint">No Chatwoot configuration. Use the button below to auto-setup or configure manually via Edit.</p>
            }
          </mat-card-content>
          <mat-card-actions>
            @if (tenant()!.chatwoot_account_id) {
              <button mat-button [routerLink]="['/tenants', tenant()!.id, 'agents']">
                <mat-icon>people</mat-icon> Manage Agents
              </button>
            }
            @if (!tenant()!.chatwoot_account_id && tenant()!.chatwoot_setup_status !== 'pending') {
              <button mat-button (click)="retryChatwootSetup()" [disabled]="chatwootSetupLoading()">
                @if (chatwootSetupLoading()) {
                  <mat-spinner diameter="18"></mat-spinner>
                } @else {
                  <mat-icon>refresh</mat-icon>
                  {{ tenant()!.chatwoot_setup_status === 'failed' ? 'Retry Setup' : 'Setup Chatwoot' }}
                }
              </button>
            }
          </mat-card-actions>
        </mat-card>

        <!-- AI Credit Usage -->
        @if (tenant()!.monthly_credit_limit !== null) {
          <mat-card>
            <mat-card-header><mat-card-title>AI Credit Usage</mat-card-title></mat-card-header>
            <mat-card-content>
              @if (creditUsage()) {
                <div class="credit-usage">
                  <mat-progress-bar
                    mode="determinate"
                    [value]="getCreditPercentage()"
                    [color]="getCreditPercentage() > 90 ? 'warn' : 'primary'">
                  </mat-progress-bar>
                  <p class="credit-text">
                    {{ creditUsage()!.credits_used }} / {{ (creditUsage()!.monthly_credit_limit ?? 0) + (creditUsage()!.bonus_credits ?? 0) }} credits used
                    ({{ creditUsage()!.credits_remaining ?? 0 }} remaining)
                  </p>
                  @if (creditUsage()!.bonus_credits > 0) {
                    <p class="credit-bonus">+ {{ creditUsage()!.bonus_credits }} bonus credits</p>
                  }
                  @if (creditUsage()!.credits_reset_at) {
                    <p class="credit-reset">Resets: {{ creditUsage()!.credits_reset_at | date:'mediumDate' }}</p>
                  }
                  @if (creditUsage()!.breakdown.length) {
                    <h4 style="margin: 12px 0 4px;">Breakdown</h4>
                    <mat-list dense>
                      @for (item of creditUsage()!.breakdown; track item.credit_type) {
                        <mat-list-item>
                          <span matListItemTitle>{{ formatCreditType(item.credit_type) }}</span>
                          <span matListItemLine>{{ item.total_credits }} credits ({{ item.count }} calls)</span>
                        </mat-list-item>
                      }
                    </mat-list>
                  }
                </div>
              } @else {
                <p class="hint">Loading credit usage...</p>
              }
            </mat-card-content>
          </mat-card>
        }

        <!-- Working Hours -->
        @if (hasWorkingHours()) {
          <mat-card>
            <mat-card-header><mat-card-title>Working Hours</mat-card-title></mat-card-header>
            <mat-card-content>
              <mat-list>
                @for (entry of tenant()!.working_hours | keyvalue; track entry.key) {
                  <mat-list-item>
                    <span matListItemTitle>{{ entry.key | titlecase }}</span>
                    <span matListItemLine>{{ entry.value?.start }} - {{ entry.value?.end }}</span>
                  </mat-list-item>
                }
              </mat-list>
            </mat-card-content>
          </mat-card>
        }

        <!-- Handover Keywords -->
        @if (tenant()!.handover_keywords.length) {
          <mat-card>
            <mat-card-header><mat-card-title>Handover Keywords</mat-card-title></mat-card-header>
            <mat-card-content>
              <mat-chip-set>
                @for (kw of tenant()!.handover_keywords; track kw) {
                  <mat-chip>{{ kw }}</mat-chip>
                }
              </mat-chip-set>
            </mat-card-content>
          </mat-card>
        }
      }
    </div>
  `,
  styles: [`
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .subtitle { color: #666; margin-top: -8px; }
    .actions { display: flex; gap: 8px; }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }
    .center { display: flex; justify-content: center; padding: 64px; }
    .health-checks { margin: 16px 0; }
    .health-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .health-detail { color: #666; font-size: 13px; }
    .hint { color: #999; font-style: italic; }
    .prompt-text {
      white-space: pre-wrap;
      font-family: monospace;
      background: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      font-size: 13px;
    }
    .status-badge {
      display: inline-block;
      margin-top: 4px;
      padding: 6px 16px;
      border-radius: 16px;
      font-size: 14px;
      font-weight: 500;
      color: white;
      background-color: #9e9e9e;
    }
    .status-badge.active { background-color: #4caf50; }
    mat-card { margin-bottom: 16px; }
    .platform-heading { margin: 16px 0 8px; }
    .platform-heading:first-child { margin-top: 0; }
    .platform-actions { display: flex; gap: 8px; margin-bottom: 8px; }
    .setup-status { display: flex; align-items: center; gap: 8px; padding: 12px; border-radius: 4px; margin: 8px 0; }
    .setup-pending { background: #fff3e0; color: #e65100; }
    .setup-failed { background: #fbe9e7; color: #c62828; }
    .setup-completed { background: #e8f5e9; color: #2e7d32; }
    .credit-usage { margin: 8px 0; }
    .credit-text { margin: 8px 0 4px; font-weight: 500; }
    .credit-bonus { color: #2e7d32; font-size: 13px; margin: 0; }
    .credit-reset { color: #666; font-size: 13px; margin: 4px 0 0; }
  `],
})
export class TenantDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tenantService = inject(TenantService);
  private snackBar = inject(MatSnackBar);

  tenant = signal<Tenant | null>(null);
  loading = signal(true);
  healthResult = signal<TenantHealthResponse | null>(null);
  healthLoading = signal(false);
  webhookLoading = signal(false);
  testMessageLoading = signal(false);
  chatwootSetupLoading = signal(false);
  creditUsage = signal<CreditUsageSummary | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadTenant(id);
  }

  getCreditPercentage(): number {
    const usage = this.creditUsage();
    if (!usage || usage.monthly_credit_limit === null) return 0;
    const total = usage.monthly_credit_limit + (usage.bonus_credits ?? 0);
    if (total === 0) return 100;
    return Math.min(100, Math.round((usage.credits_used / total) * 100));
  }

  formatCreditType(type: string): string {
    const labels: Record<string, string> = {
      text_response: 'Text Responses',
      database_search: 'Database Searches',
      image_analysis: 'Image Analysis',
      pdf_analysis: 'PDF Analysis',
    };
    return labels[type] || type;
  }

  hasWorkingHours(): boolean {
    const wh = this.tenant()?.working_hours;
    return !!wh && Object.keys(wh).length > 0;
  }

  runHealthCheck(): void {
    const id = this.tenant()?.id;
    if (!id) return;

    this.healthLoading.set(true);
    this.healthResult.set(null);

    this.tenantService.getTenantHealth(id).subscribe({
      next: (result) => {
        this.healthResult.set(result);
        this.healthLoading.set(false);
      },
      error: () => {
        this.healthLoading.set(false);
        this.snackBar.open('Health check failed', 'OK', { duration: 3000 });
      },
    });
  }

  deactivate(): void {
    const t = this.tenant();
    if (!t || !confirm(`Deactivate ${t.firm_name}?`)) return;

    this.tenantService.deleteTenant(t.id).subscribe({
      next: (updated) => {
        this.tenant.set(updated);
        this.snackBar.open('Tenant deactivated', 'OK', { duration: 3000 });
      },
      error: () => {
        this.snackBar.open('Failed to deactivate tenant', 'OK', { duration: 3000 });
      },
    });
  }

  registerViberWebhook(): void {
    const id = this.tenant()?.id;
    if (!id) return;
    this.webhookLoading.set(true);
    this.tenantService.registerViberWebhook(id).subscribe({
      next: (res) => {
        this.webhookLoading.set(false);
        this.snackBar.open(`Webhook registered: ${res.webhook_url}`, 'OK', { duration: 5000 });
      },
      error: () => {
        this.webhookLoading.set(false);
        this.snackBar.open('Failed to register Viber webhook', 'OK', { duration: 3000 });
      },
    });
  }

  registerTelegramWebhook(): void {
    const id = this.tenant()?.id;
    if (!id) return;
    this.webhookLoading.set(true);
    this.tenantService.registerTelegramWebhook(id).subscribe({
      next: (res) => {
        this.webhookLoading.set(false);
        this.snackBar.open(`Webhook registered: ${res.webhook_url}`, 'OK', { duration: 5000 });
      },
      error: () => {
        this.webhookLoading.set(false);
        this.snackBar.open('Failed to register Telegram webhook', 'OK', { duration: 3000 });
      },
    });
  }

  sendViberTest(): void {
    const id = this.tenant()?.id;
    if (!id) return;
    const userId = window.prompt('Enter Viber User ID:');
    if (!userId) return;
    this.testMessageLoading.set(true);
    this.tenantService.sendViberTestMessage(id, userId).subscribe({
      next: () => {
        this.testMessageLoading.set(false);
        this.snackBar.open('Test message sent', 'OK', { duration: 3000 });
      },
      error: () => {
        this.testMessageLoading.set(false);
        this.snackBar.open('Failed to send test message', 'OK', { duration: 3000 });
      },
    });
  }

  sendTelegramTest(): void {
    const id = this.tenant()?.id;
    if (!id) return;
    const chatId = window.prompt('Enter Telegram Chat ID:');
    if (!chatId) return;
    this.testMessageLoading.set(true);
    this.tenantService.sendTelegramTestMessage(id, chatId).subscribe({
      next: () => {
        this.testMessageLoading.set(false);
        this.snackBar.open('Test message sent', 'OK', { duration: 3000 });
      },
      error: () => {
        this.testMessageLoading.set(false);
        this.snackBar.open('Failed to send test message', 'OK', { duration: 3000 });
      },
    });
  }

  retryChatwootSetup(): void {
    const id = this.tenant()?.id;
    if (!id) return;

    this.chatwootSetupLoading.set(true);
    this.tenantService.setupChatwoot(id).subscribe({
      next: () => {
        this.chatwootSetupLoading.set(false);
        this.snackBar.open('Chatwoot setup started. Reloading in 3s...', 'OK', { duration: 3000 });
        setTimeout(() => this.loadTenant(id), 3000);
      },
      error: (err) => {
        this.chatwootSetupLoading.set(false);
        this.snackBar.open(err.error?.error || 'Failed to start Chatwoot setup', 'OK', { duration: 5000 });
      },
    });
  }

  private loadCreditUsage(tenantId: string): void {
    this.tenantService.getCreditUsage(tenantId).subscribe({
      next: (usage) => this.creditUsage.set(usage),
      error: () => { /* silently ignore */ },
    });
  }

  private loadTenant(id: string): void {
    this.loading.set(true);
    this.tenantService.getTenant(id).subscribe({
      next: (t) => {
        this.tenant.set(t);
        this.loading.set(false);
        if (t.monthly_credit_limit !== null) {
          this.loadCreditUsage(t.id);
        }
      },
      error: () => {
        this.snackBar.open('Tenant not found', 'OK', { duration: 3000 });
        this.router.navigate(['/tenants']);
      },
    });
  }
}

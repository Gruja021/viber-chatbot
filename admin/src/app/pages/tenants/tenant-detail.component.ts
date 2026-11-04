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
import { NavbarComponent } from '../../shared/components/navbar.component';
import { HealthBadgeComponent } from '../../shared/components/health-badge.component';
import { TenantService } from '../../core/services/tenant.service';
import { Tenant, TenantHealthResponse } from '../../core/models/tenant.model';

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
                    <mat-chip-set>
                      <mat-chip [style.background-color]="tenant()!.status === 'active' ? '#4caf50' : '#9e9e9e'"
                                style="color: white">{{ tenant()!.status }}</mat-chip>
                    </mat-chip-set>
                  </span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Platforms</span>
                  <span matListItemLine>
                    {{ tenant()!.viber_auth_token ? 'Viber' : '' }}
                    {{ tenant()!.viber_auth_token && tenant()!.telegram_bot_token ? ' · ' : '' }}
                    {{ tenant()!.telegram_bot_token ? 'Telegram' : '' }}
                    {{ !tenant()!.viber_auth_token && !tenant()!.telegram_bot_token ? 'None configured' : '' }}
                  </span>
                </mat-list-item>
                <mat-list-item>
                  <span matListItemTitle>Database Type</span>
                  <span matListItemLine>{{ tenant()!.database_type || 'None' }}</span>
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

        <!-- System Prompt -->
        @if (tenant()!.system_prompt) {
          <mat-card>
            <mat-card-header><mat-card-title>System Prompt</mat-card-title></mat-card-header>
            <mat-card-content>
              <pre class="prompt-text">{{ tenant()!.system_prompt }}</pre>
            </mat-card-content>
          </mat-card>
        }

        <!-- CRM -->
        @if (tenant()!.chatwoot_account_id) {
          <mat-card>
            <mat-card-header><mat-card-title>Chatwoot CRM</mat-card-title></mat-card-header>
            <mat-card-content>
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
                  <span matListItemLine>{{ tenant()!.agent_timeout_seconds }}s</span>
                </mat-list-item>
              </mat-list>
            </mat-card-content>
            <mat-card-actions>
              <button mat-button [routerLink]="['/tenants', tenant()!.id, 'agents']">
                <mat-icon>people</mat-icon> Manage Agents
              </button>
            </mat-card-actions>
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
    mat-card { margin-bottom: 16px; }
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

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadTenant(id);
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

  private loadTenant(id: string): void {
    this.loading.set(true);
    this.tenantService.getTenant(id).subscribe({
      next: (t) => { this.tenant.set(t); this.loading.set(false); },
      error: () => {
        this.snackBar.open('Tenant not found', 'OK', { duration: 3000 });
        this.router.navigate(['/tenants']);
      },
    });
  }
}

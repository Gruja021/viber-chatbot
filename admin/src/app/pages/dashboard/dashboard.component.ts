import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { HealthBadgeComponent } from '../../shared/components/health-badge.component';
import { TenantService } from '../../core/services/tenant.service';
import { Tenant, SystemHealth } from '../../core/models/tenant.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatChipsModule,
    NavbarComponent,
    HealthBadgeComponent,
  ],
  template: `
    <app-navbar />
    <div class="page-container">
      <h1>Dashboard</h1>

      <div class="cards-grid">
        <!-- System Health -->
        <mat-card>
          <mat-card-header>
            <mat-icon mat-card-avatar>monitor_heart</mat-icon>
            <mat-card-title>System Health</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (healthLoading()) {
              <mat-spinner diameter="32"></mat-spinner>
            } @else if (health()) {
              <div class="health-items">
                <app-health-badge [healthy]="health()!.database === 'connected'" label="Database" />
                <app-health-badge [healthy]="health()!.redis === 'connected'" label="Redis" />
              </div>
              <p class="health-status">Status: <strong>{{ health()!.status }}</strong></p>
            } @else {
              <p class="error-text">Failed to load system health</p>
            }
          </mat-card-content>
          <mat-card-actions>
            <button mat-button (click)="loadHealth()">
              <mat-icon>refresh</mat-icon> Refresh
            </button>
          </mat-card-actions>
        </mat-card>

        <!-- Tenant Summary -->
        <mat-card>
          <mat-card-header>
            <mat-icon mat-card-avatar>business</mat-icon>
            <mat-card-title>Tenants</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (tenantsLoading()) {
              <mat-spinner diameter="32"></mat-spinner>
            } @else {
              <div class="stats">
                <div class="stat">
                  <span class="stat-number">{{ tenants().length }}</span>
                  <span class="stat-label">Total</span>
                </div>
                <div class="stat">
                  <span class="stat-number active">{{ activeTenants() }}</span>
                  <span class="stat-label">Active</span>
                </div>
                <div class="stat">
                  <span class="stat-number inactive">{{ tenants().length - activeTenants() }}</span>
                  <span class="stat-label">Inactive</span>
                </div>
              </div>
            }
          </mat-card-content>
          <mat-card-actions>
            <button mat-button routerLink="/tenants">
              <mat-icon>list</mat-icon> View All
            </button>
            <button mat-button routerLink="/tenants/new">
              <mat-icon>add</mat-icon> Add Tenant
            </button>
          </mat-card-actions>
        </mat-card>
      </div>

      <!-- Recent Tenants -->
      @if (tenants().length > 0) {
        <mat-card>
          <mat-card-header>
            <mat-card-title>Recent Tenants</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-list>
              @for (tenant of recentTenants(); track tenant.id) {
                <mat-list-item>
                  <mat-icon matListItemIcon>business</mat-icon>
                  <span matListItemTitle>{{ tenant.firm_name }}</span>
                  <span matListItemLine>
                    {{ tenant.slug }}
                    @if (tenant.viber_auth_token) { · Viber }
                    @if (tenant.telegram_bot_token) { · Telegram }
                  </span>
                  <div matListItemMeta>
                    <mat-chip-set>
                      <mat-chip [style.background-color]="tenant.status === 'active' ? '#4caf50' : '#9e9e9e'"
                                style="color: white; font-size: 12px">
                        {{ tenant.status }}
                      </mat-chip>
                    </mat-chip-set>
                    <button mat-icon-button [routerLink]="['/tenants', tenant.id]">
                      <mat-icon>arrow_forward</mat-icon>
                    </button>
                  </div>
                </mat-list-item>
              }
            </mat-list>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .health-items {
      display: flex;
      gap: 12px;
      margin: 16px 0;
    }
    .health-status { margin-top: 8px; color: #666; }
    .error-text { color: #f44336; }
    .stats {
      display: flex;
      gap: 32px;
      margin: 16px 0;
    }
    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .stat-number {
      font-size: 32px;
      font-weight: 500;
    }
    .stat-number.active { color: #4caf50; }
    .stat-number.inactive { color: #9e9e9e; }
    .stat-label {
      font-size: 14px;
      color: #666;
    }
  `],
})
export class DashboardComponent implements OnInit {
  private tenantService = inject(TenantService);

  health = signal<SystemHealth | null>(null);
  healthLoading = signal(true);
  tenants = signal<Tenant[]>([]);
  tenantsLoading = signal(true);

  activeTenants(): number {
    return this.tenants().filter(t => t.status === 'active').length;
  }

  recentTenants(): Tenant[] {
    return [...this.tenants()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }

  ngOnInit(): void {
    this.loadHealth();
    this.loadTenants();
  }

  loadHealth(): void {
    this.healthLoading.set(true);
    this.tenantService.getSystemHealth().subscribe({
      next: (h) => { this.health.set(h); this.healthLoading.set(false); },
      error: () => { this.health.set(null); this.healthLoading.set(false); },
    });
  }

  private loadTenants(): void {
    this.tenantsLoading.set(true);
    this.tenantService.getTenants().subscribe({
      next: (t) => { this.tenants.set(t); this.tenantsLoading.set(false); },
      error: () => { this.tenants.set([]); this.tenantsLoading.set(false); },
    });
  }
}

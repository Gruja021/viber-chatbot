import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { TenantService } from '../../core/services/tenant.service';
import { Tenant, TenantStatus } from '../../core/models/tenant.model';

@Component({
  selector: 'app-tenant-list',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSnackBarModule,
    NavbarComponent,
  ],
  template: `
    <app-navbar />
    <div class="page-container">
      <div class="header-row">
        <h1>Tenants</h1>
        <button mat-raised-button color="primary" routerLink="/tenants/new">
          <mat-icon>add</mat-icon> Add Tenant
        </button>
      </div>

      <mat-card>
        <mat-card-content>
          <div class="filter-row">
            <mat-form-field appearance="outline">
              <mat-label>Filter by status</mat-label>
              <mat-select [(ngModel)]="statusFilter" (selectionChange)="applyFilter()">
                <mat-option value="all">All</mat-option>
                <mat-option value="active">Active</mat-option>
                <mat-option value="inactive">Inactive</mat-option>
                <mat-option value="suspended">Suspended</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          @if (loading()) {
            <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
          } @else {
            <table mat-table [dataSource]="filteredTenants()" class="full-width">
              <ng-container matColumnDef="firm_name">
                <th mat-header-cell *matHeaderCellDef>Firm Name</th>
                <td mat-cell *matCellDef="let t">{{ t.firm_name }}</td>
              </ng-container>

              <ng-container matColumnDef="slug">
                <th mat-header-cell *matHeaderCellDef>Slug</th>
                <td mat-cell *matCellDef="let t">{{ t.slug }}</td>
              </ng-container>

              <ng-container matColumnDef="platforms">
                <th mat-header-cell *matHeaderCellDef>Platforms</th>
                <td mat-cell *matCellDef="let t">
                  @if (t.viber_auth_token) {
                    <mat-icon class="platform-icon viber" title="Viber">chat</mat-icon>
                  }
                  @if (t.telegram_bot_token) {
                    <mat-icon class="platform-icon telegram" title="Telegram">send</mat-icon>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let t">
                  <mat-chip-set>
                    <mat-chip [style.background-color]="getStatusColor(t.status)"
                              style="color: white; font-size: 12px">
                      {{ t.status }}
                    </mat-chip>
                  </mat-chip-set>
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Actions</th>
                <td mat-cell *matCellDef="let t">
                  <button mat-icon-button [routerLink]="['/tenants', t.id]" title="View">
                    <mat-icon>visibility</mat-icon>
                  </button>
                  <button mat-icon-button [routerLink]="['/tenants', t.id, 'edit']" title="Edit">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button mat-icon-button (click)="deactivate(t)" title="Deactivate"
                          [disabled]="t.status === 'inactive'">
                    <mat-icon>block</mat-icon>
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>

            @if (filteredTenants().length === 0) {
              <p class="empty-state">No tenants found.</p>
            }
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .filter-row { margin-bottom: 16px; }
    .center { display: flex; justify-content: center; padding: 32px; }
    .platform-icon { font-size: 20px; margin-right: 4px; }
    .platform-icon.viber { color: #7360f2; }
    .platform-icon.telegram { color: #0088cc; }
    .empty-state { text-align: center; color: #666; padding: 32px; }
    table { width: 100%; }
  `],
})
export class TenantListComponent implements OnInit {
  private tenantService = inject(TenantService);
  private snackBar = inject(MatSnackBar);

  tenants = signal<Tenant[]>([]);
  loading = signal(true);
  statusFilter = 'all';
  displayedColumns = ['firm_name', 'slug', 'platforms', 'status', 'actions'];

  filteredTenants(): Tenant[] {
    if (this.statusFilter === 'all') return this.tenants();
    return this.tenants().filter(t => t.status === this.statusFilter);
  }

  ngOnInit(): void {
    this.loadTenants();
  }

  applyFilter(): void {
    // Reactivity handled by filteredTenants() getter
  }

  getStatusColor(status: TenantStatus): string {
    switch (status) {
      case 'active': return '#4caf50';
      case 'inactive': return '#9e9e9e';
      case 'suspended': return '#ff9800';
    }
  }

  deactivate(tenant: Tenant): void {
    if (!confirm(`Deactivate ${tenant.firm_name}?`)) return;

    this.tenantService.deleteTenant(tenant.id).subscribe({
      next: () => {
        this.snackBar.open(`${tenant.firm_name} deactivated`, 'OK', { duration: 3000 });
        this.loadTenants();
      },
      error: () => {
        this.snackBar.open('Failed to deactivate tenant', 'OK', { duration: 3000 });
      },
    });
  }

  private loadTenants(): void {
    this.loading.set(true);
    this.tenantService.getTenants().subscribe({
      next: (t) => { this.tenants.set(t); this.loading.set(false); },
      error: () => { this.tenants.set([]); this.loading.set(false); },
    });
  }
}

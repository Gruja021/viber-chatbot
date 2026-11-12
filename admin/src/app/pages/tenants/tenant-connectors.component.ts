import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { ConnectorService } from '../../core/services/connector.service';
import { TenantConnector } from '../../core/models/tenant.model';

@Component({
  selector: 'app-tenant-connectors',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatChipsModule,
    NavbarComponent,
  ],
  template: `
    <app-navbar />
    <div class="page-container">
      <div class="header-row">
        <h1>Manage Data Sources</h1>
        <button mat-button [routerLink]="['/tenants', tenantId]">
          <mat-icon>arrow_back</mat-icon> Back to Tenant
        </button>
      </div>

      <!-- Add Connector Form -->
      <mat-card>
        <mat-card-header><mat-card-title>Add Data Source</mat-card-title></mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="addConnector()">
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Name</mat-label>
                <input matInput formControlName="name" placeholder="products">
                @if (form.get('name')?.hasError('required')) {
                  <mat-error>Name is required</mat-error>
                }
                @if (form.get('name')?.hasError('pattern')) {
                  <mat-error>Only lowercase letters, numbers, hyphens and underscores</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Database Type</mat-label>
                <mat-select formControlName="database_type">
                  <mat-option value="google_sheets">Google Sheets</mat-option>
                  <mat-option value="woocommerce">WooCommerce</mat-option>
                  <mat-option value="postgresql">PostgreSQL</mat-option>
                  <mat-option value="mysql">MySQL</mat-option>
                  <mat-option value="rest_api">REST API</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description</mat-label>
              <input matInput formControlName="description" placeholder="Product catalog from Google Sheets">
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Credentials (JSON)</mat-label>
              <textarea matInput formControlName="database_credentials" rows="4"
                        placeholder='{"spreadsheet_id": "...", "service_account_key": {...}}'></textarea>
              @if (form.get('database_credentials')?.hasError('required')) {
                <mat-error>Credentials are required</mat-error>
              }
            </mat-form-field>

            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Priority</mat-label>
                <input matInput formControlName="priority" type="number">
                <mat-hint>Lower number = higher priority</mat-hint>
              </mat-form-field>
            </div>

            <div class="form-actions">
              <button mat-raised-button color="primary" type="submit"
                      [disabled]="form.invalid || adding()">
                @if (adding()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  Add Data Source
                }
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Connectors Table -->
      <mat-card>
        <mat-card-header><mat-card-title>Data Sources</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (loading()) {
            <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
          } @else if (connectors().length === 0) {
            <p class="hint">No data sources configured yet.</p>
          } @else {
            <table mat-table [dataSource]="connectors()" class="full-width">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let c">{{ c.name }}</td>
              </ng-container>

              <ng-container matColumnDef="database_type">
                <th mat-header-cell *matHeaderCellDef>Type</th>
                <td mat-cell *matCellDef="let c">{{ c.database_type }}</td>
              </ng-container>

              <ng-container matColumnDef="description">
                <th mat-header-cell *matHeaderCellDef>Description</th>
                <td mat-cell *matCellDef="let c">{{ c.description || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="is_active">
                <th mat-header-cell *matHeaderCellDef>Active</th>
                <td mat-cell *matCellDef="let c">
                  <mat-icon [style.color]="c.is_active ? '#4caf50' : '#9e9e9e'">
                    {{ c.is_active ? 'check_circle' : 'cancel' }}
                  </mat-icon>
                </td>
              </ng-container>

              <ng-container matColumnDef="priority">
                <th mat-header-cell *matHeaderCellDef>Priority</th>
                <td mat-cell *matCellDef="let c">{{ c.priority }}</td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Actions</th>
                <td mat-cell *matCellDef="let c">
                  <button mat-icon-button (click)="testConnector(c)" [disabled]="testing()">
                    <mat-icon>play_arrow</mat-icon>
                  </button>
                  <button mat-icon-button (click)="toggleActive(c)">
                    <mat-icon>{{ c.is_active ? 'pause' : 'play_circle' }}</mat-icon>
                  </button>
                  <button mat-icon-button color="warn" (click)="deleteConnector(c)" [disabled]="deleting()">
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
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
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .form-actions {
      margin-top: 8px;
    }
    mat-card { margin-bottom: 16px; }
    .full-width { width: 100%; }
    .center { display: flex; justify-content: center; padding: 32px; }
    .hint { color: #999; font-style: italic; }
  `],
})
export class TenantConnectorsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private connectorService = inject(ConnectorService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  tenantId = '';
  connectors = signal<TenantConnector[]>([]);
  loading = signal(true);
  adding = signal(false);
  deleting = signal(false);
  testing = signal(false);
  displayedColumns = ['name', 'database_type', 'description', 'is_active', 'priority', 'actions'];

  form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],
    database_type: ['google_sheets', Validators.required],
    description: [''],
    database_credentials: ['', Validators.required],
    priority: [0],
  });

  ngOnInit(): void {
    this.tenantId = this.route.snapshot.paramMap.get('id') || '';
    if (this.tenantId) this.loadConnectors();
  }

  addConnector(): void {
    if (this.form.invalid) return;

    this.adding.set(true);
    const raw = this.form.getRawValue();

    this.connectorService.createConnector(this.tenantId, {
      name: raw.name,
      database_type: raw.database_type,
      description: raw.description || undefined,
      database_credentials: raw.database_credentials,
      priority: raw.priority ?? 0,
    }).subscribe({
      next: (connector) => {
        this.connectors.update(list => [...list, connector]);
        this.form.reset({ database_type: 'google_sheets', priority: 0 });
        this.adding.set(false);
        this.snackBar.open('Data source added successfully', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.adding.set(false);
        this.snackBar.open(err.error?.error || 'Failed to add data source', 'OK', { duration: 3000 });
      },
    });
  }

  deleteConnector(connector: TenantConnector): void {
    if (!confirm(`Delete data source "${connector.name}"?`)) return;

    this.deleting.set(true);
    this.connectorService.deleteConnector(this.tenantId, connector.id).subscribe({
      next: () => {
        this.connectors.update(list => list.filter(c => c.id !== connector.id));
        this.deleting.set(false);
        this.snackBar.open('Data source deleted', 'OK', { duration: 3000 });
      },
      error: () => {
        this.deleting.set(false);
        this.snackBar.open('Failed to delete data source', 'OK', { duration: 3000 });
      },
    });
  }

  testConnector(connector: TenantConnector): void {
    this.testing.set(true);
    this.connectorService.testConnector(this.tenantId, connector.id).subscribe({
      next: (result) => {
        this.testing.set(false);
        const icon = result.success ? 'OK' : 'FAIL';
        this.snackBar.open(`${icon}: ${result.detail}`, 'OK', { duration: 5000 });
      },
      error: () => {
        this.testing.set(false);
        this.snackBar.open('Connection test failed', 'OK', { duration: 3000 });
      },
    });
  }

  toggleActive(connector: TenantConnector): void {
    this.connectorService.updateConnector(this.tenantId, connector.id, {
      is_active: !connector.is_active,
    }).subscribe({
      next: (updated) => {
        this.connectors.update(list => list.map(c => c.id === updated.id ? updated : c));
        this.snackBar.open(
          `Data source ${updated.is_active ? 'activated' : 'deactivated'}`, 'OK', { duration: 3000 }
        );
      },
      error: () => {
        this.snackBar.open('Failed to update data source', 'OK', { duration: 3000 });
      },
    });
  }

  private loadConnectors(): void {
    this.loading.set(true);
    this.connectorService.getConnectors(this.tenantId).subscribe({
      next: (connectors) => {
        this.connectors.set(connectors);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Failed to load data sources', 'OK', { duration: 3000 });
      },
    });
  }
}

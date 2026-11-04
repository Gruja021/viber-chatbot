import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { AgentService } from '../../core/services/agent.service';
import { ChatwootAgent } from '../../core/models/tenant.model';

@Component({
  selector: 'app-tenant-agents',
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
    MatProgressSpinnerModule,
    MatSnackBarModule,
    NavbarComponent,
  ],
  template: `
    <app-navbar />
    <div class="page-container">
      <div class="header-row">
        <h1>Manage Agents</h1>
        <button mat-button [routerLink]="['/tenants', tenantId]">
          <mat-icon>arrow_back</mat-icon> Back to Tenant
        </button>
      </div>

      <!-- Add Agent Form -->
      <mat-card>
        <mat-card-header><mat-card-title>Add Agent</mat-card-title></mat-card-header>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="addAgent()" class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" placeholder="Agent name">
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput formControlName="email" placeholder="agent@company.com" type="email">
            </mat-form-field>
            <button mat-raised-button color="primary" type="submit"
                    [disabled]="form.invalid || adding()">
              @if (adding()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                Add Agent
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      <!-- Agents Table -->
      <mat-card>
        <mat-card-header><mat-card-title>Inbox Agents</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (loading()) {
            <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
          } @else if (agents().length === 0) {
            <p class="hint">No agents assigned to this inbox yet.</p>
          } @else {
            <table mat-table [dataSource]="agents()" class="full-width">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let agent">{{ agent.name }}</td>
              </ng-container>

              <ng-container matColumnDef="email">
                <th mat-header-cell *matHeaderCellDef>Email</th>
                <td mat-cell *matCellDef="let agent">{{ agent.email }}</td>
              </ng-container>

              <ng-container matColumnDef="role">
                <th mat-header-cell *matHeaderCellDef>Role</th>
                <td mat-cell *matCellDef="let agent">{{ agent.role }}</td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Actions</th>
                <td mat-cell *matCellDef="let agent">
                  <button mat-icon-button color="warn" (click)="removeAgent(agent)"
                          [disabled]="removing()">
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
    .form-row {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    .form-row button { margin-top: 8px; }
    mat-card { margin-bottom: 16px; }
    .full-width { width: 100%; }
    .center { display: flex; justify-content: center; padding: 32px; }
    .hint { color: #999; font-style: italic; }
  `],
})
export class TenantAgentsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private agentService = inject(AgentService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  tenantId = '';
  agents = signal<ChatwootAgent[]>([]);
  loading = signal(true);
  adding = signal(false);
  removing = signal(false);
  displayedColumns = ['name', 'email', 'role', 'actions'];

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    this.tenantId = this.route.snapshot.paramMap.get('id') || '';
    if (this.tenantId) this.loadAgents();
  }

  addAgent(): void {
    if (this.form.invalid) return;

    this.adding.set(true);
    const { name, email } = this.form.getRawValue();

    this.agentService.addAgent(this.tenantId, name, email).subscribe({
      next: (agent) => {
        this.agents.update(list => [...list, agent]);
        this.form.reset();
        this.adding.set(false);
        this.snackBar.open('Agent added successfully', 'OK', { duration: 3000 });
      },
      error: () => {
        this.adding.set(false);
        this.snackBar.open('Failed to add agent', 'OK', { duration: 3000 });
      },
    });
  }

  removeAgent(agent: ChatwootAgent): void {
    if (!confirm(`Remove ${agent.name} from inbox?`)) return;

    this.removing.set(true);
    this.agentService.removeAgent(this.tenantId, agent.id).subscribe({
      next: () => {
        this.agents.update(list => list.filter(a => a.id !== agent.id));
        this.removing.set(false);
        this.snackBar.open('Agent removed', 'OK', { duration: 3000 });
      },
      error: () => {
        this.removing.set(false);
        this.snackBar.open('Failed to remove agent', 'OK', { duration: 3000 });
      },
    });
  }

  private loadAgents(): void {
    this.loading.set(true);
    this.agentService.getAgents(this.tenantId).subscribe({
      next: (agents) => {
        this.agents.set(agents);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Failed to load agents', 'OK', { duration: 3000 });
      },
    });
  }
}

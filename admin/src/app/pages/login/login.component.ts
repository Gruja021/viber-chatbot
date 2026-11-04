import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';
import { TenantService } from '../../core/services/tenant.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="login-wrapper">
      <mat-card class="login-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>admin_panel_settings</mat-icon>
          <mat-card-title>Admin Dashboard</mat-card-title>
          <mat-card-subtitle>Enter your API token to continue</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <form (ngSubmit)="onLogin()">
            <mat-form-field class="full-width" appearance="outline">
              <mat-label>API Token</mat-label>
              <input matInput
                     [(ngModel)]="token"
                     name="token"
                     type="password"
                     placeholder="Enter ADMIN_API_TOKEN"
                     required>
              <mat-icon matSuffix>vpn_key</mat-icon>
            </mat-form-field>

            @if (error()) {
              <p class="error-text">{{ error() }}</p>
            }

            <button mat-raised-button
                    color="primary"
                    type="submit"
                    class="full-width"
                    [disabled]="loading() || !token">
              @if (loading()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                Login
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #3f51b5 0%, #1a237e 100%);
    }
    .login-card {
      width: 400px;
      padding: 24px;
    }
    mat-card-header { margin-bottom: 24px; }
    .error-text {
      color: #f44336;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .full-width { width: 100%; }
    button mat-spinner { display: inline-block; }
  `],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private tenantService = inject(TenantService);
  private router = inject(Router);

  token = '';
  loading = signal(false);
  error = signal('');

  onLogin(): void {
    if (!this.token) return;

    this.loading.set(true);
    this.error.set('');

    // Temporarily set token to test it
    this.auth.login(this.token);

    this.tenantService.getTenants().subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.loading.set(false);
        this.auth.logout();
        this.error.set('Invalid API token. Please check and try again.');
      },
    });
  }
}

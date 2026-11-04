import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, MatToolbarModule, MatButtonModule, MatIconModule],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button routerLink="/dashboard">
        <mat-icon>admin_panel_settings</mat-icon>
      </button>
      <span routerLink="/dashboard" style="cursor: pointer">Admin Dashboard</span>
      <span class="spacer"></span>
      <button mat-button routerLink="/dashboard">
        <mat-icon>dashboard</mat-icon> Dashboard
      </button>
      <button mat-button routerLink="/tenants">
        <mat-icon>business</mat-icon> Tenants
      </button>
      <button mat-button (click)="logout()">
        <mat-icon>logout</mat-icon> Logout
      </button>
    </mat-toolbar>
  `,
  styles: [`
    .spacer { flex: 1 1 auto; }
    mat-toolbar { position: sticky; top: 0; z-index: 1000; }
    button mat-icon { margin-right: 4px; }
  `],
})
export class NavbarComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}

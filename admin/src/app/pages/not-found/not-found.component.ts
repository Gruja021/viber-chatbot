import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <div class="not-found">
      <mat-icon style="font-size: 64px; width: 64px; height: 64px; color: #9e9e9e">
        search_off
      </mat-icon>
      <h1>404 - Page Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <button mat-raised-button color="primary" routerLink="/dashboard">
        <mat-icon>home</mat-icon> Go to Dashboard
      </button>
    </div>
  `,
  styles: [`
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    h1 { color: #333; margin: 16px 0 8px; }
    p { color: #666; margin-bottom: 24px; }
  `],
})
export class NotFoundComponent {}

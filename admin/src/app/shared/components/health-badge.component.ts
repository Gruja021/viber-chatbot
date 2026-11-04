import { Component, Input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-health-badge',
  standalone: true,
  imports: [MatChipsModule, MatIconModule],
  template: `
    <mat-chip-set>
      <mat-chip [highlighted]="healthy"
                [style.background-color]="healthy ? '#4caf50' : '#f44336'"
                style="color: white">
        <mat-icon matChipAvatar>{{ healthy ? 'check_circle' : 'error' }}</mat-icon>
        {{ label }}
      </mat-chip>
    </mat-chip-set>
  `,
})
export class HealthBadgeComponent {
  @Input() healthy = false;
  @Input() label = '';
}

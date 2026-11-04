import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { TenantService } from '../../core/services/tenant.service';
import { DayOfWeek } from '../../core/models/tenant.model';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatChipInputEvent } from '@angular/material/chips';

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

@Component({
  selector: 'app-tenant-form',
  standalone: true,
  imports: [
    RouterLink,
    TitleCasePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
    NavbarComponent,
  ],
  template: `
    <app-navbar />
    <div class="page-container">
      <h1>{{ isEdit() ? 'Edit Tenant' : 'Create Tenant' }}</h1>

      @if (formLoading()) {
        <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <!-- Basic Info -->
          <mat-card>
            <mat-card-header><mat-card-title>Basic Information</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Slug</mat-label>
                  <input matInput formControlName="slug" placeholder="my-company">
                  @if (form.get('slug')?.hasError('required')) {
                    <mat-error>Slug is required</mat-error>
                  }
                  @if (form.get('slug')?.hasError('pattern')) {
                    <mat-error>Only lowercase letters, numbers, and hyphens</mat-error>
                  }
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Firm Name</mat-label>
                  <input matInput formControlName="firm_name" placeholder="My Company">
                  @if (form.get('firm_name')?.hasError('required')) {
                    <mat-error>Firm name is required</mat-error>
                  }
                </mat-form-field>
              </div>

              @if (isEdit()) {
                <mat-form-field appearance="outline">
                  <mat-label>Status</mat-label>
                  <mat-select formControlName="status">
                    <mat-option value="active">Active</mat-option>
                    <mat-option value="inactive">Inactive</mat-option>
                    <mat-option value="suspended">Suspended</mat-option>
                  </mat-select>
                </mat-form-field>
              }
            </mat-card-content>
          </mat-card>

          <!-- Platform Tokens -->
          <mat-card>
            <mat-card-header><mat-card-title>Platform Tokens</mat-card-title></mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Viber Auth Token</mat-label>
                <input matInput formControlName="viber_auth_token" type="password">
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Telegram Bot Token</mat-label>
                <input matInput formControlName="telegram_bot_token" type="password">
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <!-- AI Configuration -->
          <mat-card>
            <mat-card-header><mat-card-title>AI Configuration</mat-card-title></mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>System Prompt</mat-label>
                <textarea matInput formControlName="system_prompt" rows="6"
                          placeholder="You are a helpful assistant for..."></textarea>
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <!-- Database -->
          <mat-card>
            <mat-card-header><mat-card-title>Data Source</mat-card-title></mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Database Type</mat-label>
                <mat-select formControlName="database_type">
                  <mat-option [value]="null">None</mat-option>
                  <mat-option value="google_sheets">Google Sheets</mat-option>
                  <mat-option value="woocommerce">WooCommerce</mat-option>
                  <mat-option value="postgresql">PostgreSQL</mat-option>
                  <mat-option value="mysql">MySQL</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Database Credentials (JSON)</mat-label>
                <textarea matInput formControlName="database_credentials" rows="4"
                          placeholder='{"spreadsheet_id": "...", "range": "Sheet1!A:Z"}'></textarea>
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <!-- CRM -->
          <mat-card>
            <mat-card-header><mat-card-title>Chatwoot CRM</mat-card-title></mat-card-header>
            <mat-card-content>
              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Account ID</mat-label>
                  <input matInput formControlName="chatwoot_account_id" type="number">
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Inbox ID</mat-label>
                  <input matInput formControlName="chatwoot_inbox_id" type="number">
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>API Token</mat-label>
                <input matInput formControlName="chatwoot_api_token" type="password">
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <!-- Working Hours -->
          <mat-card>
            <mat-card-header><mat-card-title>Working Hours</mat-card-title></mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Timezone</mat-label>
                <input matInput formControlName="timezone" placeholder="Europe/Belgrade">
              </mat-form-field>

              <div formGroupName="working_hours">
                @for (day of days; track day) {
                  <div class="day-row" [formGroupName]="day">
                    <mat-checkbox [checked]="isDayEnabled(day)" (change)="toggleDay(day, $event.checked)">
                      {{ day | titlecase }}
                    </mat-checkbox>
                    @if (isDayEnabled(day)) {
                      <mat-form-field appearance="outline" class="time-field">
                        <mat-label>Start</mat-label>
                        <input matInput formControlName="start" placeholder="09:00">
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="time-field">
                        <mat-label>End</mat-label>
                        <input matInput formControlName="end" placeholder="17:00">
                      </mat-form-field>
                    }
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>

          <!-- Handover Keywords -->
          <mat-card>
            <mat-card-header><mat-card-title>Handover Keywords</mat-card-title></mat-card-header>
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Keywords (press Enter to add)</mat-label>
                <mat-chip-grid #chipGrid>
                  @for (keyword of handoverKeywords; track keyword) {
                    <mat-chip-row (removed)="removeKeyword(keyword)">
                      {{ keyword }}
                      <button matChipRemove><mat-icon>cancel</mat-icon></button>
                    </mat-chip-row>
                  }
                </mat-chip-grid>
                <input matInput
                       [matChipInputFor]="chipGrid"
                       [matChipInputSeparatorKeyCodes]="separatorKeyCodes"
                       (matChipInputTokenEnd)="addKeyword($event)">
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <!-- Actions -->
          <div class="actions">
            <button mat-button routerLink="/tenants">Cancel</button>
            <button mat-raised-button color="primary" type="submit"
                    [disabled]="form.invalid || saving()">
              @if (saving()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                {{ isEdit() ? 'Update' : 'Create' }}
              }
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    mat-card { margin-bottom: 16px; }
    .full-width { width: 100%; }
    .day-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 8px;
    }
    .day-row mat-checkbox { min-width: 120px; }
    .time-field { width: 120px; }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin: 16px 0;
    }
    .center { display: flex; justify-content: center; padding: 32px; }
  `],
})
export class TenantFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tenantService = inject(TenantService);
  private snackBar = inject(MatSnackBar);

  isEdit = signal(false);
  formLoading = signal(false);
  saving = signal(false);
  tenantId = '';
  handoverKeywords: string[] = [];
  separatorKeyCodes = [ENTER, COMMA];
  days = DAYS;

  form: FormGroup = this.fb.group({
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    firm_name: ['', Validators.required],
    status: ['active'],
    viber_auth_token: [''],
    telegram_bot_token: [''],
    system_prompt: [''],
    database_type: [null],
    database_credentials: [''],
    chatwoot_account_id: [null],
    chatwoot_inbox_id: [null],
    chatwoot_api_token: [''],
    timezone: ['Europe/Belgrade'],
    working_hours: this.fb.group(
      DAYS.reduce((acc, day) => {
        acc[day] = this.fb.group({ start: [''], end: [''] });
        return acc;
      }, {} as Record<string, FormGroup>)
    ),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.tenantId = id;
      this.loadTenant(id);
    }
  }

  isDayEnabled(day: DayOfWeek): boolean {
    const group = this.form.get(['working_hours', day]) as FormGroup;
    return !!(group.get('start')?.value || group.get('end')?.value);
  }

  toggleDay(day: DayOfWeek, enabled: boolean): void {
    const group = this.form.get(['working_hours', day]) as FormGroup;
    if (enabled) {
      group.patchValue({ start: '09:00', end: '17:00' });
    } else {
      group.patchValue({ start: '', end: '' });
    }
  }

  addKeyword(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value && !this.handoverKeywords.includes(value)) {
      this.handoverKeywords.push(value);
    }
    event.chipInput.clear();
  }

  removeKeyword(keyword: string): void {
    this.handoverKeywords = this.handoverKeywords.filter(k => k !== keyword);
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.saving.set(true);
    const raw = this.form.getRawValue();

    // Build working_hours — only include days with values
    const workingHours: Record<string, { start: string; end: string }> = {};
    for (const day of DAYS) {
      if (raw.working_hours[day].start && raw.working_hours[day].end) {
        workingHours[day] = raw.working_hours[day];
      }
    }

    const payload: Record<string, unknown> = {
      slug: raw.slug,
      firm_name: raw.firm_name,
      system_prompt: raw.system_prompt || undefined,
      database_type: raw.database_type || undefined,
      database_credentials: raw.database_credentials || undefined,
      viber_auth_token: raw.viber_auth_token || undefined,
      telegram_bot_token: raw.telegram_bot_token || undefined,
      chatwoot_account_id: raw.chatwoot_account_id || undefined,
      chatwoot_inbox_id: raw.chatwoot_inbox_id || undefined,
      chatwoot_api_token: raw.chatwoot_api_token || undefined,
      timezone: raw.timezone || undefined,
      working_hours: Object.keys(workingHours).length ? workingHours : undefined,
      handover_keywords: this.handoverKeywords.length ? this.handoverKeywords : undefined,
    };

    // Remove undefined values
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    if (this.isEdit()) {
      if (raw.status) payload['status'] = raw.status;
      this.tenantService.updateTenant(this.tenantId, payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.snackBar.open('Tenant updated successfully', 'OK', { duration: 3000 });
          this.router.navigate(['/tenants', this.tenantId]);
        },
        error: (err) => {
          this.saving.set(false);
          this.snackBar.open(err.error?.error || 'Failed to update tenant', 'OK', { duration: 5000 });
        },
      });
    } else {
      this.tenantService.createTenant(payload as any).subscribe({
        next: (tenant) => {
          this.saving.set(false);
          this.snackBar.open('Tenant created successfully', 'OK', { duration: 3000 });
          this.router.navigate(['/tenants', tenant.id]);
        },
        error: (err) => {
          this.saving.set(false);
          this.snackBar.open(err.error?.error || 'Failed to create tenant', 'OK', { duration: 5000 });
        },
      });
    }
  }

  private loadTenant(id: string): void {
    this.formLoading.set(true);
    this.tenantService.getTenant(id).subscribe({
      next: (t) => {
        this.form.patchValue({
          slug: t.slug,
          firm_name: t.firm_name,
          status: t.status,
          viber_auth_token: t.viber_auth_token || '',
          telegram_bot_token: t.telegram_bot_token || '',
          system_prompt: t.system_prompt || '',
          database_type: t.database_type,
          database_credentials: t.database_credentials || '',
          chatwoot_account_id: t.chatwoot_account_id,
          chatwoot_inbox_id: t.chatwoot_inbox_id,
          chatwoot_api_token: t.chatwoot_api_token || '',
          timezone: t.timezone || 'Europe/Belgrade',
        });

        // Patch working hours
        if (t.working_hours) {
          for (const day of DAYS) {
            const schedule = t.working_hours[day];
            if (schedule) {
              (this.form.get(['working_hours', day]) as FormGroup).patchValue(schedule);
            }
          }
        }

        this.handoverKeywords = t.handover_keywords || [];
        this.formLoading.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to load tenant', 'OK', { duration: 3000 });
        this.router.navigate(['/tenants']);
      },
    });
  }
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { HealthBadgeComponent } from './health-badge.component';

describe('HealthBadgeComponent', () => {
  let component: HealthBadgeComponent;
  let fixture: ComponentFixture<HealthBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HealthBadgeComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(HealthBadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default healthy to false', () => {
    expect(component.healthy).toBeFalse();
  });

  it('should default label to empty string', () => {
    expect(component.label).toBe('');
  });

  it('should accept healthy input', () => {
    component.healthy = true;
    fixture.detectChanges();
    expect(component.healthy).toBeTrue();
  });

  it('should accept label input', () => {
    component.label = 'Database';
    fixture.detectChanges();
    expect(component.label).toBe('Database');
  });
});

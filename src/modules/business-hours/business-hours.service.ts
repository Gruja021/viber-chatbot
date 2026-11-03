import { Tenant, DayOfWeek } from '../tenant/tenant.model';

const DAY_NAMES: DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/**
 * Check if the current time is within the tenant's configured working hours.
 * Returns false if working_hours is empty (backward-compatible: AI always on).
 */
export function isWithinWorkingHours(tenant: Tenant, now?: Date): boolean {
  const workingHours = tenant.working_hours;
  if (!workingHours || Object.keys(workingHours).length === 0) {
    return false;
  }

  const currentTime = now || new Date();

  // Convert to tenant's timezone using Intl.DateTimeFormat
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tenant.timezone || 'Europe/Belgrade',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(currentTime);
  const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() as DayOfWeek | undefined;
  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';

  if (!weekday) return false;

  const daySchedule = workingHours[weekday];
  if (!daySchedule) return false;

  const currentMinutes = parseInt(hour, 10) * 60 + parseInt(minute, 10);
  const startMinutes = parseTimeToMinutes(daySchedule.start);
  const endMinutes = parseTimeToMinutes(daySchedule.end);

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Strip diacritics from text for fuzzy matching.
 * "želim" → "zelim", "čovek" → "covek"
 */
function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check if the user's message matches any handover keyword.
 * Case-insensitive, diacritics-insensitive matching.
 */
export function matchesHandoverKeyword(text: string, keywords: string[]): boolean {
  const normalizedText = stripDiacritics(text.toLowerCase().trim());

  return keywords.some(keyword => {
    const normalizedKeyword = stripDiacritics(keyword.toLowerCase().trim());
    return normalizedText.includes(normalizedKeyword);
  });
}

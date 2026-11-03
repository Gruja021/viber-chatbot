import { isWithinWorkingHours, matchesHandoverKeyword } from '../business-hours.service';
import { Tenant, WorkingHours } from '../../tenant/tenant.model';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-1',
    slug: 'test',
    firm_name: 'Test',
    viber_auth_token: 'vtoken',
    database_type: null,
    database_credentials: null,
    system_prompt: 'You are helpful.',
    chatwoot_account_id: null,
    chatwoot_inbox_id: null,
    chatwoot_api_token: null,
    timezone: 'Europe/Belgrade',
    working_hours: {},
    handover_keywords: [],
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Tenant;
}

describe('business-hours.service', () => {
  describe('isWithinWorkingHours', () => {
    it('returns false when working_hours is empty (backward-compatible)', () => {
      const tenant = makeTenant({ working_hours: {} });
      expect(isWithinWorkingHours(tenant)).toBe(false);
    });

    it('returns true when current time is within working hours', () => {
      // Create a date that's Monday 10:00 in Europe/Belgrade (UTC+1/+2)
      // We need to find a time that maps to Monday 10:00 in Belgrade
      const workingHours: WorkingHours = {
        monday: { start: '09:00', end: '17:00' },
      };
      const tenant = makeTenant({ working_hours: workingHours, timezone: 'Europe/Belgrade' });

      // January 6, 2025 is a Monday. 10:00 Belgrade = 09:00 UTC (CET = UTC+1 in winter)
      const mondayMorning = new Date('2025-01-06T09:00:00Z');
      expect(isWithinWorkingHours(tenant, mondayMorning)).toBe(true);
    });

    it('returns false when current time is outside working hours', () => {
      const workingHours: WorkingHours = {
        monday: { start: '09:00', end: '17:00' },
      };
      const tenant = makeTenant({ working_hours: workingHours, timezone: 'Europe/Belgrade' });

      // Monday 20:00 Belgrade = 19:00 UTC
      const mondayEvening = new Date('2025-01-06T19:00:00Z');
      expect(isWithinWorkingHours(tenant, mondayEvening)).toBe(false);
    });

    it('returns false when day is not configured', () => {
      const workingHours: WorkingHours = {
        monday: { start: '09:00', end: '17:00' },
      };
      const tenant = makeTenant({ working_hours: workingHours, timezone: 'Europe/Belgrade' });

      // January 7, 2025 is a Tuesday
      const tuesday = new Date('2025-01-07T10:00:00Z');
      expect(isWithinWorkingHours(tenant, tuesday)).toBe(false);
    });

    it('returns false at exact end time (end is exclusive)', () => {
      const workingHours: WorkingHours = {
        monday: { start: '09:00', end: '17:00' },
      };
      const tenant = makeTenant({ working_hours: workingHours, timezone: 'Europe/Belgrade' });

      // Monday 17:00 Belgrade = 16:00 UTC
      const mondayEnd = new Date('2025-01-06T16:00:00Z');
      expect(isWithinWorkingHours(tenant, mondayEnd)).toBe(false);
    });

    it('returns true at exact start time (start is inclusive)', () => {
      const workingHours: WorkingHours = {
        monday: { start: '09:00', end: '17:00' },
      };
      const tenant = makeTenant({ working_hours: workingHours, timezone: 'Europe/Belgrade' });

      // Monday 09:00 Belgrade = 08:00 UTC
      const mondayStart = new Date('2025-01-06T08:00:00Z');
      expect(isWithinWorkingHours(tenant, mondayStart)).toBe(true);
    });

    it('handles different timezone correctly', () => {
      const workingHours: WorkingHours = {
        monday: { start: '09:00', end: '17:00' },
      };
      const tenant = makeTenant({ working_hours: workingHours, timezone: 'America/New_York' });

      // Monday 10:00 New York = 15:00 UTC (EST = UTC-5 in winter)
      const mondayNY = new Date('2025-01-06T15:00:00Z');
      expect(isWithinWorkingHours(tenant, mondayNY)).toBe(true);

      // Monday 08:00 New York = 13:00 UTC — before working hours
      const earlyNY = new Date('2025-01-06T13:00:00Z');
      expect(isWithinWorkingHours(tenant, earlyNY)).toBe(false);
    });

    it('handles weekend schedule', () => {
      const workingHours: WorkingHours = {
        saturday: { start: '10:00', end: '14:00' },
      };
      const tenant = makeTenant({ working_hours: workingHours, timezone: 'Europe/Belgrade' });

      // January 11, 2025 is a Saturday. 11:00 Belgrade = 10:00 UTC
      const saturdayMorning = new Date('2025-01-11T10:00:00Z');
      expect(isWithinWorkingHours(tenant, saturdayMorning)).toBe(true);
    });
  });

  describe('matchesHandoverKeyword', () => {
    const defaultKeywords = [
      'zelim da pricam sa covekom',
      'hocu operatera',
      'agent',
      'covek',
      'operater',
    ];

    it('matches exact keyword', () => {
      expect(matchesHandoverKeyword('agent', defaultKeywords)).toBe(true);
    });

    it('matches keyword case-insensitively', () => {
      expect(matchesHandoverKeyword('AGENT', defaultKeywords)).toBe(true);
      expect(matchesHandoverKeyword('Agent', defaultKeywords)).toBe(true);
    });

    it('matches keyword with diacritics stripped', () => {
      expect(matchesHandoverKeyword('želim da pričam sa čovekom', defaultKeywords)).toBe(true);
    });

    it('matches keyword as substring', () => {
      expect(matchesHandoverKeyword('ja hocu operatera molim vas', defaultKeywords)).toBe(true);
    });

    it('does not match unrelated text', () => {
      expect(matchesHandoverKeyword('koliko kosta proizvod?', defaultKeywords)).toBe(false);
    });

    it('matches with mixed case and diacritics', () => {
      expect(matchesHandoverKeyword('Želim da pričam sa čovekom!', defaultKeywords)).toBe(true);
    });

    it('returns false for empty keywords array', () => {
      expect(matchesHandoverKeyword('agent', [])).toBe(false);
    });

    it('returns false for empty text', () => {
      expect(matchesHandoverKeyword('', defaultKeywords)).toBe(false);
    });

    it('handles text with extra whitespace', () => {
      expect(matchesHandoverKeyword('  agent  ', defaultKeywords)).toBe(true);
    });
  });
});

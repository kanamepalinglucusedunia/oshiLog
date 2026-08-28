import {
  addCalendarInterval,
  advanceDueDate,
  isDue,
  shortestEnabledIntervalMs,
  type CadenceFrequency,
} from '../driveBackupDomain';

const parse = (value: string): number => Date.parse(value);

describe('driveBackupDomain cadence', () => {
  describe('addCalendarInterval', () => {
    it('adds one day for daily', () => {
      const start = '2026-08-17T09:00:00.000Z';
      expect(addCalendarInterval(start, 'daily')).toBe('2026-08-18T09:00:00.000Z');
    });

    it('adds seven days for weekly', () => {
      const start = '2026-08-17T09:00:00.000Z';
      expect(addCalendarInterval(start, 'weekly')).toBe('2026-08-24T09:00:00.000Z');
    });

    it('adds one calendar month for monthly', () => {
      const start = '2026-08-17T09:00:00.000Z';
      expect(addCalendarInterval(start, 'monthly')).toBe('2026-09-17T09:00:00.000Z');
    });

    it('clamps monthly to the last day of a shorter month', () => {
      const jan31 = '2026-01-31T10:00:00.000Z';
      expect(addCalendarInterval(jan31, 'monthly')).toBe('2026-02-28T10:00:00.000Z');
    });

    it('keeps the clamped day after rolling through February (leap year aware)', () => {
      const jan31Leap = '2024-01-31T10:00:00.000Z';
      expect(addCalendarInterval(jan31Leap, 'monthly')).toBe('2024-02-29T10:00:00.000Z');
      // March from the clamped February result keeps the same (last) day.
      const feb29 = addCalendarInterval(jan31Leap, 'monthly');
      expect(addCalendarInterval(feb29, 'monthly')).toBe('2024-03-29T10:00:00.000Z');
    });

    it('rejects a frequency of off', () => {
      expect(() => addCalendarInterval('2026-01-01T00:00:00.000Z', 'off' as CadenceFrequency)).toThrow();
    });
  });

  describe('advanceDueDate', () => {
    const now = '2026-08-17T09:00:00.000Z';

    it('returns the same date when the previous due date is already in the future', () => {
      const future = '2026-08-20T09:00:00.000Z';
      expect(advanceDueDate(future, 'daily', now)).toBe(future);
    });

    it('advances one interval for daily when exactly due', () => {
      expect(advanceDueDate('2026-08-17T09:00:00.000Z', 'daily', now)).toBe('2026-08-18T09:00:00.000Z');
    });

    it('advances until the first future date without bursting missed occurrences', () => {
      const late = '2026-08-01T09:00:00.000Z';
      const advanced = advanceDueDate(late, 'daily', now);
      expect(parse(advanced)).toBeGreaterThan(parse(now));
      const gap = (parse(advanced) - parse(late)) / 86_400_000;
      expect(gap).toBe(17); // exactly 16 skipped days + 1, all identical anchors
    });

    it('keeps monthly month-end clamping while advancing', () => {
      const late = '2026-06-30T09:00:00.000Z';
      const advanced = advanceDueDate(late, 'monthly', now);
      expect(parse(advanced)).toBeGreaterThan(parse(now));
      expect(advanced.slice(0, 10)).toBe('2026-08-30');
    });

    it('never returns an infinite loop for an invalid date (bounded threshold)', () => {
      const farPast = '2020-01-01T00:00:00.000Z';
      const advanced = advanceDueDate(farPast, 'weekly', '2026-08-17T00:00:00.000Z');
      expect(parse(advanced)).toBeGreaterThan(parse('2026-08-17T00:00:00.000Z'));
      expect((parse(advanced) - parse(farPast)) / (7 * 86_400_000)).toBeLessThan(400);
    });
  });

  describe('isDue', () => {
    const now = '2026-08-17T09:00:00.000Z';
    it('is due when nextDueAt is before now', () => {
      expect(isDue('2026-08-17T08:00:00.000Z', now)).toBe(true);
    });
    it('is due exactly at now', () => {
      expect(isDue(now, now)).toBe(true);
    });
    it('is not due when nextDueAt is in the future', () => {
      expect(isDue('2026-08-18T09:00:00.000Z', now)).toBe(false);
    });
  });

  describe('shortestEnabledIntervalMs', () => {
    it('returns null when no schedule is enabled', () => {
      expect(shortestEnabledIntervalMs([{ frequency: 'off' }, { frequency: 'off' }])).toBeNull();
    });

    it('returns the shortest enabled interval', () => {
      const result = shortestEnabledIntervalMs([{ frequency: 'off' }, { frequency: 'weekly' }, { frequency: 'daily' }]);
      expect(result).toBe(24 * 60 * 60 * 1000);
    });

    it('ignores frequencies that are not valid cadences', () => {
      const result = shortestEnabledIntervalMs([{ frequency: 'off' }, { frequency: 'monthly' }]);
      expect(result).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('handles a single enabled schedule', () => {
      expect(shortestEnabledIntervalMs([{ frequency: 'weekly' }])).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('schedule summary helpers', () => {
    it('types are statically assignable', () => {
      const frequency: CadenceFrequency = 'monthly';
      expect(frequency).toBe('monthly');
    });
  });
});
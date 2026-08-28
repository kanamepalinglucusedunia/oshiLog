import { toISODate, todayISO, isValidISODate, compareISODate, formatISODate, formatISODateFull, formatISOMonth } from '../date';

describe('date utils', () => {
  it('converts Date to ISO local date', () => {
    expect(toISODate(new Date(2026, 7, 8))).toBe('2026-08-08');
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('todayISO returns a valid ISO date', () => {
    expect(isValidISODate(todayISO())).toBe(true);
  });

  it('validates ISO dates strictly', () => {
    expect(isValidISODate('2026-08-08')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('08/08/2026')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('compares ISO dates lexicographically', () => {
    expect(compareISODate('2026-01-01', '2026-02-01')).toBe(-1);
    expect(compareISODate('2026-02-01', '2026-01-01')).toBe(1);
    expect(compareISODate('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('formats dates for display', () => {
    expect(formatISODate('2026-08-08')).toBe('Aug 8, 2026');
    expect(formatISODate('2026-01-05')).toBe('Jan 5, 2026');
    expect(formatISODateFull('2025-04-18')).toBe('18 April 2025');
    expect(formatISOMonth('2026-08-08')).toBe('Aug 2026');
  });
});

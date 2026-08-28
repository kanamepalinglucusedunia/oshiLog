import { matchesEventMonthYear } from '@/services/mainListFilter';

describe('main list filtering', () => {
  it('matches every event when month and year are not selected', () => {
    expect(matchesEventMonthYear('2026-08-12', 'all', 'all')).toBe(true);
  });

  it('supports independent month and year filters', () => {
    expect(matchesEventMonthYear('2026-08-12', '08', 'all')).toBe(true);
    expect(matchesEventMonthYear('2026-08-12', 'all', '2026')).toBe(true);
    expect(matchesEventMonthYear('2026-08-12', '08', '2026')).toBe(true);
    expect(matchesEventMonthYear('2026-07-12', '08', '2026')).toBe(false);
    expect(matchesEventMonthYear('2025-08-12', '08', '2026')).toBe(false);
  });

  it('rejects malformed event dates when a date filter is active', () => {
    expect(matchesEventMonthYear('invalid', '08', 'all')).toBe(false);
  });
});

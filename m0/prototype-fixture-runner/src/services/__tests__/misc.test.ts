import { totalsToSortedList } from '../aggregation';
import { parseMinorUnits } from '@/utils/money';
import { buildTheme } from '@/design-system/resolveTheme';

describe('totalsToSortedList', () => {
  it('sorts non-zero totals by currency and formats them', () => {
    const list = totalsToSortedList({ JPY: 5000, IDR: 0, MYR: 1250, KRW: 0, THB: 0 });
    expect(list.map((t) => t.currency)).toEqual(['JPY', 'MYR']);
    expect(list[1].formatted).toBe('12.50');
  });

  it('returns an empty list when everything is zero', () => {
    expect(totalsToSortedList({ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 })).toEqual([]);
  });
});

describe('shared money parser', () => {
  it('exposes parseMinorUnits for reuse', () => {
    expect(parseMinorUnits('1,000', 'JPY')).toBe(1000);
  });
});

describe('buildTheme', () => {
  it('builds outline surface tokens with full borders', () => {
    const theme = buildTheme('outline', '#7F6EB5');
    expect(theme.surface.style).toBe('outline');
    expect(theme.surface.borderWidth).toBe(1);
    expect(theme.surface.elevation).toBe(0);
    expect(theme.color.accent).toBe('#7F6EB5');
    expect(theme.color.borderLight).toBe('#EBEBEB');
  });

  it('builds soft-shadow tokens with hairline borders and elevation', () => {
    const theme = buildTheme('soft-shadow', '#123456');
    expect(theme.surface.style).toBe('soft-shadow');
    expect(theme.surface.borderWidth).toBe(1);
    expect(theme.surface.elevation).toBe(3);
    expect(theme.color.accent).toBe('#123456');
  });
});

import { parseMinorUnits, formatMoneyInput, formatMinorUnits, formatMoney, formatMoneyCompact, addAmounts, currencyDecimals } from '../money';

describe('money minor units', () => {
  it('returns correct decimals per currency', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('IDR')).toBe(0);
    expect(currencyDecimals('KRW')).toBe(0);
    expect(currencyDecimals('MYR')).toBe(2);
    expect(currencyDecimals('THB')).toBe(2);
  });

  it('parses whole-number currencies as integer minor units', () => {
    expect(parseMinorUnits('1500', 'JPY')).toBe(1500);
    expect(parseMinorUnits('1,500', 'JPY')).toBe(1500);
    expect(parseMinorUnits('1500.5', 'JPY')).toBeNull();
  });

  it('parses decimal currencies with scale', () => {
    expect(parseMinorUnits('12.50', 'MYR')).toBe(1250);
    expect(parseMinorUnits('0.05', 'THB')).toBe(5);
    expect(parseMinorUnits('1,500.', 'MYR')).toBe(150000);
    expect(parseMinorUnits('12.505', 'MYR')).toBeNull();
  });

  it('rejects invalid input', () => {
    expect(parseMinorUnits('', 'JPY')).toBeNull();
    expect(parseMinorUnits('abc', 'JPY')).toBeNull();
    expect(parseMinorUnits('-5', 'JPY')).toBeNull();
    expect(parseMinorUnits('1.2.3', 'JPY')).toBeNull();
  });

  it('formats with thousands separators and currency decimals', () => {
    expect(formatMinorUnits(1500, 'JPY')).toBe('1,500');
    expect(formatMinorUnits(1250, 'MYR')).toBe('12.50');
    expect(formatMinorUnits(123456789, 'IDR')).toBe('123,456,789');
  });

  it('formats editable price input with comma thousands and dot decimals', () => {
    expect(formatMoneyInput('1500', 'JPY')).toBe('1,500');
    expect(formatMoneyInput('1234567', 'IDR')).toBe('1,234,567');
    expect(formatMoneyInput('1234567.5', 'MYR')).toBe('1,234,567.5');
    expect(formatMoneyInput('1234567.', 'MYR')).toBe('1,234,567.');
    expect(formatMoneyInput('12.505', 'MYR')).toBe('12.50');
    expect(formatMoneyInput('12.50', 'JPY')).toBe('12.50');
    expect(formatMoneyInput('1,2a3', 'JPY')).toBe('123');
  });

  it('formats full money with symbol', () => {
    expect(formatMoney(1500, 'JPY')).toBe('¥ 1,500');
    expect(formatMoney(1250, 'MYR')).toBe('RM 12.50');
    expect(formatMoney(500, 'THB')).toBe('฿ 5.00');
    expect(formatMoney(1000000, 'KRW')).toBe('₩ 1,000,000');
  });

  it('accumulates amounts per currency without conversion', () => {
    const totals = addAmounts([
      { amount: 1000, currency: 'JPY' },
      { amount: 2000, currency: 'JPY' },
      { amount: 500, currency: 'IDR' },
    ]);
    expect(totals).toEqual({ JPY: 3000, IDR: 500, MYR: 0, KRW: 0, THB: 0 });
  });
});

describe('formatMoneyCompact', () => {
  it('uses K/M/B suffixes from one thousand upward', () => {
    expect(formatMoneyCompact(4000, 'JPY')).toBe('¥ 4K');
    expect(formatMoneyCompact(400000, 'IDR')).toBe('Rp 400K');
    expect(formatMoneyCompact(1_200_000, 'KRW')).toBe('₩ 1.2M');
    expect(formatMoneyCompact(3_500_000_000, 'JPY')).toBe('¥ 3.5B');
  });

  it('keeps up to two fraction digits and drops trailing zeros', () => {
    expect(formatMoneyCompact(10_250_000, 'JPY')).toBe('¥ 10.25M');
    expect(formatMoneyCompact(2_100_000, 'JPY')).toBe('¥ 2.1M');
    expect(formatMoneyCompact(1_000_000, 'JPY')).toBe('¥ 1M');
    expect(formatMoneyCompact(2500, 'JPY')).toBe('¥ 2.5K');
    expect(formatMoneyCompact(2_575_000, 'JPY')).toBe('¥ 2.58M');
  });

  it('falls back to full formatting below one thousand (major units)', () => {
    expect(formatMoneyCompact(900, 'JPY')).toBe('¥ 900');
    expect(formatMoneyCompact(999, 'JPY')).toBe('¥ 999');
    expect(formatMoneyCompact(1250, 'MYR')).toBe('RM 12.50');
  });
});

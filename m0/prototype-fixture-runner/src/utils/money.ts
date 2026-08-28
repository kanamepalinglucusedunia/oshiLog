import { CURRENCY_BY_CODE, type CurrencyCode } from '@/types/domain';

export const CURRENCY_CODES: readonly CurrencyCode[] = ['JPY', 'IDR', 'MYR', 'KRW', 'THB'];

export function emptyMoneyTotals(): Record<CurrencyCode, number> {
  return { JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 };
}

/**
 * Money is stored as integer minor units. No floating point anywhere.
 */

export function currencyDecimals(currency: CurrencyCode): number {
  return CURRENCY_BY_CODE[currency].decimals;
}

/**
 * Parses a user string input ("1500" or "12.50") into minor units for the currency.
 * Returns null when the input is not a valid non-negative number with at most
 * `decimals` fraction digits.
 */
export function parseMinorUnits(input: string, currency: CurrencyCode): number | null {
  const normalized = input.trim().replace(/[ ,]/g, '');
  if (normalized === '') return null;
  if (!/^\d+(\.\d*)?$/.test(normalized)) return null;

  const [whole, fraction = ''] = normalized.split('.');
  const decimals = currencyDecimals(currency);
  if (fraction.length > decimals) return null;

  const scale = Math.pow(10, decimals);
  const wholeMinor = Number(whole) * scale;
  const fractionMinor = fraction.length === 0 ? 0 : Number(fraction) * Math.pow(10, decimals - fraction.length);
  return Math.round(wholeMinor + fractionMinor);
}

/**
 * Renders minor units with thousand separators and the currency's decimal digits.
 * Returns the numeric part only (no symbol); use `formatMoney` for symbol.
 */
export function formatMinorUnits(amount: number, currency: CurrencyCode): string {
  const decimals = currencyDecimals(currency);
  const factor = Math.pow(10, decimals);
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / factor);
  const fraction = decimals > 0
    ? Math.round(abs % factor).toString().padStart(decimals, '0')
    : '';

  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${isNegative ? '-' : ''}${wholeStr}${decimals > 0 ? '.' + fraction : ''}`;
}

/**
 * Formats a live money input while preserving an unfinished decimal portion.
 * Thousands always use commas and the decimal separator is always a dot.
 */
export function formatMoneyInput(input: string, currency: CurrencyCode): string {
  const decimals = currencyDecimals(currency);
  const normalized = input.replace(/,/g, '');
  const hasDecimal = normalized.includes('.');
  const [wholePart = '', ...fractionParts] = normalized.split('.');
  const wholeDigits = wholePart.replace(/\D/g, '');
  const fractionDigits = fractionParts.join('').replace(/\D/g, '').slice(0, decimals > 0 ? decimals : undefined);

  if (!wholeDigits && !fractionDigits && !hasDecimal) return '';

  const whole = (wholeDigits || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!hasDecimal) return whole;
  return `${whole}.${fractionDigits}`;
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const { symbol } = CURRENCY_BY_CODE[currency];
  const numeric = formatMinorUnits(amount, currency);
  return `${symbol} ${numeric}`;
}

/**
 * Compact money for small cards ("¥ 4K", "¥ 2.1M", "¥ 10.25M") as designed in
 * the Figma idol cards. Operates on major units, so decimal currencies keep
 * their scale (1250 MYR minor = RM 12.50, not 1.25K). Keeps at most two
 * fraction digits and drops trailing zeros. Falls back to `formatMoney`
 * below one thousand.
 */
export function formatMoneyCompact(amount: number, currency: CurrencyCode): string {
  const { symbol } = CURRENCY_BY_CODE[currency];
  const major = amount / Math.pow(10, currencyDecimals(currency));
  const abs = Math.abs(major);

  const compact = (divisor: number, suffix: string) => {
    const rounded = Math.round((major / divisor) * 100) / 100;
    const digits = rounded.toFixed(2).replace(/\.?0+$/, '');
    return `${symbol} ${digits}${suffix}`;
  };

  if (abs >= 1_000_000_000) return compact(1_000_000_000, 'B');
  if (abs >= 1_000_000) return compact(1_000_000, 'M');
  if (abs >= 1_000) return compact(1_000, 'K');
  return formatMoney(amount, currency);
}

export function addAmounts(amounts: { amount: number; currency: CurrencyCode }[]): Record<CurrencyCode, number> {
  const totals = emptyMoneyTotals();
  for (const { amount, currency } of amounts) {
    totals[currency] += amount;
  }
  return totals;
}

export function formatMoneyTotals(
  totals: Record<CurrencyCode, number>,
  options: { compact?: boolean; separator?: string } = {},
): string | null {
  const formatter = options.compact ? formatMoneyCompact : formatMoney;
  const values = CURRENCY_CODES
    .filter((currency) => totals[currency] !== 0)
    .map((currency) => formatter(totals[currency], currency));
  return values.length > 0 ? values.join(options.separator ?? ' · ') : null;
}

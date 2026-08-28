import type { CurrencyCode, Event } from '@/types/domain';

export interface VenueDrinkSummaryRow {
  currency: CurrencyCode;
  price: number;
  count: number;
  total: number;
}

/**
 * Summarizes the drink amount snapshot saved on each venue visit.
 * A visit stores one drink amount, so count is the number of visits at that price.
 */
export function summarizeVenueDrinkRows(
  events: Pick<Event, 'drinkAmount' | 'drinkCurrency'>[],
): VenueDrinkSummaryRow[] {
  const rows = new Map<string, VenueDrinkSummaryRow>();

  for (const event of events) {
    if (event.drinkAmount == null || event.drinkAmount <= 0 || event.drinkCurrency == null) continue;
    const key = `${event.drinkCurrency}:${event.drinkAmount}`;
    const current = rows.get(key);
    if (current) {
      current.count += 1;
      current.total += event.drinkAmount;
      continue;
    }
    rows.set(key, {
      currency: event.drinkCurrency,
      price: event.drinkAmount,
      count: 1,
      total: event.drinkAmount,
    });
  }

  return [...rows.values()].sort((a, b) => b.price - a.price || a.currency.localeCompare(b.currency));
}

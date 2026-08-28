import type { Event } from '@/types/domain';
import { summarizeVenueDrinkRows } from '@/services/venueDetail';

describe('venue detail helpers', () => {
  it('aggregates registered drink visits by price and currency', () => {
    const events: Pick<Event, 'drinkAmount' | 'drinkCurrency'>[] = [
      { drinkAmount: 2_000, drinkCurrency: 'JPY' },
      { drinkAmount: 1_000, drinkCurrency: 'JPY' },
      { drinkAmount: 2_000, drinkCurrency: 'JPY' },
      { drinkAmount: null, drinkCurrency: null },
      { drinkAmount: 0, drinkCurrency: 'JPY' },
      { drinkAmount: 700, drinkCurrency: 'JPY' },
      { drinkAmount: 1_000, drinkCurrency: 'JPY' },
    ];

    expect(summarizeVenueDrinkRows(events)).toEqual([
      { currency: 'JPY', price: 2_000, count: 2, total: 4_000 },
      { currency: 'JPY', price: 1_000, count: 2, total: 2_000 },
      { currency: 'JPY', price: 700, count: 1, total: 700 },
    ]);
  });

  it('returns no rows when no event has a registered drink amount', () => {
    expect(summarizeVenueDrinkRows([
      { drinkAmount: null, drinkCurrency: null },
      { drinkAmount: 0, drinkCurrency: 'JPY' },
    ])).toEqual([]);
  });
});

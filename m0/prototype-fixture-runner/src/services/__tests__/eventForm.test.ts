import { filterEventVenues, getEventDrinkState, getTripsForEventDate } from '../eventForm';
import type { Trip, Venue, VenueDrinkPrice } from '@/types/domain';

const venue = (overrides: Partial<Venue>): Venue => ({
  id: overrides.id ?? 'venue-1',
  name: overrides.name ?? 'Venue',
  country: overrides.country ?? 'JP',
  region: overrides.region ?? 'Tokyo',
  address: overrides.address ?? null,
  isFavorite: overrides.isFavorite ?? false,
  notes: overrides.notes ?? null,
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  deletedAt: overrides.deletedAt ?? null,
  schemaVersion: overrides.schemaVersion ?? 1,
});

const trip = (overrides: Partial<Trip>): Trip => ({
  id: overrides.id ?? 'trip-1',
  title: overrides.title ?? 'Trip',
  startDate: overrides.startDate ?? '2026-08-20',
  endDate: overrides.endDate ?? '2026-08-22',
  description: overrides.description ?? null,
  isFavorite: overrides.isFavorite ?? false,
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  deletedAt: overrides.deletedAt ?? null,
  schemaVersion: overrides.schemaVersion ?? 1,
});

const drink = (overrides: Partial<VenueDrinkPrice>): VenueDrinkPrice => ({
  id: overrides.id ?? 'drink-1',
  venueId: overrides.venueId ?? 'venue-1',
  label: overrides.label ?? 'Drink',
  price: overrides.price ?? 600,
  currency: overrides.currency ?? 'JPY',
  isArchived: overrides.isArchived ?? false,
  isDefault: overrides.isDefault ?? false,
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  deletedAt: overrides.deletedAt ?? null,
  schemaVersion: overrides.schemaVersion ?? 1,
});

describe('event form rules', () => {
  it('filters venues by country and region while keeping all venues when both are empty', () => {
    const venues = [
      venue({ id: 'tokyo-jp', country: 'JP', region: 'Tokyo' }),
      venue({ id: 'osaka-jp', country: 'JP', region: 'Osaka' }),
      venue({ id: 'seoul-kr', country: 'KR', region: 'Seoul' }),
    ];

    expect(filterEventVenues(venues, null, '')).toEqual(venues);
    expect(filterEventVenues(venues, 'JP', '')).toEqual([venues[0], venues[1]]);
    expect(filterEventVenues(venues, 'JP', 'osaka')).toEqual([venues[1]]);
    expect(filterEventVenues(venues, null, 'Seoul')).toEqual([venues[2]]);
  });

  it('includes trips whose start or end date is the event date', () => {
    const trips = [
      trip({ id: 'starts-on-event', startDate: '2026-08-21', endDate: '2026-08-22' }),
      trip({ id: 'ends-on-event', startDate: '2026-08-19', endDate: '2026-08-21' }),
      trip({ id: 'outside', startDate: '2026-08-22', endDate: '2026-08-23' }),
    ];

    expect(getTripsForEventDate(trips, '2026-08-21').map(({ id }) => id)).toEqual([
      'starts-on-event',
      'ends-on-event',
    ]);
  });

  it('hides archived drinks and chooses the default active drink', () => {
    const drinks = [
      drink({ id: 'archived', isArchived: true, isDefault: true }),
      drink({ id: 'active', isDefault: true }),
    ];

    expect(getEventDrinkState(drinks)).toEqual({
      activeDrinks: [drinks[1]],
      selectedDrink: drinks[1],
      visible: true,
      canSelect: false,
    });
  });

  it('keeps an active selection and enables the drink picker for multiple drinks', () => {
    const drinks = [
      drink({ id: 'default', isDefault: true }),
      drink({ id: 'premium', label: 'Premium' }),
      drink({ id: 'old', isArchived: true }),
    ];

    expect(getEventDrinkState(drinks, 'premium')).toMatchObject({
      activeDrinks: [drinks[0], drinks[1]],
      selectedDrink: drinks[1],
      visible: true,
      canSelect: true,
    });
  });

  it('hides the drink field when a venue has no active drinks', () => {
    expect(getEventDrinkState([drink({ isArchived: true })])).toEqual({
      activeDrinks: [],
      selectedDrink: null,
      visible: false,
      canSelect: false,
    });
  });
});

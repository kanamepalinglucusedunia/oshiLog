import type { CountryCode, Trip, Venue, VenueDrinkPrice } from '@/types/domain';

/** Returns venues matching the current country/region selection. */
export function filterEventVenues(venues: Venue[], country: CountryCode | null, region: string): Venue[] {
  const normalizedRegion = region.trim().toLocaleLowerCase();
  return venues.filter((venue) => {
    if (country && venue.country !== country) return false;
    if (normalizedRegion && (venue.region ?? '').trim().toLocaleLowerCase() !== normalizedRegion) return false;
    return true;
  });
}

/** Event dates are inclusive at both ends of a trip. */
export function getTripsForEventDate(trips: Trip[], eventDate: string): Trip[] {
  return trips.filter((trip) => trip.startDate <= eventDate && trip.endDate >= eventDate);
}

export interface EventDrinkState {
  activeDrinks: VenueDrinkPrice[];
  selectedDrink: VenueDrinkPrice | null;
  visible: boolean;
  canSelect: boolean;
}

/** Resolves the event form's drink field from active venue prices only. */
export function getEventDrinkState(prices: VenueDrinkPrice[], selectedId: string | null = null): EventDrinkState {
  const activeDrinks = prices.filter((price) => !price.isArchived);
  const selectedDrink = activeDrinks.find((price) => price.id === selectedId)
    ?? activeDrinks.find((price) => price.isDefault)
    ?? activeDrinks[0]
    ?? null;
  return {
    activeDrinks,
    selectedDrink,
    visible: activeDrinks.length > 0,
    canSelect: activeDrinks.length > 1,
  };
}

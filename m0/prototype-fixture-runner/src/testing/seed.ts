import { createNodeTestDb } from '@/testing/nodeSqlite';
import type { SqliteLike } from '@/db/types';
import { createIdolRepo } from '@/repositories/idol';
import { createVenueRepo } from '@/repositories/venue';
import { createTripRepo } from '@/repositories/trip';
import { createEventRepo } from '@/repositories/event';
import { createSettingsRepo } from '@/repositories/settings';

export interface SeededFixture {
  db: SqliteLike;
  idolId: string;
  groupAId: string;
  groupBId: string;
  membershipAId: string;
  membershipBId: string;
  chekiTypeAId: string;
  venueId: string;
  tripId: string;
}

/**
 * Seeds: idol Hinata, groups A and B with overlapping memberships, one cheki
 * type per membership period, a venue with drink price, and a trip covering
 * 2026-08-01..2026-08-10 in JP.
 */
export function seedFixture(): SeededFixture {
  const db = createNodeTestDb();
  const idolRepo = createIdolRepo(db);

  const idol = idolRepo.createIdol({ name: 'Hinata', country: 'JP', status: 'active' });
  const groupA = idolRepo.createGroup({ name: 'Group A', country: 'JP' });
  const groupB = idolRepo.createGroup({ name: 'Group B', country: 'JP' });

  const membershipA = idolRepo.createMembership({ idolId: idol.id, groupId: groupA.id, startDate: '2020-01-01', endDate: '2022-12-31' });
  const membershipB = idolRepo.createMembership({ idolId: idol.id, groupId: groupB.id, startDate: '2023-01-01', endDate: null });

  const chekiTypeA = idolRepo.createChekiType({ idolId: idol.id, label: 'Normal', currency: 'JPY', unitPrice: 1000 });

  const venue = createVenueRepo(db).createVenue({ name: 'Tachikawa Stage', country: 'JP' });
  createVenueRepo(db).createDrinkPrice({ venueId: venue.id, label: 'Lemon sour', currency: 'JPY', price: 600, isDefault: true });

  const trip = createTripRepo(db).createTrip({
    title: 'Tokyo Summer',
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    countries: ['JP'],
  });

  createSettingsRepo(db).upsertCountry('JP', true);

  return {
    db,
    idolId: idol.id,
    groupAId: groupA.id,
    groupBId: groupB.id,
    membershipAId: membershipA.id,
    membershipBId: membershipB.id,
    chekiTypeAId: chekiTypeA.id,
    venueId: venue.id,
    tripId: trip.id,
  };
}

export { createNodeTestDb, createEventRepo, createIdolRepo, createTripRepo };

import type { SqliteLike } from '@/db/types';
import { createSettingsRepo } from '@/repositories/settings';
import { createRegionRepo } from '@/repositories/region';
import { createIdolRepo } from '@/repositories/idol';
import { createVenueRepo } from '@/repositories/venue';
import { createTripRepo } from '@/repositories/trip';
import { createEventRepo } from '@/repositories/event';

/**
 * Seeds demo data. Only callable in development/test builds — never in production.
 */
export function seedDevData(db: SqliteLike): void {
  const settings = createSettingsRepo(db);
  const existing = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM idol WHERE deleted_at IS NULL`);
  if ((existing?.c ?? 0) > 0) return;

  for (const country of ['JP', 'ID', 'MY', 'KR', 'TH']) {
    settings.upsertCountry(country as 'JP', country === 'JP' || country === 'ID');
  }
  settings.patchSettings({ surfaceStyle: 'outline', accentColor: '#7F6EB5', homeHeaderLabel: 'oshiLog' });

  const regionRepo = createRegionRepo(db);
  const SEED_REGIONS: [string, string][] = [
    ['JP', 'Tokyo'],
    ['JP', 'Osaka'],
    ['JP', 'Nagoya'],
    ['JP', 'Fukuoka'],
    ['JP', 'Sapporo'],
    ['ID', 'Jakarta'],
    ['ID', 'Bandung'],
    ['ID', 'Surabaya'],
    ['ID', 'Yogyakarta'],
    ['MY', 'Kuala Lumpur'],
    ['KR', 'Seoul'],
    ['TH', 'Bangkok'],
  ];
  for (const [country, name] of SEED_REGIONS) {
    regionRepo.ensureRegion({ country: country as 'JP', name });
  }

  const idolRepo = createIdolRepo(db);

  const groupA = idolRepo.createGroup({ name: 'Lumière', country: 'JP', region: 'Tokyo', debutDate: '2021-03-14' });
  const groupB = idolRepo.createGroup({ name: 'Aster Blossom', country: 'JP', region: 'Osaka', debutDate: '2024-09-01' });
  const groupC = idolRepo.createGroup({ name: 'Mahkota Putri', country: 'ID', region: 'Jakarta', debutDate: '2019-05-20' });

  const hinata = idolRepo.createIdol({ name: 'Hoshino Hinata', country: 'JP', region: 'Tokyo', birthDate: '2001-04-15', memberColor: '#FFC0CB', status: 'active', isFavorite: true });
  const sora = idolRepo.createIdol({ name: 'Amamiya Sora', country: 'JP', region: 'Tokyo', birthDate: '2000-11-02', memberColor: '#87CEEB', status: 'active' });
  const yuki = idolRepo.createIdol({ name: 'Yuki Mizuki', country: 'JP', region: 'Osaka', status: 'active' });
  const putri = idolRepo.createIdol({ name: 'Putri Ayudia', country: 'ID', region: 'Jakarta', status: 'active' });
  const kana = idolRepo.createIdol({ name: 'Kana Oshiro', country: 'JP', status: 'hiatus' });

  // Overlapping memberships: Hinata in A then B; Sora in both A and B at once.
  idolRepo.createMembership({ idolId: hinata.id, groupId: groupA.id, startDate: '2021-03-14', endDate: '2023-12-31' });
  idolRepo.createMembership({ idolId: hinata.id, groupId: groupB.id, startDate: '2024-01-01', endDate: null });
  idolRepo.createMembership({ idolId: sora.id, groupId: groupA.id, startDate: '2021-03-14', endDate: null });
  idolRepo.createMembership({ idolId: sora.id, groupId: groupB.id, startDate: '2024-09-01', endDate: null });
  idolRepo.createMembership({ idolId: yuki.id, groupId: groupB.id, startDate: '2024-09-01', endDate: null });
  idolRepo.createMembership({ idolId: putri.id, groupId: groupC.id, startDate: '2019-05-20', endDate: '2025-06-01' });
  idolRepo.createMembership({ idolId: kana.id, groupId: groupA.id, startDate: '2022-01-01', endDate: null });

  const normalType = idolRepo.createChekiType({ idolId: hinata.id, label: 'Normal', currency: 'JPY', unitPrice: 1000 });
  const animateType = idolRepo.createChekiType({ idolId: hinata.id, label: 'Animate', currency: 'JPY', unitPrice: 1500 });
  idolRepo.createChekiType({ idolId: sora.id, label: 'Normal', currency: 'JPY', unitPrice: 1200 });
  // M0 audit runner only: every seeded event entry must use a type owned by its idol.
  const yukiType = idolRepo.createChekiType({ idolId: yuki.id, label: 'Normal', currency: 'JPY', unitPrice: 1000 });
  idolRepo.createChekiType({ idolId: putri.id, label: 'Normal', currency: 'IDR', unitPrice: 50000 });

  const venue1 = createVenueRepo(db).createVenue({ name: 'Tachikawa Stage Garden', country: 'JP', region: 'Tokyo' });
  createVenueRepo(db).createDrinkPrice({ venueId: venue1.id, label: 'Lemon sour', currency: 'JPY', price: 600, isDefault: true });
  createVenueRepo(db).createDrinkPrice({ venueId: venue1.id, label: 'Oolong tea', currency: 'JPY', price: 400 });
  const venue2 = createVenueRepo(db).createVenue({ name: 'GBK Tennis Indoor', country: 'ID', region: 'Jakarta' });
  createVenueRepo(db).createDrinkPrice({ venueId: venue2.id, label: 'Air mineral', currency: 'IDR', price: 10000, isDefault: true });

  const trip = createTripRepo(db).createTrip({
    title: 'Tokyo Summer 2026',
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    countries: ['JP'],
    description: 'Summer live trip',
  });
  createTripRepo(db).createExpense({ tripId: trip.id, title: 'Narita Express', category: 'transport', currency: 'JPY', amount: 3200, date: '2026-08-01' });
  createTripRepo(db).createExpense({ tripId: trip.id, title: 'Hotel Shinjuku', category: 'hotel', currency: 'JPY', amount: 88000, date: '2026-08-01' });
  createTripRepo(db).createExpense({ tripId: trip.id, title: 'Ramen lunch', category: 'meal', currency: 'JPY', amount: 1200, date: '2026-08-02' });

  const eventRepo = createEventRepo(db);
  const event1 = eventRepo.createEvent({
    title: 'Lumière 5th Anniversary Live',
    eventDate: '2026-08-05',
    country: 'JP',
    venueId: venue1.id,
    tripId: trip.id,
    ticketAmount: 8000,
    ticketCurrency: 'JPY',
    drinkAmount: 600,
    drinkCurrency: 'JPY',
    entries: [
      { idolId: sora.id, groupMembershipId: idolRepo.listMembershipsByGroupAllWithGroupName(sora.id).find((m) => m.groupName === 'Lumière')?.id ?? null, chekiTypeId: idolRepo.listChekiTypes(sora.id, false)[0].id, quantity: 1, currency: 'JPY', unitPrice: 1200 },
      // Hinata's Lumière membership ended before this event date. Keep this
      // fixture entry ungrouped so it satisfies the production relation trigger.
      { idolId: hinata.id, groupMembershipId: null, chekiTypeId: normalType.id, quantity: 2, currency: 'JPY', unitPrice: 1000 },
    ],
  });
  eventRepo.createEvent({
    title: 'Aster Blossom Handshake & Live',
    eventDate: '2026-08-08',
    country: 'JP',
    venueId: venue1.id,
    tripId: trip.id,
    ticketAmount: 6500,
    ticketCurrency: 'JPY',
    entries: [
      { idolId: hinata.id, groupMembershipId: idolRepo.listMembershipsByGroupAllWithGroupName(hinata.id).find((m) => m.groupName === 'Aster Blossom')?.id ?? null, chekiTypeId: animateType.id, quantity: 1, currency: 'JPY', unitPrice: 1500 },
      { idolId: yuki.id, groupMembershipId: idolRepo.listMembershipsByGroupAllWithGroupName(yuki.id)[0]?.id ?? null, chekiTypeId: yukiType.id, quantity: 1, currency: 'JPY', unitPrice: 1000 },
    ],
  });
  eventRepo.createEvent({
    title: 'Putri Ayudia Fan Meet',
    eventDate: '2025-05-25',
    country: 'ID',
    venueId: venue2.id,
    ticketAmount: 250000,
    ticketCurrency: 'IDR',
    entries: [
      { idolId: putri.id, groupMembershipId: idolRepo.listMembershipsByGroupAllWithGroupName(putri.id)[0]?.id ?? null, chekiTypeId: idolRepo.listChekiTypes(putri.id, false)[0].id, quantity: 1, currency: 'IDR', unitPrice: 50000 },
    ],
  });
  void event1;
}

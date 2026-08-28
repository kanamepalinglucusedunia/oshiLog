import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { createVenueRepo } from '@/repositories/venue';
import { createTripRepo } from '@/repositories/trip';
import { createEventRepo } from '@/repositories/event';
import { createSettingsRepo } from '@/repositories/settings';

describe('idol repository', () => {
  it('creates and partially updates independent Idol social profiles', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({
      name: 'Rina',
      country: 'JP',
      status: 'active',
      xProfileUrl: 'https://x.com/rina',
      instagramProfileUrl: 'https://www.instagram.com/rina/',
      tiktokProfileUrl: 'https://www.tiktok.com/@rina',
    });

    expect(idol).toMatchObject({
      xProfileUrl: 'https://x.com/rina',
      instagramProfileUrl: 'https://www.instagram.com/rina/',
      tiktokProfileUrl: 'https://www.tiktok.com/@rina',
    });

    const updated = repo.updateIdol(idol.id, { xProfileUrl: 'https://x.com/newrina' });
    expect(updated).toMatchObject({
      xProfileUrl: 'https://x.com/newrina',
      instagramProfileUrl: 'https://www.instagram.com/rina/',
      tiktokProfileUrl: 'https://www.tiktok.com/@rina',
    });

    expect(repo.updateIdol(idol.id, { instagramProfileUrl: null })).toMatchObject({
      xProfileUrl: 'https://x.com/newrina',
      instagramProfileUrl: null,
      tiktokProfileUrl: 'https://www.tiktok.com/@rina',
    });
  });

  it('creates and partially updates independent Group social profiles', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const group = repo.createGroup({
      name: 'Team X',
      country: 'JP',
      xProfileUrl: 'https://x.com/teamx',
      instagramProfileUrl: 'https://www.instagram.com/teamx/',
      tiktokProfileUrl: 'https://www.tiktok.com/@teamx',
    });

    expect(group).toMatchObject({
      xProfileUrl: 'https://x.com/teamx',
      instagramProfileUrl: 'https://www.instagram.com/teamx/',
      tiktokProfileUrl: 'https://www.tiktok.com/@teamx',
    });
    expect(repo.updateGroup(group.id, { tiktokProfileUrl: null })).toMatchObject({
      xProfileUrl: 'https://x.com/teamx',
      instagramProfileUrl: 'https://www.instagram.com/teamx/',
      tiktokProfileUrl: null,
    });
  });

  it('updates idols with partial input and supports member list variants', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Rina', country: 'JP', status: 'active' });

    const partial = repo.updateIdol(idol.id, { notes: 'hello' });
    expect(partial.notes).toBe('hello');
    expect(partial.name).toBe('Rina');

    const group = repo.createGroup({ name: 'G', country: 'JP' });
    repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2021-01-01' });

    const withName = repo.listMembershipsByGroupAllWithGroupName(idol.id);
    expect(withName[0].groupName).toBe('G');
    const joined = repo.listMembershipsByGroupJoined(group.id);
    expect(joined[0].idolName).toBe('Rina');
    const all = repo.listMembershipsByGroupAll(group.id);
    expect(all).toHaveLength(1);

    const updated = repo.updateMembership(withName[0].id, { endDate: '2022-01-01' });
    expect(updated.endDate).toBe('2022-01-01');
    repo.deleteMembership(withName[0].id);
    expect(repo.getMembership(withName[0].id)).toBeNull();

    const type = repo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 100 });
    repo.updateChekiType(type.id, { label: 'B' });
    expect(repo.getChekiType(type.id)?.label).toBe('B');
    repo.deleteChekiType(type.id);
    expect(repo.getChekiType(type.id)).toBeNull();
  });

  it('updates groups with partial input and memberships by group', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const group = repo.createGroup({ name: 'Team X', country: 'JP' });
    const partial = repo.updateGroup(group.id, { region: 'Osaka' });
    expect(partial.region).toBe('Osaka');
    expect(partial.name).toBe('Team X');
  });
  it('creates, lists, updates, and soft-deletes idols', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);

    const idol = repo.createIdol({ name: 'Rina', country: 'JP', status: 'active', isFavorite: true, region: 'Tokyo' });
    expect(idol.name).toBe('Rina');
    expect(repo.listIdols()).toHaveLength(1);

    const updated = repo.updateIdol(idol.id, { status: 'hiatus', isFavorite: false });
    expect(updated.status).toBe('hiatus');
    expect(updated.isFavorite).toBe(false);

    repo.deleteIdol(idol.id);
    expect(repo.getIdol(idol.id)).toBeNull();
    expect(repo.listIdols()).toHaveLength(0);
  });

  it('filters inactive idols from default list but keeps them queryable', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const active = repo.createIdol({ name: 'Active', country: 'JP', status: 'active' });
    const inactive = repo.createIdol({ name: 'Inactive', country: 'JP', status: 'inactive' });

    expect(repo.listIdols().map((i) => i.id)).toEqual([active.id]);
    expect(repo.listIdols(true).map((i) => i.id).sort()).toEqual([active.id, inactive.id].sort());
    expect(repo.getIdol(inactive.id)).not.toBeNull();
  });

  it('manages group CRUD and memberships with both active and former lists', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const group = repo.createGroup({ name: 'Team X', country: 'JP', debutDate: '2020-01-01' });
    const idol1 = repo.createIdol({ name: 'A', country: 'JP', status: 'active' });
    const idol2 = repo.createIdol({ name: 'B', country: 'JP', status: 'active' });
    const futureIdol = repo.createIdol({ name: 'Future', country: 'JP', status: 'active' });
    const scheduledGradIdol = repo.createIdol({ name: 'Immediate Former', country: 'JP', status: 'active' });

    repo.createMembership({ idolId: idol1.id, groupId: group.id, startDate: '2021-01-01', endDate: null });
    repo.createMembership({ idolId: idol2.id, groupId: group.id, startDate: '2020-01-01', endDate: '2024-01-01' });
    repo.createMembership({ idolId: futureIdol.id, groupId: group.id, startDate: '2099-01-01', endDate: null });
    repo.createMembership({ idolId: scheduledGradIdol.id, groupId: group.id, startDate: '2025-01-01', endDate: '2099-01-01', status: 'grad' });

    const active = repo.listMembershipsByGroupActive(group.id);
    const formers = repo.listMembershipsByGroupFormers(group.id);
    expect(active.map((m) => m.idolId)).toEqual([idol1.id]);
    expect(formers.map((m) => m.idolId)).toEqual([scheduledGradIdol.id, idol2.id]);

    expect(() => repo.updateMembership(formers[0].id, { status: 'active', endDate: null })).toThrow(/new membership/i);
    const redebut = repo.createMembership({
      idolId: idol2.id,
      groupId: group.id,
      startDate: '2024-01-02',
      status: 'active',
    });
    expect(redebut.id).not.toBe(formers[0].id);

    repo.deleteGroup(group.id);
    expect(repo.getGroup(group.id)).toBeNull();
  });

  it('orders active members by joined date and former members by latest graduation date', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const group = repo.createGroup({ name: 'Chronology', country: 'JP' });
    const oldest = repo.createIdol({ name: 'Zeta', country: 'JP', status: 'active' });
    const newest = repo.createIdol({ name: 'Alpha', country: 'JP', status: 'active' });
    const formerOld = repo.createIdol({ name: 'Former Old', country: 'JP', status: 'active' });
    const formerNew = repo.createIdol({ name: 'Former New', country: 'JP', status: 'active' });

    repo.createMembership({ idolId: newest.id, groupId: group.id, startDate: '2022-01-01' });
    repo.createMembership({ idolId: oldest.id, groupId: group.id, startDate: '2020-01-01' });
    repo.createMembership({ idolId: formerOld.id, groupId: group.id, startDate: '2018-01-01', endDate: '2024-01-01' });
    repo.createMembership({ idolId: formerNew.id, groupId: group.id, startDate: '2019-01-01', endDate: '2025-01-01' });

    expect(repo.listMembershipsByGroupActive(group.id).map((m) => m.idolName)).toEqual(['Zeta', 'Alpha']);
    expect(repo.listMembershipsByGroupFormers(group.id).map((m) => m.idolName)).toEqual(['Former New', 'Former Old']);
  });

  it('treats cheki type currency and price as immutable via update surface', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Rina', country: 'JP', status: 'active' });
    const type = repo.createChekiType({ idolId: idol.id, label: 'Normal', currency: 'JPY', unitPrice: 1000 });

    // updateChekiType only exposes label/isArchived — price & currency cannot change.
    const updated = repo.updateChekiType(type.id, { isArchived: true, label: 'Renamed' });
    expect(updated.unitPrice).toBe(1000);
    expect(updated.currency).toBe('JPY');
    expect(updated.isArchived).toBe(true);
    expect(updated.label).toBe('Renamed');

    expect(repo.listChekiTypes(idol.id, false)).toHaveLength(0);
    expect(repo.listChekiTypes(idol.id, true)).toHaveLength(1);
  });

  it('keeps one active cheki type as the idol default', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Rina', country: 'JP', status: 'active' });
    const first = repo.createChekiType({ idolId: idol.id, label: 'Normal', currency: 'JPY', unitPrice: 1000, isDefault: true });
    const second = repo.createChekiType({ idolId: idol.id, label: 'Special', currency: 'JPY', unitPrice: 2000 });

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);

    const updated = repo.setDefaultChekiType(second.id);
    expect(updated.isDefault).toBe(true);
    expect(repo.getChekiType(first.id)?.isDefault).toBe(false);
    expect(repo.listChekiTypes(idol.id, false).filter((type) => type.isDefault)).toHaveLength(1);

    repo.updateChekiType(second.id, { isArchived: true });
    expect(repo.getChekiType(second.id)).toMatchObject({ isArchived: true, isDefault: false });
  });
});

describe('venue repository', () => {
  it('manages venues and drink prices', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const venue = repo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    const price = repo.createDrinkPrice({ venueId: venue.id, label: 'Cola', currency: 'JPY', price: 500 });

    expect(repo.listVenues()).toHaveLength(1);
    expect(repo.listDrinkPrices(venue.id)).toHaveLength(1);

    repo.updateDrinkPrice(price.id, { isArchived: true });
    expect(repo.listDrinkPrices(venue.id, false)).toHaveLength(0);

    repo.deleteVenue(venue.id);
    expect(repo.getVenue(venue.id)).toBeNull();
  });

  it('supports partial updates on venue and drink price', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const venue = repo.createVenue({ name: 'Hall B', country: 'JP', address: '1-2-3 Chome, Shibuya' });
    const price = repo.createDrinkPrice({ venueId: venue.id, currency: 'JPY', price: 300 });

    expect(venue.address).toBe('1-2-3 Chome, Shibuya');

    const venuePartial = repo.updateVenue(venue.id, { notes: 'second floor', address: '4-5-6 Chome, Shinjuku' });
    expect(venuePartial.notes).toBe('second floor');
    expect(venuePartial.address).toBe('4-5-6 Chome, Shinjuku');
    expect(venuePartial.name).toBe('Hall B');

    const pricePartial = repo.updateDrinkPrice(price.id, { label: 'Tea' });
    expect(pricePartial.label).toBe('Tea');
    expect(pricePartial.price).toBe(300);

    repo.deleteDrinkPrice(price.id);
    expect(repo.getDrinkPrice(price.id)).toBeNull();
  });

  it('updates a default drink price amount and currency', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const venue = repo.createVenue({ name: 'Hall C', country: 'JP', region: 'Tokyo' });
    const price = repo.createDrinkPrice({ venueId: venue.id, label: 'House drink', currency: 'JPY', price: 600, isDefault: true });

    const updated = repo.updateDrinkPrice(price.id, { currency: 'JPY', price: 800 });

    expect(updated).toMatchObject({ label: 'House drink', currency: 'JPY', price: 800, isDefault: true });
  });

  it('refuses to delete a drink price used by an active venue visit', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const eventRepo = createEventRepo(db);
    const venue = repo.createVenue({ name: 'Hall Used', country: 'JP', region: 'Tokyo' });
    const price = repo.createDrinkPrice({ venueId: venue.id, currency: 'JPY', price: 600 });
    eventRepo.createEvent({ title: 'Live', eventDate: '2026-08-13', country: 'JP', venueId: venue.id, drinkAmount: 600, drinkCurrency: 'JPY' });

    expect(() => repo.deleteDrinkPrice(price.id)).toThrow('used');
    expect(repo.getDrinkPrice(price.id)).not.toBeNull();
  });

  it('sets one active drink as the venue default and replaces the previous default', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const venue = repo.createVenue({ name: 'Hall D', country: 'JP', region: 'Tokyo' });
    const first = repo.createDrinkPrice({ venueId: venue.id, label: 'Cola', currency: 'JPY', price: 500, isDefault: true });
    const second = repo.createDrinkPrice({ venueId: venue.id, label: 'Tea', currency: 'JPY', price: 600 });

    const updated = repo.setDefaultDrinkPrice(second.id);

    expect(updated).toMatchObject({ id: second.id, isDefault: true });
    expect(repo.getDrinkPrice(first.id)?.isDefault).toBe(false);
    expect(repo.listDrinkPrices(venue.id, false).filter((drink) => drink.isDefault)).toHaveLength(1);
  });

  it('clears the default when a drink is archived or deleted and never infers it from the label', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const venue = repo.createVenue({ name: 'Hall E', country: 'JP', region: 'Tokyo' });
    const legacyNamedDrink = repo.createDrinkPrice({ venueId: venue.id, label: 'Drink', currency: 'JPY', price: 500 });
    const defaultDrink = repo.createDrinkPrice({ venueId: venue.id, label: 'House special', currency: 'JPY', price: 700, isDefault: true });

    expect(legacyNamedDrink.isDefault).toBe(false);
    repo.updateDrinkPrice(defaultDrink.id, { isArchived: true });
    expect(repo.getDrinkPrice(defaultDrink.id)).toMatchObject({ isArchived: true, isDefault: false });

    const replacement = repo.createDrinkPrice({ venueId: venue.id, label: 'Replacement', currency: 'JPY', price: 800, isDefault: true });
    repo.deleteDrinkPrice(replacement.id);
    expect(repo.getDrinkPrice(replacement.id)).toBeNull();
    expect(repo.listDrinkPrices(venue.id).some((drink) => drink.isDefault)).toBe(false);
  });

  it('migrates active events and drink prices while deduplicating by currency and amount', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const eventRepo = createEventRepo(db);
    const source = repo.createVenue({ name: 'Old Hall', country: 'JP', region: 'Tokyo' });
    const target = repo.createVenue({ name: 'New Hall', country: 'JP', region: 'Osaka' });
    const duplicate = repo.createDrinkPrice({ venueId: target.id, label: 'Cola', currency: 'JPY', price: 600 });
    const sourceDuplicate = repo.createDrinkPrice({ venueId: source.id, label: 'Drink', currency: 'JPY', price: 600 });
    const sourceNewPrice = repo.createDrinkPrice({ venueId: source.id, label: 'Tea', currency: 'JPY', price: 800 });
    const archived = repo.createDrinkPrice({ venueId: source.id, label: 'Old menu', currency: 'JPY', price: 400, isArchived: true });
    const activeEvent = eventRepo.createEvent({ title: 'Live', eventDate: '2026-08-13', country: 'JP', venueId: source.id });
    const deletedEvent = eventRepo.createEvent({ title: 'Deleted Live', eventDate: '2026-08-12', country: 'JP', venueId: source.id });
    eventRepo.deleteEvent(deletedEvent.id);

    repo.migrateVenue(source.id, target.id);

    expect(repo.getVenue(source.id)).toBeNull();
    expect(eventRepo.getEvent(activeEvent.id)?.venueId).toBe(target.id);
    expect(db.getFirstSync<{ venueId: string | null }>('SELECT venue_id AS venueId FROM event WHERE id = ?', deletedEvent.id)?.venueId).toBe(source.id);
    expect(repo.listDrinkPrices(target.id, false)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: duplicate.id, currency: 'JPY', price: 600 }),
      expect.objectContaining({ id: sourceNewPrice.id, currency: 'JPY', price: 800 }),
    ]));
    expect(repo.getDrinkPrice(sourceDuplicate.id)).toBeNull();
    expect(repo.getDrinkPrice(archived.id)).toMatchObject({ venueId: source.id, isArchived: true });
  });

  it('creates a new venue and migrates the source in one operation', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const eventRepo = createEventRepo(db);
    const source = repo.createVenue({ name: 'Temporary Hall', country: 'JP', region: 'Tokyo' });
    const event = eventRepo.createEvent({ title: 'New Venue Event', eventDate: '2026-08-13', country: 'JP', venueId: source.id });

    const target = repo.createVenueAndMigrate({ name: 'Permanent Hall', country: 'JP', region: 'Osaka' }, source.id);

    expect(target.name).toBe('Permanent Hall');
    expect(repo.getVenue(source.id)).toBeNull();
    expect(eventRepo.getEvent(event.id)?.venueId).toBe(target.id);
  });

  it('keeps a new target drink price while importing a different source price', () => {
    const db = createNodeTestDb();
    const repo = createVenueRepo(db);
    const source = repo.createVenue({ name: 'Source Hall', country: 'JP', region: 'Tokyo' });
    repo.createDrinkPrice({ venueId: source.id, label: 'Drink', currency: 'JPY', price: 600 });

    const target = repo.createVenueAndMigrate(
      { name: 'Target Hall', country: 'JP', region: 'Osaka' },
      source.id,
      { label: 'Drink', currency: 'JPY', price: 700 },
    );

    expect(repo.listDrinkPrices(target.id, false)).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: 'JPY', price: 600 }),
      expect.objectContaining({ currency: 'JPY', price: 700 }),
    ]));
  });
});

describe('trip repository', () => {
  it('creates trip with countries and expenses; updates countries', () => {
    const db = createNodeTestDb();
    const repo = createTripRepo(db);
    const trip = repo.createTrip({
      title: 'Seoul Trip',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      countries: ['KR'],
    });
    expect(repo.listTripCountries(trip.id)).toEqual(['KR']);

    repo.updateTrip(trip.id, { countries: ['KR', 'JP'] });
    expect(repo.listTripCountries(trip.id).sort()).toEqual(['JP', 'KR']);

    const expense = repo.createExpense({
      tripId: trip.id,
      title: 'Hotel',
      category: 'hotel',
      currency: 'KRW',
      amount: 120000,
      date: '2026-09-01',
    });
    expect(repo.listExpenses(trip.id)).toHaveLength(1);

    repo.updateExpense(expense.id, { note: 'Nice view' });
    expect(repo.getExpense(expense.id)?.note).toBe('Nice view');

    repo.deleteExpense(expense.id);
    expect(repo.listExpenses(trip.id)).toHaveLength(0);

    repo.updateTrip(trip.id, { description: 'edited' });
    expect(repo.getTrip(trip.id)?.description).toBe('edited');
    repo.deleteTrip(trip.id);
    expect(repo.getTrip(trip.id)).toBeNull();
    expect(repo.getExpense(expense.id)).toBeNull();
  });

  it('detaches events atomically when a Trip grouping is archived', () => {
    const db = createNodeTestDb();
    const tripRepo = createTripRepo(db);
    const trip = tripRepo.createTrip({
      title: 'Grouping',
      startDate: '2026-08-01',
      endDate: '2026-08-02',
      countries: ['JP'],
    });
    const event = createEventRepo(db).createEvent({
      title: 'Independent event',
      eventDate: '2026-08-01',
      country: 'JP',
      tripId: trip.id,
    });

    tripRepo.deleteTrip(trip.id);

    expect(createEventRepo(db).getEvent(event.id)?.tripId).toBeNull();
    expect(createEventRepo(db).getEventJoined(event.id)?.tripTitle).toBeNull();
  });
});

describe('event repository updates', () => {
  it('summarizes cheki quantity and spending separately per currency', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const jpyType = idolRepo.createChekiType({ idolId: idol.id, label: 'JPY', currency: 'JPY', unitPrice: 500 });
    const idrType = idolRepo.createChekiType({ idolId: idol.id, label: 'IDR', currency: 'IDR', unitPrice: 50_000 });
    const repo = createEventRepo(db);

    repo.createEvent({
      title: 'Mixed',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: idol.id, groupMembershipId: null, chekiTypeId: jpyType.id, quantity: 2, currency: 'JPY', unitPrice: 500 },
        { idolId: idol.id, groupMembershipId: null, chekiTypeId: idrType.id, quantity: 3, currency: 'IDR', unitPrice: 50_000 },
      ],
    });

    const summary = repo.listEventsWithSummary()[0];
    expect(summary.chekiCount).toBe(5);
    expect(summary.chekiTotals).toMatchObject({ JPY: 1000, IDR: 150_000 });
  });

  it('keeps historical display snapshots after Idol, membership, group, and Cheki Type renames', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Original Idol', country: 'JP', status: 'active' });
    const group = idolRepo.createGroup({ name: 'Original Group', country: 'JP' });
    const membership = idolRepo.createMembership({
      idolId: idol.id,
      groupId: group.id,
      startDate: '2020-01-01',
      name: 'Original Stage Name',
    });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'Original Type', currency: 'JPY', unitPrice: 1000 });
    const event = createEventRepo(db).createEvent({
      title: 'Historical Live',
      eventDate: '2026-01-01',
      country: 'JP',
      entries: [{
        idolId: idol.id,
        groupMembershipId: membership.id,
        chekiTypeId: type.id,
        quantity: 1,
        currency: 'JPY',
        unitPrice: 1000,
      }],
    });

    idolRepo.updateIdol(idol.id, { name: 'New Idol' });
    idolRepo.updateMembership(membership.id, { name: 'New Stage Name' });
    idolRepo.updateGroup(group.id, { name: 'New Group' });
    idolRepo.updateChekiType(type.id, { label: 'New Type' });

    const entry = createEventRepo(db).listEntries(event.id)[0];
    expect(entry.idolName).toBe('Original Stage Name');
    expect(entry.groupName).toBe('Original Group');
    expect(entry.chekiTypeLabel).toBe('Original Type');
    expect(idolRepo.listIdolNameHistory(idol.id).map((item) => item.name)).toContain('New Idol');
  });

  it('reconciles entries in place when updating an event', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 500 });

    const repo = createEventRepo(db);
    const event = repo.createEvent({
      title: 'Live',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [{ idolId: idol.id, groupMembershipId: null, chekiTypeId: type.id, quantity: 1, currency: 'JPY', unitPrice: 500 }],
    });
    const originalEntryId = repo.listEntries(event.id)[0].id;

    repo.updateEvent(event.id, {
      title: 'Live Updated',
      entries: [
        { id: originalEntryId, idolId: idol.id, groupMembershipId: null, chekiTypeId: type.id, quantity: 3, currency: 'JPY', unitPrice: 500 },
      ],
    });

    const updated = repo.getEvent(event.id);
    expect(updated?.title).toBe('Live Updated');
    const entries = repo.listEntries(event.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(originalEntryId);
    expect(entries[0].quantity).toBe(3);
    expect(entries[0].subtotal).toBe(1500);
  });

  it('keeps existing photo relations and returns photo counts without per-entry queries', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 500 });
    const repo = createEventRepo(db);
    repo.insertMediaAsset({ id: 'photo-1', kind: 'cheki', contentHash: 'photo-hash', mimeType: 'image/jpeg', fileSize: 1, width: 1, height: 1, localPath: 'file:///photo.jpg' });
    const event = repo.createEvent({
      title: 'Live',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [{
        idolId: idol.id,
        chekiTypeId: type.id,
        quantity: 1,
        currency: 'JPY',
        unitPrice: 500,
        photos: [{ mediaAssetId: 'photo-1' }],
      }],
    });
    const original = repo.listEntries(event.id)[0];

    repo.updateEvent(event.id, {
      entries: [{
        id: original.id,
        idolId: idol.id,
        chekiTypeId: type.id,
        quantity: 1,
        currency: 'JPY',
        unitPrice: 500,
        photos: [{ mediaAssetId: 'photo-1' }],
      }],
    });

    const updated = repo.listEntries(event.id)[0];
    expect(updated.id).toBe(original.id);
    expect(updated.photoCount).toBe(1);
    expect(repo.listEntryPhotos(updated.id).map((photo) => photo.id)).toEqual(['photo-1']);
  });

  it('tombstones unreferenced cheki media when an Event is archived', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 500 });
    const repo = createEventRepo(db);
    repo.insertMediaAsset({ id: 'delete-photo', kind: 'cheki', contentHash: 'delete-hash', mimeType: 'image/jpeg', fileSize: 1, width: 1, height: 1, localPath: 'file:///delete.jpg' });
    const event = repo.createEvent({
      title: 'Delete me',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [{
        idolId: idol.id,
        chekiTypeId: type.id,
        quantity: 1,
        currency: 'JPY',
        unitPrice: 500,
        photos: [{ mediaAssetId: 'delete-photo' }],
      }],
    });

    repo.deleteEvent(event.id);

    expect(repo.getMediaAsset('delete-photo')?.deletedAt).not.toBeNull();
  });

  it('media assets dedupe by content hash and detach removes relations', () => {
    const db = createNodeTestDb();
    const repo = createEventRepo(db);
    const idol = createIdolRepo(db).createIdol({ name: 'Mio', country: 'JP', status: 'active' });

    repo.insertMediaAsset({ id: 'm1', kind: 'photo', contentHash: 'hash1', mimeType: 'image/jpeg', fileSize: 1, width: 1, height: 1, localPath: 'file:///a.jpg' });
    const found = repo.findByContentHash('hash1', 'photo');
    expect(found?.id).toBe('m1');
    expect(repo.findByContentHash('hash1', 'video')).toBeNull();
    expect(repo.findByContentHash('nope', 'photo')).toBeNull();

    repo.attachMediaToIdol('m1', idol.id);
    expect(repo.listIdolAlbumMedia(idol.id)).toHaveLength(1);
    repo.detachMedia('m1');
    expect(repo.listIdolAlbumMedia(idol.id)).toHaveLength(0);
    expect(repo.getMediaAsset('m1')?.deletedAt).not.toBeNull();
  });
});

describe('settings repository', () => {
  it('requires at least one active country guard exists at onboarding level', () => {
    const db = createNodeTestDb();
    const repo = createSettingsRepo(db);
    repo.upsertCountry('JP', true);
    repo.upsertCountry('KR', true);
    repo.upsertCountry('JP', false);
    expect(repo.getActiveCountries().sort()).toEqual(['KR']);
  });
});

describe('membership per-group details', () => {
  it('creates, lists, and atomically replaces canonical status periods', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Timeline', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'AQA', country: 'JP' });
    const membership = repo.createMembership({
      idolId: idol.id,
      groupId: group.id,
      startDate: '2026-04-10',
      status: 'active',
    });

    expect(repo.listMembershipStatusPeriods(membership.id)).toMatchObject([
      { groupMembershipId: membership.id, status: 'active', startDate: '2026-04-10', endDate: null },
    ]);

    repo.replaceMembershipStatusPeriods(membership.id, [
      { status: 'active', startDate: '2026-04-10', endDate: '2026-04-25' },
      { status: 'hiatus', startDate: '2026-04-25', endDate: '2026-05-05' },
      { status: 'active', startDate: '2026-05-05', endDate: null },
    ]);
    expect(repo.listMembershipStatusPeriods(membership.id).map((item) => ({
      status: item.status,
      startDate: item.startDate,
      endDate: item.endDate,
    }))).toEqual([
      { status: 'active', startDate: '2026-04-10', endDate: '2026-04-25' },
      { status: 'hiatus', startDate: '2026-04-25', endDate: '2026-05-05' },
      { status: 'active', startDate: '2026-05-05', endDate: null },
    ]);

    expect(() => repo.replaceMembershipStatusPeriods(membership.id, [
      { status: 'active', startDate: '2026-04-10', endDate: '2026-04-24' },
      { status: 'hiatus', startDate: '2026-04-25', endDate: null },
    ])).toThrow(/boundary/i);
    expect(repo.listMembershipStatusPeriods(membership.id)).toHaveLength(3);
  });

  it('lists only Active and open-Hiatus episodes as current regardless of Grad date', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Current only', country: 'JP', status: 'active' });
    const activeGroup = repo.createGroup({ name: 'Active', country: 'JP' });
    const hiatusGroup = repo.createGroup({ name: 'Hiatus', country: 'JP' });
    const gradGroup = repo.createGroup({ name: 'Grad', country: 'JP' });
    repo.createMembership({ idolId: idol.id, groupId: activeGroup.id, startDate: '2026-01-01', status: 'active' });
    repo.createMembership({
      idolId: idol.id,
      groupId: hiatusGroup.id,
      startDate: '2026-01-01',
      status: 'hiatus',
      hiatusStartDate: '2026-04-25',
    });
    repo.createMembership({
      idolId: idol.id,
      groupId: gradGroup.id,
      startDate: '2026-01-01',
      endDate: '2099-01-01',
      status: 'grad',
    });

    expect(repo.listCurrentMembershipsWithGroupName(idol.id).map((item) => item.groupName).sort()).toEqual([
      'Active',
      'Hiatus',
    ]);
  });

  it('persists name, member color, status, hiatus dates and Main flag', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Hinata', country: 'JP', status: 'active' });
    const groupA = repo.createGroup({ name: 'AQA', country: 'JP' });
    const groupB = repo.createGroup({ name: 'Pure Palette', country: 'JP' });

    const pink = repo.createMemberColor({ name: 'Pink', hex: '#FF9EC4' });
    const green = repo.createMemberColor({ name: 'Green', hex: '#4DB665' });

    const m1 = repo.createMembership({
      idolId: idol.id,
      groupId: groupA.id,
      startDate: '2025-11-25',
      endDate: '2026-05-05',
      name: 'Kohana Mona',
      memberColor: pink.id,
      status: 'grad',
      isMain: false,
    });
    const m2 = repo.createMembership({
      idolId: idol.id,
      groupId: groupB.id,
      startDate: '2026-07-28',
      name: 'Ichika Amu',
      memberColor: green.id,
      status: 'hiatus',
      hiatusStartDate: '2026-09-01',
      hiatusEndDate: '2026-10-01',
      isMain: true,
    });

    const fetched = repo.getMembership(m2.id);
    expect(fetched?.name).toBe('Ichika Amu');
    expect(fetched?.memberColor).toBe(green.id);
    expect(fetched?.status).toBe('active');
    expect(fetched?.hiatusStartDate).toBe('2026-09-01');
    expect(fetched?.hiatusEndDate).toBe('2026-10-01');
    expect(fetched?.isMain).toBe(true);

    const updated = repo.updateMembership(m1.id, { name: null });
    expect(updated.status).toBe('grad');
    expect(updated.endDate).toBe('2026-05-05');
    expect(updated.name).toBeNull();
    expect(updated.isMain).toBe(false);

    const listed = repo.listMembershipsByGroupAllWithGroupName(idol.id);
    expect(listed.map((m) => m.groupName).sort()).toEqual(['AQA', 'Pure Palette']);
    expect(listed.find((m) => m.id === m2.id)?.name).toBe('Ichika Amu');

    const joined = repo.listMembershipsByGroupActive(groupB.id);
    expect(joined[0].idolName).toBe('Ichika Amu');
    expect(joined[0].status).toBe('active');
  });

  it('backfills seeded member colors and dedupes by name', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const colors = repo.listMemberColors();
    expect(colors.length).toBeGreaterThanOrEqual(12);
    expect(colors.some((c) => c.name === 'Pink')).toBe(true);

    const duplicate = repo.createMemberColor({ name: 'pink', hex: '#000000' });
    const pink = repo.findMemberColor('Pink');
    expect(duplicate.id).toBe(pink?.id);
    expect(duplicate.hex).toBe('#FF9EC4');

    repo.deleteMemberColor(pink!.id);
    expect(repo.findMemberColor('Pink')).toBeNull();
  });

  it('keeps the membership name captured when the entry was created', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Hinata', country: 'JP', status: 'active' });
    const group = idolRepo.createGroup({ name: 'AQA', country: 'JP' });
    const m = idolRepo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2020-01-01', name: 'Kohana Mona' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 500 });

    const eventRepo = createEventRepo(db);
    const event = eventRepo.createEvent({
      title: 'Live',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [{ idolId: idol.id, groupMembershipId: m.id, chekiTypeId: type.id, quantity: 1, currency: 'JPY', unitPrice: 500 }],
    });

    expect(eventRepo.listEntries(event.id)[0].idolName).toBe('Kohana Mona');

    idolRepo.updateMembership(m.id, { name: 'Ichika Amu' });
    expect(eventRepo.listEntries(event.id)[0].idolName).toBe('Kohana Mona');
  });
});

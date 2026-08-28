import { seedFixture } from '@/testing/seed';
import { createEventRepo } from '@/repositories/event';
import { createAggregationService } from '../aggregation';
import { createIdolRepo } from '@/repositories/idol';

describe('aggregation service', () => {
  it('group event count counts distinct events only', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);

    // Two entries from the same group in one event → counts as 1 event.
    repo.createEvent({
      title: 'Live 1',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    // Second event → counts as another event.
    repo.createEvent({
      title: 'Live 2',
      eventDate: '2026-08-07',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const stats = createAggregationService(f.db).getGroupStats(f.groupBId);
    expect(stats.eventCount).toBe(2);
    expect(stats.chekiCount).toBe(4);
    expect(stats.spendTotals.JPY).toBe(4000);
  });

  it('group spending only counts cheki entries pointing to that membership', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);

    repo.createEvent({
      title: 'Mixed',
      eventDate: '2026-08-05',
      country: 'JP',
      ticketAmount: 5000,
      ticketCurrency: 'JPY',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const stats = createAggregationService(f.db).getGroupStats(f.groupBId);
    expect(stats.spendTotals.JPY).toBe(1000);
    expect(stats.eventCount).toBe(1);
  });

  it('returns member statistics scoped to each group membership', () => {
    const f = seedFixture();
    const idolRepo = createIdolRepo(f.db);
    const eventRepo = createEventRepo(f.db);
    const idrType = idolRepo.createChekiType({
      idolId: f.idolId,
      label: 'Indonesia',
      currency: 'IDR',
      unitPrice: 50_000,
    });

    eventRepo.createEvent({
      title: 'Former group event',
      eventDate: '2022-06-01',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipAId, chekiTypeId: f.chekiTypeAId, quantity: 4, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    eventRepo.createEvent({
      title: 'Current group event',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1000 },
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: idrType.id, quantity: 1, currency: 'IDR', unitPrice: 50_000 },
      ],
    });

    const stats = createAggregationService(f.db).getGroupMemberStats(f.groupBId);

    expect(stats[f.membershipBId]).toEqual({
      eventCount: 1,
      chekiCount: 3,
      spendTotals: { JPY: 2_000, IDR: 50_000, MYR: 0, KRW: 0, THB: 0 },
    });
    expect(stats[f.membershipAId]).toBeUndefined();
  });

  it('scopes group and member stats to the membership dates', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    const eventDates = [
      ['2019-12-31', 9],
      ['2020-01-01', 2],
      ['2022-12-31', 3],
      ['2023-01-01', 7],
    ] as const;

    for (const [eventDate, quantity] of eventDates) {
      repo.createEvent({
        title: `Group A ${eventDate}`,
        eventDate,
        country: 'JP',
        entries: [
          { idolId: f.idolId, groupMembershipId: f.membershipAId, chekiTypeId: f.chekiTypeAId, quantity, currency: 'JPY', unitPrice: 1_000 },
        ],
      });
    }

    const service = createAggregationService(f.db);
    expect(service.getGroupStats(f.groupAId)).toEqual({
      eventCount: 2,
      chekiCount: 5,
      spendTotals: { JPY: 5_000, IDR: 0, MYR: 0, KRW: 0, THB: 0 },
    });
    expect(service.getGroupMemberStats(f.groupAId)[f.membershipAId]).toEqual({
      eventCount: 2,
      chekiCount: 5,
      spendTotals: { JPY: 5_000, IDR: 0, MYR: 0, KRW: 0, THB: 0 },
    });
    expect(service.listGroupsWithStats().find((group) => group.id === f.groupAId)).toEqual(expect.objectContaining({
      eventCount: 2,
      chekiCount: 5,
      spendTotals: { JPY: 5_000, IDR: 0, MYR: 0, KRW: 0, THB: 0 },
    }));
  });

  it('event without cheki counts for home but not for idol/group', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({ title: 'No cheki', eventDate: '2026-08-05', country: 'JP', ticketAmount: 3000, ticketCurrency: 'JPY' });

    const service = createAggregationService(f.db);
    expect(service.getHomeStats().eventCount).toBe(1);
    expect(service.getIdolStats(f.idolId).eventCount).toBe(0);
    expect(service.getGroupStats(f.groupBId).eventCount).toBe(0);
  });

  it('idol cheki count and spend aggregate across groups', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'A era',
      eventDate: '2022-06-01',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipAId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    repo.createEvent({
      title: 'B era',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const stats = createAggregationService(f.db).getIdolStats(f.idolId);
    expect(stats.chekiCount).toBe(3);
    expect(stats.spendTotals.JPY).toBe(3000);
    expect(stats.eventCount).toBe(2);
  });

  it('idol spending excludes event ticket and drink costs', () => {
    const f = seedFixture();
    createEventRepo(f.db).createEvent({
      title: 'Mixed idol event',
      eventDate: '2026-08-05',
      country: 'JP',
      ticketAmount: 5_000,
      ticketCurrency: 'JPY',
      drinkAmount: 1_000,
      drinkCurrency: 'JPY',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1_000 },
      ],
    });

    const stats = createAggregationService(f.db).getIdolStats(f.idolId);

    expect(stats.spendTotals.JPY).toBe(2_000);
    expect(stats.spendTotals.IDR).toBe(0);
  });

  it('keeps idol and group spending separated by currency across events and list queries', () => {
    const f = seedFixture();
    const idolRepo = createIdolRepo(f.db);
    const eventRepo = createEventRepo(f.db);
    const idrType = idolRepo.createChekiType({
      idolId: f.idolId,
      label: 'Indonesia',
      currency: 'IDR',
      unitPrice: 100_000,
    });

    eventRepo.createEvent({
      title: 'Japan live',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    eventRepo.createEvent({
      title: 'Indonesia live',
      eventDate: '2026-08-06',
      country: 'ID',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: idrType.id, quantity: 3, currency: 'IDR', unitPrice: 100_000 },
      ],
    });

    const service = createAggregationService(f.db);
    const idolStats = service.getIdolStats(f.idolId);
    const groupStats = service.getGroupStats(f.groupBId);
    const spendByIdol = service.getIdolSpendByIdolIds([f.idolId]);
    const idolListRow = service.listIdolsWithStats().find((row) => row.id === f.idolId)!;
    const groupListRow = service.listGroupsWithStats().find((row) => row.id === f.groupBId)!;

    for (const totals of [idolStats.spendTotals, groupStats.spendTotals, spendByIdol[f.idolId], idolListRow.spendTotals, groupListRow.spendTotals]) {
      expect(totals.JPY).toBe(2000);
      expect(totals.IDR).toBe(300_000);
    }
    expect(idolStats.eventCount).toBe(2);
    expect(groupStats.eventCount).toBe(2);
    expect(idolListRow.chekiCount).toBe(5);
    expect(groupListRow.chekiCount).toBe(5);
  });

  it('includes cheki-only event spending in Home and Trip totals using each entry currency', () => {
    const f = seedFixture();
    const idolRepo = createIdolRepo(f.db);
    const eventRepo = createEventRepo(f.db);
    const idrType = idolRepo.createChekiType({ idolId: f.idolId, label: 'IDR', currency: 'IDR', unitPrice: 75_000 });

    eventRepo.createEvent({
      title: 'Cheki only JPY',
      eventDate: '2026-08-05',
      country: 'JP',
      tripId: f.tripId,
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    eventRepo.createEvent({
      title: 'Cheki only IDR',
      eventDate: '2026-08-06',
      country: 'ID',
      tripId: f.tripId,
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: idrType.id, quantity: 2, currency: 'IDR', unitPrice: 75_000 },
      ],
    });

    const service = createAggregationService(f.db);
    expect(service.getHomeStats().spendingTotals).toMatchObject({ JPY: 1000, IDR: 150_000 });
    expect(service.getTripStats(f.tripId).eventTotals).toMatchObject({ JPY: 1000, IDR: 150_000 });
    expect(service.listTripsWithStats()[0].eventTotals).toMatchObject({ JPY: 1000, IDR: 150_000 });
  });

  it('solo cheki (no membership) is not attributed to any group', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'Solo',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: null, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const service = createAggregationService(f.db);
    expect(service.getIdolStats(f.idolId).chekiCount).toBe(1);
    expect(service.getGroupStats(f.groupAId).chekiCount).toBe(0);
    expect(service.getGroupStats(f.groupBId).chekiCount).toBe(0);
  });

  it('home totals sum ticket, drink, cheki, and trip expenses per currency', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'Live',
      eventDate: '2026-08-05',
      country: 'JP',
      tripId: f.tripId,
      ticketAmount: 5000,
      ticketCurrency: 'JPY',
      drinkAmount: 600,
      drinkCurrency: 'JPY',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    createIdolRepo(f.db);

    const home = createAggregationService(f.db).getHomeStats();
    expect(home.spendingTotals.JPY).toBe(6600);
    expect(home.chekiCount).toBe(1);
    expect(home.eventCount).toBe(1);
    expect(home.tripCount).toBe(1);
  });

  it('venue visit count counts one per event; drink spend uses event snapshot', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({ title: 'V1', eventDate: '2026-08-05', country: 'JP', venueId: f.venueId, drinkAmount: 600, drinkCurrency: 'JPY' });
    repo.createEvent({ title: 'V2', eventDate: '2026-08-06', country: 'JP', venueId: f.venueId, drinkAmount: 1200, drinkCurrency: 'JPY' });
    // Not at this venue → excluded.
    repo.createEvent({ title: 'V3', eventDate: '2026-08-07', country: 'JP', drinkAmount: 600, drinkCurrency: 'JPY' });

    const stats = createAggregationService(f.db).getVenueStats(f.venueId);
    expect(stats.visitCount).toBe(2);
    expect(stats.drinkSpendTotals.JPY).toBe(1800);
  });

  it('trip stats include events and expenses; old member data does not move', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'Trip event',
      eventDate: '2026-08-05',
      country: 'JP',
      tripId: f.tripId,
      ticketAmount: 5000,
      ticketCurrency: 'JPY',
    });

    const service = createAggregationService(f.db);
    const stats = service.getTripStats(f.tripId);
    expect(stats.eventCount).toBe(1);
    expect(stats.eventTotals.JPY).toBe(5000);
    expect(stats.expenseCount).toBe(0);
  });

  it('getIdolSpendByIdolIds returns zero totals for unknown idols', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'Live',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    const service = createAggregationService(f.db);
    const byId = service.getIdolSpendByIdolIds([f.idolId, 'missing-idol']);
    expect(byId[f.idolId].JPY).toBe(2000);
    expect(byId['missing-idol']).toEqual({ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 });
    expect(service.getIdolSpendByIdolIds([])).toEqual({});
  });

  it('archived (soft-deleted) records are excluded from active aggregation', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'Old',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const service = createAggregationService(f.db);
    expect(service.getGroupStats(f.groupBId).chekiCount).toBe(1);

    createIdolRepo(f.db).deleteIdol(f.idolId);
    expect(service.getGroupStats(f.groupBId).chekiCount).toBe(1);
  });

  it('listIdolsWithStats returns stats and the current group name', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'Live 1',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    repo.createEvent({
      title: 'Live 2',
      eventDate: '2026-08-07',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const rows = createAggregationService(f.db).listIdolsWithStats();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(f.idolId);
    expect(rows[0].name).toBe('Hinata');
    expect(rows[0].groupName).toBe('Group B');
    expect(rows[0].eventCount).toBe(2);
    expect(rows[0].chekiCount).toBe(3);
    expect(rows[0].spendTotals.JPY).toBe(3000);
  });

  it('listIdolsWithStats excludes inactive idols and handles empty data', () => {
    const f = seedFixture();
    createIdolRepo(f.db).updateIdol(f.idolId, { status: 'inactive' });
    expect(createAggregationService(f.db).listIdolsWithStats()).toEqual([]);

    const empty = seedFixture();
    createIdolRepo(empty.db).updateIdol(empty.idolId, { status: 'inactive' });
    expect(createAggregationService(empty.db).listGroupsWithStats()).toHaveLength(2);
  });

  it('listGroupsWithStats aggregates cheki through memberships', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'B era',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const rows = createAggregationService(f.db).listGroupsWithStats();
    expect(rows).toHaveLength(2);
    const groupB = rows.find((g) => g.id === f.groupBId)!;
    expect(groupB.eventCount).toBe(1);
    expect(groupB.chekiCount).toBe(1);
    expect(groupB.spendTotals.JPY).toBe(1000);
    const groupA = rows.find((g) => g.id === f.groupAId)!;
    expect(groupA.eventCount).toBe(0);
    expect(groupA.chekiCount).toBe(0);
  });
});

import { createEventRepo } from '@/repositories/event';
import { createIdolRepo } from '@/repositories/idol';
import { createTripRepo } from '@/repositories/trip';
import { seedFixture } from '@/testing/seed';
import { getActivitySummary } from '../activitySummary';

describe('activity summary service', () => {
  it('aggregates the selected period for the calendar, charts, and podium', () => {
    const f = seedFixture();
    const idolRepo = createIdolRepo(f.db);
    const eventRepo = createEventRepo(f.db);
    const tripRepo = createTripRepo(f.db);
    const secondIdol = idolRepo.createIdol({ name: 'Airi', country: 'JP', status: 'active' });
    const thirdIdol = idolRepo.createIdol({ name: 'Mina', country: 'JP', status: 'active' });
    const secondType = idolRepo.createChekiType({ idolId: secondIdol.id, label: 'Normal', currency: 'JPY', unitPrice: 1000 });
    const thirdType = idolRepo.createChekiType({ idolId: thirdIdol.id, label: 'Normal', currency: 'JPY', unitPrice: 1000 });
    const idrType = idolRepo.createChekiType({ idolId: f.idolId, label: 'IDR', currency: 'IDR', unitPrice: 50_000 });

    eventRepo.createEvent({
      title: 'In range 1',
      eventDate: '2026-08-05',
      country: 'JP',
      tripId: f.tripId,
      ticketCurrency: 'JPY',
      ticketAmount: 3000,
      drinkCurrency: 'JPY',
      drinkAmount: 600,
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1000 },
        { idolId: f.idolId, groupMembershipId: null, chekiTypeId: idrType.id, quantity: 1, currency: 'IDR', unitPrice: 50_000 },
      ],
    });
    eventRepo.createEvent({
      title: 'In range 2',
      eventDate: '2026-08-06',
      country: 'JP',
      tripId: f.tripId,
      ticketCurrency: 'JPY',
      ticketAmount: 4000,
      entries: [
        { idolId: secondIdol.id, groupMembershipId: null, chekiTypeId: secondType.id, quantity: 4, currency: 'JPY', unitPrice: 1000 },
        { idolId: thirdIdol.id, groupMembershipId: null, chekiTypeId: thirdType.id, quantity: 1, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    eventRepo.createEvent({
      title: 'Outside range',
      eventDate: '2025-08-05',
      country: 'JP',
      ticketCurrency: 'JPY',
      ticketAmount: 9000,
      entries: [
        { idolId: thirdIdol.id, groupMembershipId: null, chekiTypeId: thirdType.id, quantity: 10, currency: 'JPY', unitPrice: 1000 },
      ],
    });
    tripRepo.createExpense({
      tripId: f.tripId,
      title: 'Train',
      category: 'transport',
      currency: 'JPY',
      amount: 2000,
      date: '2026-08-07',
    });

    const summary = getActivitySummary(f.db, { startDate: '2026-08-01', endDate: '2026-08-31' });

    expect(summary.eventDates).toEqual(['2026-08-05', '2026-08-06']);
    expect(summary.eventCount).toBe(2);
    expect(summary.chekiCount).toBe(8);
    expect(summary.tripCount).toBe(1);
    expect(summary.spendingTotals).toMatchObject({ JPY: 16_600, IDR: 50_000 });
    expect(summary.spendingBreakdown.JPY).toEqual([
      { key: 'ticket', label: 'Ticket', value: 7000 },
      { key: 'drink', label: 'Drink', value: 600 },
      { key: 'cheki', label: 'Cheki', value: 7000 },
      { key: 'tripExpense', label: 'Trip expense', value: 2000 },
    ]);
    expect(summary.chekiBreakdown).toEqual([
      { key: secondIdol.id, label: 'Airi', value: 4 },
      { key: f.idolId, label: 'Hinata', value: 3 },
      { key: thirdIdol.id, label: 'Mina', value: 1 },
    ]);
    expect(summary.topIdols.map((idol) => [idol.idolName, idol.chekiCount])).toEqual([
      ['Airi', 4],
      ['Hinata', 3],
      ['Mina', 1],
    ]);
  });

  it('returns empty, currency-safe sections when the selected period has no activity', () => {
    const f = seedFixture();

    const summary = getActivitySummary(f.db, { startDate: '2025-01-01', endDate: '2025-01-31' });

    expect(summary.eventDates).toEqual([]);
    expect(summary.eventCount).toBe(0);
    expect(summary.chekiCount).toBe(0);
    expect(summary.tripCount).toBe(0);
    expect(summary.spendingTotals).toEqual({ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 });
    expect(summary.spendingBreakdown).toEqual({});
    expect(summary.chekiBreakdown).toEqual([]);
    expect(summary.topIdols).toEqual([]);
  });
});

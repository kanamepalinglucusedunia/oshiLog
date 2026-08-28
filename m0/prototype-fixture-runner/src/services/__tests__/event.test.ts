import { validateEventInput, EventValidationError } from '../event';
import { seedFixture } from '@/testing/seed';
import { createIdolRepo } from '@/repositories/idol';

const validBase = (fixture: ReturnType<typeof seedFixture>) => ({
  title: 'Birthday Live',
  eventDate: '2026-08-05',
  country: 'JP',
  venueId: null,
  tripId: null,
  ticketCurrency: null,
  ticketAmount: null,
  drinkCurrency: null,
  drinkAmount: null,
  notes: null,
  entries: [],
});

describe('validateEventInput', () => {
  it('accepts a minimal valid event', () => {
    const fixture = seedFixture();
    const result = validateEventInput(fixture.db, validBase(fixture));
    expect(result.title).toBe('Birthday Live');
  });

  it('requires amount and currency snapshots to be present together', () => {
    const fixture = seedFixture();
    expect(() => validateEventInput(fixture.db, {
      ...validBase(fixture),
      ticketAmount: 1000,
      ticketCurrency: null,
    })).toThrow(/ticket currency/i);
    expect(() => validateEventInput(fixture.db, {
      ...validBase(fixture),
      drinkAmount: null,
      drinkCurrency: 'JPY',
    })).toThrow(/drink amount/i);
  });

  it('accepts different cheki type currencies within one Event', () => {
    const fixture = seedFixture();
    const idrType = createIdolRepo(fixture.db).createChekiType({
      idolId: fixture.idolId,
      label: 'IDR Type',
      currency: 'IDR',
      unitPrice: 50_000,
    });
    const result = validateEventInput(fixture.db, {
      ...validBase(fixture),
      entries: [
        {
          idolId: fixture.idolId,
          groupMembershipId: fixture.membershipBId,
          chekiTypeId: fixture.chekiTypeAId,
          quantity: 1,
          currency: 'JPY',
          unitPrice: 1000,
          photoCount: 0,
        },
        {
          idolId: fixture.idolId,
          groupMembershipId: fixture.membershipBId,
          chekiTypeId: idrType.id,
          quantity: 1,
          currency: 'IDR',
          unitPrice: 50_000,
          photoCount: 0,
        },
      ],
    });
    expect(result.entries).toHaveLength(2);
  });

  it('rejects an empty title', () => {
    const fixture = seedFixture();
    expect(() => validateEventInput(fixture.db, { ...validBase(fixture), title: '  ' })).toThrow(EventValidationError);
  });

  it('rejects an invalid date', () => {
    const fixture = seedFixture();
    expect(() => validateEventInput(fixture.db, { ...validBase(fixture), eventDate: '2026-13-99' })).toThrow(EventValidationError);
  });

  it('rejects an unknown country', () => {
    const fixture = seedFixture();
    expect(() => validateEventInput(fixture.db, { ...validBase(fixture), country: 'US' })).toThrow(EventValidationError);
  });

  it('rejects event date outside trip range', () => {
    const fixture = seedFixture();
    expect(() =>
      validateEventInput(fixture.db, { ...validBase(fixture), tripId: fixture.tripId, eventDate: '2026-09-01' }),
    ).toThrow(/trip period/);
  });

  it('accepts event date inside trip range with matching country', () => {
    const fixture = seedFixture();
    const result = validateEventInput(fixture.db, { ...validBase(fixture), tripId: fixture.tripId, eventDate: '2026-08-05' });
    expect(result.tripId).toBe(fixture.tripId);
  });

  it('rejects event whose country is not part of the trip', () => {
    const fixture = seedFixture();
    expect(() =>
      validateEventInput(fixture.db, { ...validBase(fixture), tripId: fixture.tripId, country: 'KR' }),
    ).toThrow(/trip countries/);
  });

  it('rejects a cheki type from the wrong idol', () => {
    const fixture = seedFixture();
    const otherIdol = createIdolRepo(fixture.db).createIdol({ name: 'Other', country: 'JP', status: 'active' });
    const otherType = createIdolRepo(fixture.db).createChekiType({ idolId: otherIdol.id, label: 'X', currency: 'JPY', unitPrice: 1000 });
    expect(() =>
      validateEventInput(fixture.db, {
        ...validBase(fixture),
        entries: [
          {
            idolId: fixture.idolId,
            groupMembershipId: fixture.membershipBId,
            chekiTypeId: otherType.id,
            quantity: 1,
            currency: 'JPY',
            unitPrice: 1000,
            photoCount: 0,
          },
        ],
      }),
    ).toThrow(/does not belong/);
  });

  it('rejects cheki type currency mismatch with event currency', () => {
    const fixture = seedFixture();
    expect(() =>
      validateEventInput(fixture.db, {
        ...validBase(fixture),
        entries: [
          {
            idolId: fixture.idolId,
            groupMembershipId: fixture.membershipBId,
            chekiTypeId: fixture.chekiTypeAId,
            quantity: 1,
            currency: 'KRW',
            unitPrice: 1000,
            photoCount: 0,
          },
        ],
      }),
    ).toThrow(/currency/);
  });

  it('rejects unit price that does not match the cheki type snapshot', () => {
    const fixture = seedFixture();
    expect(() =>
      validateEventInput(fixture.db, {
        ...validBase(fixture),
        entries: [
          {
            idolId: fixture.idolId,
            groupMembershipId: fixture.membershipBId,
            chekiTypeId: fixture.chekiTypeAId,
            quantity: 1,
            currency: 'JPY',
            unitPrice: 999,
            photoCount: 0,
          },
        ],
      }),
    ).toThrow(/Unit price/);
  });

  it('rejects photo count exceeding quantity', () => {
    const fixture = seedFixture();
    expect(() =>
      validateEventInput(fixture.db, {
        ...validBase(fixture),
        entries: [
          {
            idolId: fixture.idolId,
            groupMembershipId: fixture.membershipBId,
            chekiTypeId: fixture.chekiTypeAId,
            quantity: 2,
            currency: 'JPY',
            unitPrice: 1000,
            photoCount: 3,
          },
        ],
      }),
    ).toThrow(/exceed quantity/);
  });

  it('rejects a membership belonging to another idol', () => {
    const fixture = seedFixture();
    const otherIdol = createIdolRepo(fixture.db).createIdol({ name: 'Other', country: 'JP', status: 'active' });
    const otherGroup = createIdolRepo(fixture.db).createGroup({ name: 'Other Group', country: 'JP' });
    const otherMembership = createIdolRepo(fixture.db).createMembership({ idolId: otherIdol.id, groupId: otherGroup.id, startDate: '2020-01-01' });
    expect(() =>
      validateEventInput(fixture.db, {
        ...validBase(fixture),
        entries: [
          {
            idolId: fixture.idolId,
            groupMembershipId: otherMembership.id,
            chekiTypeId: fixture.chekiTypeAId,
            quantity: 1,
            currency: 'JPY',
            unitPrice: 1000,
            photoCount: 0,
          },
        ],
      }),
    ).toThrow(/does not belong/);
  });

  it('accepts a valid venue reference', () => {
    const fixture = seedFixture();
    const result = validateEventInput(fixture.db, { ...validBase(fixture), venueId: fixture.venueId });
    expect(result.venueId).toBe(fixture.venueId);
  });

  it('rejects a missing venue reference', () => {
    const fixture = seedFixture();
    expect(() => validateEventInput(fixture.db, { ...validBase(fixture), venueId: 'missing-venue' })).toThrow(/Venue/);
  });

  it('accepts a valid cheki entry', () => {
    const fixture = seedFixture();
    const result = validateEventInput(fixture.db, {
      ...validBase(fixture),
      entries: [
        {
          idolId: fixture.idolId,
          groupMembershipId: fixture.membershipBId,
          chekiTypeId: fixture.chekiTypeAId,
          quantity: 3,
          currency: 'JPY',
          unitPrice: 1000,
          photoCount: 2,
        },
      ],
    });
    expect(result.entries).toHaveLength(1);
  });
});

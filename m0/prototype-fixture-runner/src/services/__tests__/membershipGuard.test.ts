import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import {
  validateMembershipDates,
  validateMembershipForm,
  findAffectedEntries,
  listReassignmentOptions,
  applyMembershipChange,
} from '../membershipGuard';

const FORM = (startDate: string, endDate: string | null) => ({
  startDate,
  endDate,
  status: 'active' as const,
  hiatusStartDate: null,
  hiatusEndDate: null,
});

function seed(db: ReturnType<typeof createNodeTestDb>) {
  const idolRepo = createIdolRepo(db);
  const idol = idolRepo.createIdol({ name: 'Hinata', country: 'JP', status: 'active' });
  const groupA = idolRepo.createGroup({ name: 'Group A', country: 'JP' });
  const groupB = idolRepo.createGroup({ name: 'Group B', country: 'JP' });
  const m = idolRepo.createMembership({ idolId: idol.id, groupId: groupA.id, startDate: '2020-01-01', endDate: '2026-12-31' });
  idolRepo.createMembership({ idolId: idol.id, groupId: groupB.id, startDate: '2025-01-01', endDate: null });
  const type = idolRepo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 1000 });
  const repo = createEventRepo(db);
  const event = repo.createEvent({
    title: 'Live',
    eventDate: '2026-08-05',
    country: 'JP',
    entries: [{ idolId: idol.id, groupMembershipId: m.id, chekiTypeId: type.id, quantity: 1, currency: 'JPY', unitPrice: 1000 }],
  });
  return { db, idolId: idol.id, groupBId: groupB.id, membershipId: m.id, entryId: repo.listEntries(event.id)[0].id, eventId: event.id };
}

describe('validateMembershipDates', () => {
  it('accepts a valid open-ended range', () => {
    expect(validateMembershipDates({ startDate: '2020-01-01', endDate: null }).ok).toBe(true);
  });

  it('rejects end date before start date', () => {
    const result = validateMembershipDates({ startDate: '2021-01-01', endDate: '2020-12-31' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/end date/i);
  });

  it('rejects empty start date', () => {
    expect(validateMembershipDates({ startDate: '', endDate: null }).ok).toBe(false);
  });

  it('rejects malformed and impossible ISO dates', () => {
    expect(validateMembershipDates({ startDate: '2026-02-30', endDate: null }).ok).toBe(false);
    expect(validateMembershipDates({ startDate: '08/12/2026', endDate: null }).ok).toBe(false);
  });
});

describe('validateMembershipForm', () => {
  it('requires an end date for a Grad membership', () => {
    const result = validateMembershipForm({ ...FORM('2020-01-01', null), status: 'grad' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/end date/i);
  });

  it('accepts a Grad membership with an end date', () => {
    expect(validateMembershipForm({ ...FORM('2020-01-01', '2026-05-05'), status: 'grad' }).ok).toBe(true);
  });

  it('rejects hiatus end before hiatus start', () => {
    const result = validateMembershipForm({
      ...FORM('2020-01-01', null),
      status: 'hiatus',
      hiatusStartDate: '2025-05-01',
      hiatusEndDate: '2025-04-01',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/hiatus/i);
  });

  it('requires a start date for an open Hiatus and allows the end to remain empty', () => {
    expect(validateMembershipForm({ ...FORM('2020-01-01', null), status: 'hiatus' }).ok).toBe(false);
    expect(validateMembershipForm({
      ...FORM('2020-01-01', null),
      status: 'hiatus',
      hiatusStartDate: '2025-01-01',
      hiatusEndDate: null,
    }).ok).toBe(true);
  });

  it('accepts a completed hiatus only after the membership returns to Active', () => {
    expect(validateMembershipForm({
      ...FORM('2020-01-01', '2026-12-31'),
      hiatusStartDate: '2025-01-01',
      hiatusEndDate: null,
    }).ok).toBe(false);
    expect(validateMembershipForm({
      ...FORM('2020-01-01', null),
      hiatusStartDate: '2025-01-01',
      hiatusEndDate: '2025-02-01',
    }).ok).toBe(true);
    expect(validateMembershipForm({
      ...FORM('2020-01-01', '2026-12-31'),
      hiatusStartDate: '2019-12-31',
      hiatusEndDate: '2025-01-01',
    }).ok).toBe(false);
    expect(validateMembershipForm({
      ...FORM('2020-01-01', '2026-12-31'),
      hiatusStartDate: '2025-01-01',
      hiatusEndDate: '2027-01-01',
    }).ok).toBe(false);
  });
});

describe('findAffectedEntries', () => {
  it('returns entries whose event date falls outside the new range', () => {
    const { db, membershipId } = seed(createNodeTestDb());
    const affected = findAffectedEntries(db, membershipId, { startDate: '2027-01-01', endDate: null });
    expect(affected).toHaveLength(1);
    expect(affected[0].eventDate).toBe('2026-08-05');
  });

  it('returns nothing when the new range still covers the event', () => {
    const { db, membershipId } = seed(createNodeTestDb());
    expect(findAffectedEntries(db, membershipId, { startDate: '2026-01-01', endDate: null })).toHaveLength(0);
  });

  it('treats an open-ended end date as covering every later event', () => {
    const { db, membershipId } = seed(createNodeTestDb());
    expect(findAffectedEntries(db, membershipId, { startDate: '2026-01-01', endDate: null })).toHaveLength(0);
  });
});

describe('listReassignmentOptions', () => {
  it('lists other active memberships and Solo', () => {
    const { db, entryId, idolId, membershipId } = seed(createNodeTestDb());
    const entry = findAffectedEntries(db, membershipId, { startDate: '2027-01-01', endDate: null })[0];
    const options = listReassignmentOptions(db, entry, membershipId);
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(options.some((o) => o.label === 'Solo')).toBe(true);
    expect(options.some((o) => o.groupMembershipId !== null)).toBe(true);
    expect(entry.idolId).toBe(idolId);
    void entryId;
  });
});

describe('applyMembershipChange', () => {
  it('updates membership dates and reassigns entries atomically', () => {
    const fixture = seed(createNodeTestDb());
    const { db, membershipId } = fixture;
    const affected = findAffectedEntries(db, membershipId, { startDate: '2027-01-01', endDate: null });
    expect(affected).toHaveLength(1);

    const options = listReassignmentOptions(db, affected[0], membershipId);
    const target = options.find((o) => o.groupMembershipId !== null)!;

    applyMembershipChange(db, membershipId, FORM('2027-01-01', null), { [affected[0].entryId]: target.groupMembershipId });

    const membership = createIdolRepo(db).getMembership(membershipId);
    expect(membership?.startDate).toBe('2027-01-01');

    const repo = createEventRepo(db);
    const entries = repo.listEntries(fixture.eventId);
    expect(entries).toHaveLength(1);
    expect(entries[0].groupMembershipId).toBe(target.groupMembershipId);
  });

  it('converts an entry to Solo when reassigned to null', () => {
    const fixture = seed(createNodeTestDb());
    const affected = findAffectedEntries(fixture.db, fixture.membershipId, { startDate: '2027-01-01', endDate: null });
    applyMembershipChange(fixture.db, fixture.membershipId, FORM('2027-01-01', null), { [affected[0].entryId]: null });

    const entries = createEventRepo(fixture.db).listEntries(fixture.eventId);
    expect(entries[0].groupMembershipId).toBeNull();
  });
});

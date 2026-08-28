import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import { useUiStore } from '@/stores/uiStore';
import { saveIdolAggregate } from '../idolSave';

describe('saveIdolAggregate', () => {
  it('preserves hidden Grad history when Edit Idol submits only current memberships', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'History', country: 'JP', status: 'active' });
    const currentGroup = repo.createGroup({ name: 'Current', country: 'JP' });
    const formerGroup = repo.createGroup({ name: 'Former', country: 'JP' });
    const current = repo.createMembership({ idolId: idol.id, groupId: currentGroup.id, startDate: '2026-01-01' });
    const former = repo.createMembership({
      idolId: idol.id,
      groupId: formerGroup.id,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      status: 'grad',
    });

    saveIdolAggregate(db, {
      existingId: idol.id,
      core: { name: idol.name, country: 'JP', status: 'active' },
      memberships: [{ id: current.id, groupId: current.groupId, startDate: current.startDate, status: 'active' }],
      chekiTypes: [],
      reassignments: {},
    });

    expect(repo.getMembership(former.id)).toMatchObject({ status: 'grad', endDate: '2025-12-31' });
    expect(repo.listMembershipStatusPeriods(former.id)).toHaveLength(1);
  });

  it('appends Hiatus cycles, graduates immediately, and derives the global Idol status', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Cycle', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'AQA', country: 'JP' });
    const membership = repo.createMembership({
      idolId: idol.id,
      groupId: group.id,
      startDate: '2026-01-01',
      status: 'active',
      isMain: true,
    });
    const base = {
      existingId: idol.id,
      core: { name: idol.name, country: 'JP' as const, status: 'active' as const },
      chekiTypes: [],
      reassignments: {},
    };

    saveIdolAggregate(db, {
      ...base,
      memberships: [{
        id: membership.id,
        groupId: group.id,
        startDate: '2026-01-01',
        status: 'hiatus',
        hiatusStartDate: '2026-04-25',
        hiatusEndDate: null,
        isMain: true,
      }],
    });
    expect(repo.getMembership(membership.id)?.status).toBe('hiatus');
    expect(repo.getIdol(idol.id)?.status).toBe('hiatus');

    saveIdolAggregate(db, {
      ...base,
      memberships: [{
        id: membership.id,
        groupId: group.id,
        startDate: '2026-01-01',
        status: 'active',
        hiatusStartDate: '2026-04-25',
        hiatusEndDate: '2026-05-05',
        isMain: true,
      }],
    });
    expect(repo.getMembership(membership.id)?.status).toBe('active');
    expect(repo.getIdol(idol.id)?.status).toBe('active');

    saveIdolAggregate(db, {
      ...base,
      memberships: [{
        id: membership.id,
        groupId: group.id,
        startDate: '2026-01-01',
        endDate: '2026-06-01',
        status: 'grad',
        hiatusStartDate: '2026-04-25',
        hiatusEndDate: '2026-05-05',
        isMain: false,
      }],
    });

    expect(repo.getMembership(membership.id)).toMatchObject({ status: 'grad', endDate: '2026-06-01', isMain: false });
    expect(repo.getIdol(idol.id)?.status).toBe('inactive');
    expect(repo.listMembershipStatusPeriods(membership.id).map((item) => ({
      status: item.status,
      startDate: item.startDate,
      endDate: item.endDate,
    }))).toEqual([
      { status: 'active', startDate: '2026-01-01', endDate: '2026-04-25' },
      { status: 'hiatus', startDate: '2026-04-25', endDate: '2026-05-05' },
      { status: 'active', startDate: '2026-05-05', endDate: '2026-06-01' },
    ]);
  });

  it('deletes only explicitly removed, unreferenced membership episodes', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Delete guard', country: 'JP', status: 'active' });
    const groupA = repo.createGroup({ name: 'A', country: 'JP' });
    const groupB = repo.createGroup({ name: 'B', country: 'JP' });
    const removable = repo.createMembership({ idolId: idol.id, groupId: groupA.id, startDate: '2025-01-01' });
    const referenced = repo.createMembership({ idolId: idol.id, groupId: groupB.id, startDate: '2025-01-01' });
    const type = repo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 1000 });
    createEventRepo(db).createEvent({
      title: 'Referenced',
      eventDate: '2026-01-01',
      country: 'JP',
      entries: [{ idolId: idol.id, groupMembershipId: referenced.id, chekiTypeId: type.id, quantity: 1, currency: 'JPY', unitPrice: 1000 }],
    });
    const base = {
      existingId: idol.id,
      core: { name: idol.name, country: 'JP' as const, status: 'active' as const },
      memberships: [{ id: referenced.id, groupId: groupB.id, startDate: referenced.startDate, status: 'active' as const }],
      chekiTypes: [{ id: type.id, label: type.label, currency: type.currency, unitPrice: type.unitPrice }],
      reassignments: {},
    };

    saveIdolAggregate(db, { ...base, removedMembershipIds: [removable.id] });
    expect(repo.getMembership(removable.id)).toBeNull();
    expect(() => saveIdolAggregate(db, { ...base, removedMembershipIds: [referenced.id] })).toThrow(/Cheki/i);
    expect(repo.getMembership(referenced.id)).not.toBeNull();
  });

  it('rolls back a new Idol and memberships when a later Cheki Type write fails', () => {
    const db = createNodeTestDb();
    const group = createIdolRepo(db).createGroup({ name: 'G', country: 'JP' });

    expect(() => saveIdolAggregate(db, {
      core: { name: 'Atomic Idol', country: 'JP', status: 'active' },
      memberships: [{ groupId: group.id, startDate: '2020-01-01', name: 'Atomic Idol' }],
      chekiTypes: [{ label: 'Invalid', currency: 'JPY', unitPrice: -1 }],
      reassignments: {},
    })).toThrow(/price/i);

    expect(createIdolRepo(db).listIdols(true)).toHaveLength(0);
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM group_membership`)?.c).toBe(0);
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM idol_name_history`)?.c).toBe(0);
  });

  it('rolls back a core rename when a membership update fails', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Before', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'G', country: 'JP' });
    const membership = repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2020-01-01' });

    expect(() => saveIdolAggregate(db, {
      existingId: idol.id,
      core: { name: 'After', country: 'JP', status: 'active' },
      memberships: [{ id: membership.id, groupId: group.id, startDate: 'not-a-date' }],
      chekiTypes: [],
      reassignments: {},
    })).toThrow(/date/i);

    expect(repo.getIdol(idol.id)?.name).toBe('Before');
    expect(repo.getMembership(membership.id)?.startDate).toBe('2020-01-01');
    expect(repo.listIdolNameHistory(idol.id).map((item) => item.name)).not.toContain('After');
  });

  it('requires and atomically applies reassignment for entries outside a changed membership period', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'A', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'G', country: 'JP' });
    const membership = repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2020-01-01' });
    const type = repo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 1000 });
    const event = createEventRepo(db).createEvent({
      title: 'Past',
      eventDate: '2026-01-01',
      country: 'JP',
      entries: [{ idolId: idol.id, groupMembershipId: membership.id, chekiTypeId: type.id, quantity: 1, currency: 'JPY', unitPrice: 1000 }],
    });
    const entry = createEventRepo(db).listEntries(event.id)[0];
    const input = {
      existingId: idol.id,
      core: { name: 'A', country: 'JP' as const, status: 'active' as const },
      memberships: [{ id: membership.id, groupId: group.id, startDate: '2026-08-10' }],
      chekiTypes: [{ id: type.id, label: type.label, currency: type.currency, unitPrice: type.unitPrice }],
    };

    expect(() => saveIdolAggregate(db, { ...input, reassignments: {} })).toThrow(/reassignment/i);
    saveIdolAggregate(db, { ...input, reassignments: { [entry.id]: null } });

    expect(createEventRepo(db).listEntries(event.id)[0].groupMembershipId).toBeNull();
    expect(repo.getMembership(membership.id)?.startDate).toBe('2026-08-10');
  });

  it('publishes one observable invalidation for the complete aggregate save', () => {
    const db = createNodeTestDb();
    const before = useUiStore.getState().dataVersion;

    saveIdolAggregate(db, {
      core: { name: 'One render', country: 'JP', status: 'active' },
      memberships: [],
      chekiTypes: [
        { label: 'Sign', currency: 'JPY', unitPrice: 1_000 },
        { label: 'Wide', currency: 'JPY', unitPrice: 2_000 },
      ],
      reassignments: {},
    });

    expect(useUiStore.getState().dataVersion).toBe(before + 1);
  });

  it('marks the first cheki type as default when creating a new idol', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);

    const idolId = saveIdolAggregate(db, {
      core: { name: 'Default Idol', country: 'JP', status: 'active' },
      memberships: [],
      chekiTypes: [
        { label: 'Normal', currency: 'JPY', unitPrice: 1000 },
        { label: 'Special', currency: 'JPY', unitPrice: 2000 },
      ],
      reassignments: {},
    });

    expect(repo.listChekiTypes(idolId, false).map((type) => ({ label: type.label, isDefault: type.isDefault }))).toEqual([
      { label: 'Normal', isDefault: true },
      { label: 'Special', isDefault: false },
    ]);
  });
});

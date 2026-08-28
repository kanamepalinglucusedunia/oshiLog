import { fireEvent, render, screen } from '@testing-library/react-native';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import { MembershipHistoryManager } from '../MembershipHistoryManager';
import { getDb } from '@/db';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/components/ui/CountryFlag', () => ({ CountryFlag: () => null }));
jest.mock('@/db', () => ({ getDb: jest.fn() }));

beforeEach(() => {
  (getDb as jest.Mock).mockReturnValue(createNodeTestDb());
});

describe('MembershipHistoryManager', () => {
  it('lists every episode, exposes shared boundaries, and deletes only unreferenced history', async () => {
    const repo = createIdolRepo(getDb());
    const idol = repo.createIdol({ name: 'Kohana', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'AQA', country: 'JP' });
    const membership = repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2026-04-10' });
    repo.updateMembership(membership.id, {
      status: 'hiatus',
      hiatusStartDate: '2026-04-25',
      hiatusEndDate: null,
    });
    repo.replaceMembershipStatusPeriods(membership.id, [
      { status: 'active', startDate: '2026-04-10', endDate: '2026-04-25' },
      { status: 'hiatus', startDate: '2026-04-25', endDate: null },
    ]);

    await render(<MembershipHistoryManager visible idolId={idol.id} onClose={jest.fn()} />);
    expect(screen.getByText('Manage Group History')).toBeTruthy();
    expect(screen.getByLabelText('Add Membership')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Edit AQA membership'));
    expect(screen.getByLabelText('Status boundary 1')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel membership edit'));

    await fireEvent.press(screen.getByLabelText('Delete AQA membership'));
    expect(repo.getMembership(membership.id)).toBeNull();
  });

  it('disables deletion when an episode has Cheki Entries', async () => {
    const repo = createIdolRepo(getDb());
    const idol = repo.createIdol({ name: 'Kohana', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'Referenced', country: 'JP' });
    const membership = repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2026-01-01' });
    const type = repo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 1000 });
    createEventRepo(getDb()).createEvent({
      title: 'Live',
      eventDate: '2026-01-02',
      country: 'JP',
      entries: [{ idolId: idol.id, groupMembershipId: membership.id, chekiTypeId: type.id, quantity: 1, currency: 'JPY', unitPrice: 1000 }],
    });

    await render(<MembershipHistoryManager visible idolId={idol.id} onClose={jest.fn()} />);

    expect(screen.getByLabelText('Delete Referenced membership')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
    expect(screen.getByText('Has 1 Cheki Entry; edit or reassign it before changing dates.')).toBeTruthy();
  });

  it('requires explicit repair for a preserved malformed legacy timeline', async () => {
    const db = getDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Legacy', country: 'JP', status: 'inactive' });
    const group = repo.createGroup({ name: 'Legacy Group', country: 'JP' });
    const membership = repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2026-01-01' });
    db.execSync('DROP TRIGGER validate_membership_update');
    db.runSync(`UPDATE group_membership SET status = 'grad', end_date = NULL WHERE id = ?`, membership.id);
    db.runSync(`DELETE FROM group_membership_status_period WHERE group_membership_id = ?`, membership.id);

    await render(<MembershipHistoryManager visible idolId={idol.id} onClose={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Edit Legacy Group membership'));

    expect(screen.getByText(/needs explicit repair/i)).toBeTruthy();
    expect(screen.getByLabelText('Repair Timeline')).toBeTruthy();
    expect(screen.getByLabelText('Save Membership')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    );
  });
});

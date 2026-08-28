import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { SqliteLike } from '@/db/types';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import GroupDetailScreen from '../[id]';

let mockDb: SqliteLike;
let mockGroupId = '';
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

jest.mock('@/db', () => ({ getDb: () => mockDb }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockGroupId }),
  useRouter: () => mockRouter,
}));

function seedDetail() {
  const repo = createIdolRepo(mockDb);
  const eventRepo = createEventRepo(mockDb);
  const group = repo.createGroup({
    name: 'Team X',
    country: 'JP',
    region: 'Nagoya',
    debutDate: '2018-01-01',
    notes: 'A group note',
    xProfileUrl: 'https://x.com/teamx',
    tiktokProfileUrl: 'https://www.tiktok.com/@teamx',
  });
  const oldest = repo.createIdol({ name: 'Zeta', country: 'JP', status: 'active' });
  const newest = repo.createIdol({ name: 'Alpha', country: 'JP', status: 'active' });
  const formerOld = repo.createIdol({ name: 'Former Old', country: 'JP', status: 'active' });
  const formerNew = repo.createIdol({ name: 'Former New', country: 'JP', status: 'active' });
  const oldestMembership = repo.createMembership({ idolId: oldest.id, groupId: group.id, startDate: '2020-01-01' });
  const newestMembership = repo.createMembership({ idolId: newest.id, groupId: group.id, startDate: '2023-01-01' });
  repo.createMembership({ idolId: formerOld.id, groupId: group.id, startDate: '2017-01-01', endDate: '2024-01-01', status: 'grad' });
  repo.createMembership({ idolId: formerNew.id, groupId: group.id, startDate: '2018-01-01', endDate: '2025-01-01', status: 'grad' });
  const oldestType = repo.createChekiType({ idolId: oldest.id, label: 'Normal', currency: 'JPY', unitPrice: 1_000 });
  const newestType = repo.createChekiType({ idolId: newest.id, label: 'Normal', currency: 'IDR', unitPrice: 50_000 });
  eventRepo.createEvent({
    title: 'Team X Before Zeta Joined',
    eventDate: '2019-12-31',
    country: 'JP',
    entries: [
      { idolId: oldest.id, groupMembershipId: oldestMembership.id, chekiTypeId: oldestType.id, quantity: 5, currency: 'JPY', unitPrice: 1_000 },
    ],
  });
  eventRepo.createEvent({
    title: 'Team X Live',
    eventDate: '2026-08-05',
    country: 'JP',
    entries: [
      { idolId: oldest.id, groupMembershipId: oldestMembership.id, chekiTypeId: oldestType.id, quantity: 2, currency: 'JPY', unitPrice: 1_000 },
      { idolId: newest.id, groupMembershipId: newestMembership.id, chekiTypeId: newestType.id, quantity: 1, currency: 'IDR', unitPrice: 50_000 },
    ],
  });
  return { group };
}

describe('Group detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createNodeTestDb();
  });

  it('renders the Figma layout, group-scoped member stats, and social states', async () => {
    const { group } = seedDetail();
    mockGroupId = group.id;

    await render(<GroupDetailScreen />);

    expect(StyleSheet.flatten(screen.getByTestId('group-detail-header').props.style)).toEqual(expect.objectContaining({ height: 46 }));
    expect(screen.getByLabelText('Add group to favorites')).toBeTruthy();
    expect(screen.getByTestId('group-detail-content').props.contentContainerStyle).toEqual(expect.objectContaining({
      paddingTop: 8,
      gap: 16,
    }));
    expect(screen.getByText('Group Details')).toBeTruthy();
    expect(screen.getByText('Team X')).toBeTruthy();
    expect(screen.getByText('Jp')).toBeTruthy();
    const locationDivider = screen.getByTestId('group-info-location-divider');
    expect(StyleSheet.flatten(locationDivider.props.style)).toEqual(expect.objectContaining({
      width: 0,
      height: 14,
    }));
    const groupPhoto = screen.getByTestId('group-info-photo');
    expect(StyleSheet.flatten(groupPhoto.props.style)).toEqual(expect.objectContaining({
      width: 76,
      height: 76,
      borderWidth: 1,
      borderRadius: 8,
    }));
    const groupPeriod = screen.getByTestId('group-info-period');
    expect(groupPeriod.props.children).toBe('1 January 2018 - Now');
    expect(StyleSheet.flatten(groupPeriod.props.style)).toEqual(expect.objectContaining({
      color: '#7F6EB5',
      fontFamily: 'Nunito-Regular',
      fontSize: 12,
      lineHeight: 14,
    }));
    expect(screen.getByText('Listed Member (2)')).toBeTruthy();
    expect(screen.getByText('Listed Former Member (2)')).toBeTruthy();
    expect(screen.getByText('Event')).toBeTruthy();
    expect(screen.getByText('Cheki')).toBeTruthy();
    expect(screen.getByText('Spending')).toBeTruthy();
    const summarySpending = within(screen.getByTestId('group-summary-spending'));
    expect(summarySpending.getByText('JPY')).toBeTruthy();
    expect(summarySpending.getByText('¥ 2K')).toBeTruthy();
    expect(summarySpending.getByText('IDR')).toBeTruthy();
    expect(summarySpending.getByText('Rp 50K')).toBeTruthy();
    expect(screen.getByLabelText('Open X profile')).toBeTruthy();
    expect(screen.getByLabelText('Instagram profile not linked')).toBeTruthy();
    expect(screen.getByLabelText('Open TikTok profile')).toBeTruthy();

    expect(screen.getAllByLabelText(/Open member/).map((node) => node.props.accessibilityLabel)).toEqual([
      'Open member Zeta',
      'Open member Alpha',
      'Open member Former New',
      'Open member Former Old',
    ]);
    expect(within(screen.getByLabelText('Open member Zeta')).getByText(/2K/)).toBeTruthy();
    expect(screen.queryByText('New Event')).toBeNull();
    expect(screen.queryByText('Delete Group')).toBeNull();
    expect(screen.queryByLabelText('Refresh profile photo')).toBeNull();
  });

  it('keeps the empty listed-member card, hides empty former members, and hides empty notes', async () => {
    const repo = createIdolRepo(mockDb);
    const group = repo.createGroup({ name: 'Empty Team', country: 'JP' });
    mockGroupId = group.id;

    await render(<GroupDetailScreen />);

    expect(screen.getByText('Listed Member (0)')).toBeTruthy();
    expect(screen.getByText('No listed members yet.')).toBeTruthy();
    const summarySpending = within(screen.getByTestId('group-summary-spending'));
    expect(summarySpending.getByText('JPY')).toBeTruthy();
    expect(summarySpending.getByText('¥ 0')).toBeTruthy();
    expect(screen.queryByText(/Listed Former Member/)).toBeNull();
    expect(screen.queryByText('Notes')).toBeNull();
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { SqliteLike } from '@/db/types';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createEventRepo } from '@/repositories/event';
import { createIdolRepo } from '@/repositories/idol';
import IdolDetailScreen, { calculateChartTicks } from '../[id]';

let mockDb: SqliteLike;
let mockIdolId = '';
let mockInitialTab: string | undefined;
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

jest.mock('@/db', () => ({ getDb: () => mockDb }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ loop: false }),
  VideoView: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockIdolId, tab: mockInitialTab }),
  useRouter: () => mockRouter,
}));
jest.mock('@/services/media', () => ({
  importImageFromUri: jest.fn(),
  stageSourceImage: jest.fn(),
  deleteStagedFile: jest.fn(),
}));

function seedDetail() {
  const idolRepo = createIdolRepo(mockDb);
  const eventRepo = createEventRepo(mockDb);
  const idol = idolRepo.createIdol({
    name: 'Rina',
    country: 'JP',
    region: 'Tokyo',
    birthDate: '2001-05-06',
    status: 'active',
    memberColor: '#FF66AA',
  });
  const group = idolRepo.createGroup({ name: 'Moonlight', country: 'JP' });
  const membership = idolRepo.createMembership({
    idolId: idol.id,
    groupId: group.id,
    name: 'Rina',
    startDate: '2020-01-01',
    endDate: null,
    isMain: true,
  });
  const type = idolRepo.createChekiType({
    idolId: idol.id,
    label: 'Normal',
    currency: 'JPY',
    unitPrice: 1_000,
  });
  const event = eventRepo.createEvent({
    title: 'Summer Live',
    eventDate: '2026-08-10',
    country: 'JP',
    entries: [
      {
        idolId: idol.id,
        groupMembershipId: membership.id,
        chekiTypeId: type.id,
        quantity: 2,
        currency: 'JPY',
        unitPrice: 1_000,
      },
    ],
  });
  return { idol, event, type };
}

describe('Idol detail tabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createNodeTestDb();
    mockInitialTab = undefined;
  });

  it('renders the Figma summary and keeps all three tab controls available', async () => {
    const { idol } = seedDetail();
    mockIdolId = idol.id;

    await render(<IdolDetailScreen />);

    expect(screen.getAllByText('Rina').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Moonlight').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Spending').length).toBeGreaterThan(0);
    expect(screen.getByText('Member Color')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.queryByText('Recent History')).toBeNull();
    expect(screen.getByLabelText('Details tab')).toBeTruthy();
    expect(screen.getByLabelText('Cheki tab')).toBeTruthy();
    expect(screen.getByLabelText('Album tab')).toBeTruthy();
    expect(screen.queryByLabelText('Event tab')).toBeNull();
  });

  it('renders membership history with status, date, and member color formatting', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Kohana Mona', country: 'JP', status: 'active' });
    const pink = idolRepo.createMemberColor({ name: 'Pink', hex: '#FF66AA' });
    const currentGroup = idolRepo.createGroup({ name: 'Pure Palette', country: 'JP' });
    const hiatusGroup = idolRepo.createGroup({ name: 'AQA', country: 'JP' });
    const gradGroup = idolRepo.createGroup({ name: 'Pastel Note', country: 'JP' });

    const current = idolRepo.createMembership({
      idolId: idol.id,
      groupId: currentGroup.id,
      name: 'Kohana Mona',
      memberColor: pink.id,
      startDate: '2026-04-10',
      status: 'active',
    });
    idolRepo.replaceMembershipStatusPeriods(current.id, [
      { status: 'active', startDate: '2026-04-10', endDate: '2026-04-25' },
      { status: 'hiatus', startDate: '2026-04-25', endDate: '2026-05-05' },
      { status: 'active', startDate: '2026-05-05', endDate: null },
    ]);
    idolRepo.createMembership({
      idolId: idol.id,
      groupId: hiatusGroup.id,
      name: 'Kohana Mona',
      memberColor: pink.id,
      startDate: '2025-06-20',
      status: 'hiatus',
      hiatusStartDate: '2025-08-30',
    });
    idolRepo.createMembership({
      idolId: idol.id,
      groupId: gradGroup.id,
      name: 'Kohana Mona',
      startDate: '2024-09-17',
      endDate: '2025-06-20',
      status: 'grad',
    });
    mockIdolId = idol.id;

    await render(<IdolDetailScreen />);

    expect(screen.getByText('• Pure Palette')).toBeTruthy();
    expect(screen.getByText('• AQA (Hiatus)')).toBeTruthy();
    expect(screen.getByText('• Pastel Note (Grad)')).toBeTruthy();
    expect(screen.getByText('5 May 2026 – Now')).toBeTruthy();
    expect(screen.getByText('25 Apr 2026 – 5 May 2026 (Hiatus)')).toBeTruthy();
    expect(screen.getByText('10 Apr 2026 – 25 Apr 2026')).toBeTruthy();
    expect(screen.getByText('30 Aug 2025 – Now (Hiatus)')).toBeTruthy();
    expect(screen.getByText('20 Jun 2025 – 30 Aug 2025')).toBeTruthy();
    expect(screen.getByText('17 Sep 2024 – 20 Jun 2025')).toBeTruthy();
    expect(screen.getAllByText('Kohana Mona (Pink)').length).toBe(2);
    expect(screen.queryByText('• Pure Palette (Active)')).toBeNull();
    expect(screen.getByLabelText('Edit group history')).toBeTruthy();
  });

  it('opens the membership History Manager from the pencil action', async () => {
    const { idol } = seedDetail();
    mockIdolId = idol.id;

    await render(<IdolDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Edit group history'));

    expect(screen.getByText('Manage Group History')).toBeTruthy();
    expect(screen.getByLabelText('Add Membership')).toBeTruthy();
  });

  it('opens the Album dropdown and exposes the add media action', async () => {
    const { idol } = seedDetail();
    mockIdolId = idol.id;

    await render(<IdolDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Album tab'));
    await fireEvent.press(screen.getByLabelText('Album type filter: Cheki'));

    expect(screen.getAllByText('Cheki').length).toBeGreaterThan(1);
    expect(screen.getByText('Photo')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByLabelText('Add Photo')).toBeTruthy();
  });

  it('manages the default cheki type and adds a type inline', async () => {
    const { idol, type } = seedDetail();
    mockIdolId = idol.id;

    await render(<IdolDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Cheki tab'));
    await fireEvent.press(screen.getByLabelText('Manage Cheki Types'));

    expect(screen.getByTestId('popup-modal')).toBeTruthy();
    expect(screen.getByText('Manage Cheki Types')).toBeTruthy();
    expect(screen.getByDisplayValue('Normal')).toBeTruthy();
    expect(screen.getByLabelText('Add Cheki Type')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Set Normal as default'));
    expect(createIdolRepo(mockDb).getChekiType(type.id)?.isDefault).toBe(true);

    await fireEvent.press(screen.getByLabelText('Add Cheki Type'));
    expect(screen.getByPlaceholderText('Type')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Type'), 'Handshake');
    await fireEvent.changeText(screen.getByLabelText('New Cheki Type Price'), '1234567');
    expect(screen.getByLabelText('New Cheki Type Price').props.value).toBe(`¥ ${Number(1234567).toLocaleString()}`);
    await fireEvent.press(screen.getByLabelText('Add Cheki Type'));
    expect(createIdolRepo(mockDb).listChekiTypes(idol.id, false).map((type) => type.label)).toContain('Handshake');
  });

  it('opens an Idol event from the Cheki tab history', async () => {
    const { idol, event } = seedDetail();
    mockIdolId = idol.id;

    await render(<IdolDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Cheki tab'));
    await fireEvent.press(screen.getByLabelText('Cheki history: Summer Live'));

    expect(mockRouter.push).toHaveBeenCalledWith(`/event/${event.id}`);
  });

  it('keeps Cheki History controls fixed while cards scroll inside the viewport', async () => {
    const { idol } = seedDetail();
    mockIdolId = idol.id;

    await render(<IdolDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Cheki tab'));

    const viewport = screen.getByTestId('cheki-tab-viewport');
    await fireEvent(viewport, 'layout', {
      nativeEvent: { layout: { width: 343, height: 600, x: 0, y: 0 } },
    });

    const tabScroll = screen.getByTestId('cheki-tab-scroll');
    const tabScrollContentStyle = StyleSheet.flatten(tabScroll.props.contentContainerStyle);
    expect(tabScrollContentStyle.paddingBottom).toBe(82);

    const historyContainer = screen.getByTestId('cheki-history-container');
    const historyContainerStyle = StyleSheet.flatten(historyContainer.props.style);
    expect(historyContainerStyle.height).toBe(502);
    expect(screen.getByTestId('cheki-history-header')).toBeTruthy();
    expect(screen.getByTestId('cheki-history-divider')).toBeTruthy();

    const historyScroll = screen.getByTestId('cheki-history-scroll');
    expect(historyScroll.props.nestedScrollEnabled).toBe(true);
    expect(historyScroll.props.showsVerticalScrollIndicator).toBe(false);
  });

  describe('calculateChartTicks', () => {
    it('calculates tick intervals correctly for multiples of 2, 5, 10, 25, 50, 100 with max 5 lines', () => {
      expect(calculateChartTicks(4)).toEqual({ step: 2, yMax: 4, ticks: [2, 4] });
      expect(calculateChartTicks(10)).toEqual({ step: 2, yMax: 10, ticks: [2, 4, 6, 8, 10] });
      expect(calculateChartTicks(12)).toEqual({ step: 5, yMax: 15, ticks: [5, 10, 15] });
      expect(calculateChartTicks(30)).toEqual({ step: 10, yMax: 30, ticks: [10, 20, 30] });
      expect(calculateChartTicks(80)).toEqual({ step: 25, yMax: 100, ticks: [25, 50, 75, 100] });
      expect(calculateChartTicks(150)).toEqual({ step: 50, yMax: 150, ticks: [50, 100, 150] });
      expect(calculateChartTicks(300)).toEqual({ step: 100, yMax: 300, ticks: [100, 200, 300] });
      expect(calculateChartTicks(0)).toEqual({ step: 2, yMax: 4, ticks: [2, 4] });
    });
  });
});

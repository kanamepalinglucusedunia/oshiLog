import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ActivitySummary } from '@/services/activitySummary';
import type { TopIdolRow } from '@/services/dashboard';
import StatsScreen from '../stats';

const mockGetActivitySummary = jest.fn();
const mockGetMonthEventDates = jest.fn();
const mockGetEventsByDate = jest.fn();
const mockResolveIdolPhotoUris = jest.fn();
const mockRouter = { back: jest.fn(), push: jest.fn() };

jest.mock('@/db', () => ({ getDb: jest.fn(() => ({})) }));
jest.mock('@/services/activitySummary', () => ({ getActivitySummary: (...args: unknown[]) => mockGetActivitySummary(...args) }));
jest.mock('@/services/dashboard', () => ({
  getMonthEventDates: (...args: unknown[]) => mockGetMonthEventDates(...args),
  getEventsByDate: (...args: unknown[]) => mockGetEventsByDate(...args),
  resolveIdolPhotoUris: (...args: unknown[]) => mockResolveIdolPhotoUris(...args),
}));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

function topIdol(id: string, name: string, chekiCount: number): TopIdolRow {
  return {
    idolId: id,
    idolName: name,
    photoMediaId: null,
    groupName: null,
    status: 'active',
    isFavorite: false,
    chekiCount,
    eventCount: 1,
    spendTotals: { JPY: chekiCount * 1000, IDR: 0, MYR: 0, KRW: 0, THB: 0 },
    rankAmount: chekiCount * 1000,
    rankCurrency: 'JPY',
  };
}

const summary: ActivitySummary = {
  eventDates: ['2026-08-05'],
  eventCount: 1,
  chekiCount: 6,
  tripCount: 1,
  spendingTotals: { JPY: 9000, IDR: 0, MYR: 0, KRW: 0, THB: 0 },
  spendingBreakdown: {
    JPY: [
      { key: 'ticket', label: 'Ticket', value: 5000 },
      { key: 'cheki', label: 'Cheki', value: 4000 },
    ],
  },
  chekiBreakdown: [{ key: 'idol-a', label: 'Airi', value: 6 }],
  topIdols: [topIdol('idol-a', 'Airi', 6)],
};

describe('StatsScreen', () => {
  beforeEach(() => {
    mockGetActivitySummary.mockReturnValue(summary);
    mockGetMonthEventDates.mockReturnValue(['2026-08-05']);
    mockGetEventsByDate.mockReturnValue([]);
    mockResolveIdolPhotoUris.mockReturnValue(new Map());
    mockRouter.back.mockClear();
    mockRouter.push.mockClear();
  });

  it('renders the activity summary sections and allows switching the breakdown metric', async () => {
    await render(<StatsScreen />);

    expect(screen.getByText('Activity Summary')).toBeTruthy();
    expect(screen.getByText('Event calendar')).toBeTruthy();
    expect(screen.getByText('Spending breakdown')).toBeTruthy();
    expect(screen.getByText('Top Idol')).toBeTruthy();
    expect(screen.getByTestId('top-idol-rank-1')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Cheki breakdown'));
    expect(screen.getAllByText('Airi').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText('Rank 1, Airi, 6 Cheki'));
    expect(mockRouter.push).toHaveBeenCalledWith('/idol/idol-a');
  });

  it('changes the summary year and opens an event from a calendar date', async () => {
    mockGetEventsByDate.mockReturnValue([{ id: 'event-1', title: 'Summer Live', venueName: 'Tachikawa Stage' }]);
    await render(<StatsScreen />);
    const currentYear = new Date().getFullYear();
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

    await fireEvent.press(screen.getByLabelText('Previous year'));
    expect(screen.getByText(`${currentYear - 1} Replay`)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next year'));
    expect(screen.getByText(`${currentYear} Replay`)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(`${currentYear}-${currentMonth}-05`));
    expect(screen.getByText('Summer Live')).toBeTruthy();
    expect(screen.getByText('Tachikawa Stage')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Summer Live'));
    expect(mockRouter.push).toHaveBeenCalledWith('/event/event-1');
  });

  it('shows an empty podium state when the selected year has no idol activity', async () => {
    mockGetActivitySummary.mockReturnValue({ ...summary, topIdols: [], chekiBreakdown: [], chekiCount: 0 });

    await render(<StatsScreen />);

    expect(screen.getByText('No top idol yet')).toBeTruthy();
  });
});

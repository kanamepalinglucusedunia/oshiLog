import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { SqliteLike } from '@/db/types';
import { createEventRepo } from '@/repositories/event';
import { createTripRepo } from '@/repositories/trip';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import TripDetailScreen from '../[id]';

let mockDb: SqliteLike;
let mockTripId = '';
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

jest.mock('@/db', () => ({ getDb: () => mockDb }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockTripId }),
  useRouter: () => mockRouter,
}));

function seedTripDetail() {
  const trip = createTripRepo(mockDb).createTrip({
    title: 'Japan Expedition',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    description: 'Three month trip',
    countries: ['JP'],
  });
  const eventRepo = createEventRepo(mockDb);
  eventRepo.createEvent({ title: 'January Live', eventDate: '2026-01-10', country: 'JP', tripId: trip.id });
  eventRepo.createEvent({ title: 'March Live', eventDate: '2026-03-10', country: 'JP', tripId: trip.id });
  return trip;
}

describe('Trip detail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createNodeTestDb();
  });

  it('uses Figma large semibold headings and the venue-style event history', async () => {
    const trip = seedTripDetail();
    mockTripId = trip.id;

    await render(<TripDetailScreen />);

    expect(StyleSheet.flatten(screen.getByTestId('trip-detail-header').props.style)).toEqual(expect.objectContaining({ height: 46 }));
    expect(screen.getByTestId('trip-detail-content').props.contentContainerStyle).toEqual(expect.objectContaining({
      paddingTop: 8,
      gap: 16,
    }));
    for (const label of ['Japan Expedition', 'Expenses']) {
      expect(StyleSheet.flatten(screen.getByText(label).props.style)).toEqual(expect.objectContaining({
        fontFamily: 'Nunito-SemiBold',
        fontSize: 20,
        lineHeight: 24,
      }));
    }
    expect(screen.getByTestId('trip-event-history-container')).toBeTruthy();
    const historyHeader = within(screen.getByTestId('trip-event-history-header'));
    expect(StyleSheet.flatten(historyHeader.getByText('Event').props.style)).toEqual(expect.objectContaining({
      fontFamily: 'Nunito-SemiBold',
      fontSize: 20,
      lineHeight: 24,
    }));
    expect(screen.getByTestId('trip-event-history-divider')).toBeTruthy();
    expect(screen.getByLabelText('Month filter: All')).toBeTruthy();
    expect(screen.getByLabelText('Year filter: All')).toBeTruthy();
    expect(screen.getByLabelText('Sort newest first')).toBeTruthy();
    expect(screen.getByLabelText('January Live')).toBeTruthy();
    expect(screen.getByLabelText('March Live')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Month filter: All'));
    await fireEvent.press(screen.getByText('January'));
    await fireEvent.press(screen.getByLabelText('Done'));

    expect(screen.getByLabelText('January Live')).toBeTruthy();
    expect(screen.queryByLabelText('March Live')).toBeNull();
  });
});

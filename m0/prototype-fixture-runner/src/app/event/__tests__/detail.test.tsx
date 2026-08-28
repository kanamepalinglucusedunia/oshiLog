import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { SqliteLike } from '@/db/types';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createEventRepo } from '@/repositories/event';
import { createIdolRepo } from '@/repositories/idol';
import { createVenueRepo } from '@/repositories/venue';
import EventDetailScreen from '../[id]';

let mockDb: SqliteLike;
let mockEventId = '';
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };

jest.mock('@/db', () => ({ getDb: () => mockDb }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockEventId }),
  useRouter: () => mockRouter,
}));

describe('EventDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createNodeTestDb();
  });

  it('uses the combined Figma-style event card before the cheki entry cards', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const eventRepo = createEventRepo(mockDb);
    const venue = createVenueRepo(mockDb).createVenue({ name: 'Reny Limited', country: 'JP', region: 'Nagoya' });
    const idol = idolRepo.createIdol({ name: 'Ichika Amu', country: 'JP', status: 'active' });
    const group = idolRepo.createGroup({ name: 'Pure Palette', country: 'JP' });
    const membership = idolRepo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2020-01-01' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 2_000 });
    const event = eventRepo.createEvent({
      title: 'Idol Cream Soda',
      eventDate: '2025-05-22',
      country: 'JP',
      venueId: venue.id,
      ticketCurrency: 'JPY',
      ticketAmount: 1_000,
      drinkCurrency: 'JPY',
      drinkAmount: 7_000,
      entries: [
        {
          idolId: idol.id,
          groupMembershipId: membership.id,
          chekiTypeId: type.id,
          quantity: 10,
          currency: 'JPY',
          unitPrice: 2_000,
        },
      ],
    });
    mockEventId = event.id;

    await render(<EventDetailScreen />);

    expect(StyleSheet.flatten(screen.getByTestId('event-detail-header').props.style)).toEqual(expect.objectContaining({ height: 46 }));
    expect(screen.getByTestId('event-detail-content').props.contentContainerStyle).toEqual(expect.objectContaining({
      paddingTop: 8,
      gap: 16,
    }));
    expect(screen.getByTestId('event-summary-card')).toBeTruthy();
    expect(screen.getByText('Reny Limited | JP | Nagoya')).toBeTruthy();
    expect(screen.getByText('Spend')).toBeTruthy();
    expect(screen.getByText('Total ¥ 28,000')).toBeTruthy();
    expect(screen.getByText('Cheki Enties')).toBeTruthy();
    expect(screen.getByText('Ichika Amu')).toBeTruthy();
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Linking, StyleSheet } from 'react-native';
import type { SqliteLike } from '@/db/types';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createVenueRepo } from '@/repositories/venue';
import { createEventRepo } from '@/repositories/event';
import VenueDetailScreen from '../[id]';

let mockDb: SqliteLike;
let mockVenueId = '';
const mockRouter = {
  replace: jest.fn(),
  push: jest.fn(),
};

jest.mock('@/db', () => ({ getDb: () => mockDb }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/forms/CountryRegionFields', () => ({ CountryRegionFields: () => null }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockVenueId }),
  useRouter: () => mockRouter,
}));
jest.mock('@/components/ui/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text, View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    Modal: ({ visible, title, children }: { visible: boolean; title?: string; children: React.ReactNode }) => (
      visible
        ? React.createElement(View, null, title ? React.createElement(Text, null, title) : null, children)
        : null
    ),
  };
});

describe('VenueDetailScreen', () => {
  beforeEach(() => {
    mockDb = createNodeTestDb();
    mockVenueId = '';
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
  });

  it('edits the default drink price from the drink manager', async () => {
    const repo = createVenueRepo(mockDb);
    const venue = repo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    const drink = repo.createDrinkPrice({ venueId: venue.id, label: 'Drink', currency: 'JPY', price: 600, isDefault: true });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Venue actions'));
    await fireEvent.press(screen.getByLabelText('Manage drink prices'));
    await fireEvent.press(screen.getByLabelText('Edit default drink price'));
    await fireEvent.changeText(screen.getByLabelText('Drink Price'), '800');
    await fireEvent.press(screen.getByLabelText('Save Drink Price'));

    expect(repo.getDrinkPrice(drink.id)?.price).toBe(800);
  });

  it('keeps the venue detail body filling the screen below the header', async () => {
    const venue = createVenueRepo(mockDb).createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);

    expect(StyleSheet.flatten(screen.getByTestId('venue-detail-header').props.style)).toEqual(expect.objectContaining({ height: 46 }));
    expect(screen.getByTestId('venue-detail-scroll').props.contentContainerStyle).toEqual(expect.objectContaining({
      paddingTop: 8,
      gap: 16,
    }));
    const screenContent = screen.getByTestId('venue-detail-screen-content');
    expect(StyleSheet.flatten(screenContent.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
  });

  it('sets a regular drink as default from the drink manager', async () => {
    const repo = createVenueRepo(mockDb);
    const venue = repo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    const oldDefault = repo.createDrinkPrice({ venueId: venue.id, label: 'Cola', currency: 'JPY', price: 500, isDefault: true });
    const newDefault = repo.createDrinkPrice({ venueId: venue.id, label: 'Tea', currency: 'JPY', price: 600 });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Venue actions'));
    await fireEvent.press(screen.getByLabelText('Manage drink prices'));
    await fireEvent.press(screen.getByLabelText('Set drink price JPY 600 as default'));

    expect(repo.getDrinkPrice(newDefault.id)?.isDefault).toBe(true);
    expect(repo.getDrinkPrice(oldDefault.id)?.isDefault).toBe(false);
  });

  it('adds a drink price inline with the venue country currency and no label', async () => {
    const repo = createVenueRepo(mockDb);
    const venue = repo.createVenue({ name: 'Hall A', country: 'ID', region: 'Jakarta' });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Venue actions'));
    await fireEvent.press(screen.getByLabelText('Manage drink prices'));
    await fireEvent.press(screen.getByLabelText('Add drink price'));

    expect(screen.queryByText('New Drink Price')).toBeNull();
    expect(screen.getByText('Currency: IDR')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('New drink price'), '15000');
    expect(screen.getByLabelText('New drink price').props.value).toBe('15,000');
    await fireEvent.press(screen.getByLabelText('Save new drink price'));

    expect(repo.listDrinkPrices(venue.id, false)).toEqual([
      expect.objectContaining({ label: null, currency: 'IDR', price: 15000, isDefault: false }),
    ]);
  });

  it('only exposes delete for an unused drink price and never shows drink labels', async () => {
    const repo = createVenueRepo(mockDb);
    const eventRepo = createEventRepo(mockDb);
    const venue = repo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    const used = repo.createDrinkPrice({ venueId: venue.id, label: 'Cola', currency: 'JPY', price: 600 });
    const unused = repo.createDrinkPrice({ venueId: venue.id, label: 'Tea', currency: 'JPY', price: 700 });
    eventRepo.createEvent({ title: 'Live', eventDate: '2026-08-13', country: 'JP', venueId: venue.id, drinkAmount: 600, drinkCurrency: 'JPY' });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Venue actions'));
    await fireEvent.press(screen.getByLabelText('Manage drink prices'));

    expect(screen.queryByText('Cola')).toBeNull();
    expect(screen.queryByText('Tea')).toBeNull();
    expect(screen.queryByLabelText('Delete drink price JPY 600')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Delete drink price JPY 700'));

    expect(repo.getDrinkPrice(used.id)).not.toBeNull();
    expect(repo.getDrinkPrice(unused.id)).toBeNull();
  });

  it('renames a venue from the anchored overflow menu', async () => {
    const repo = createVenueRepo(mockDb);
    const venue = repo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Venue actions'));
    await fireEvent.press(screen.getByLabelText('Edit venue name'));
    await fireEvent.changeText(screen.getByLabelText('Venue name'), 'Hall Renamed');
    await fireEvent.press(screen.getByLabelText('Save venue name'));

    expect(repo.getVenue(venue.id)?.name).toBe('Hall Renamed');
  });

  it('migrates active events before deleting the source venue', async () => {
    const venueRepo = createVenueRepo(mockDb);
    const eventRepo = createEventRepo(mockDb);
    const source = venueRepo.createVenue({ name: 'Old Hall', country: 'JP', region: 'Tokyo' });
    const target = venueRepo.createVenue({ name: 'New Hall', country: 'JP', region: 'Osaka' });
    const event = eventRepo.createEvent({ title: 'Live', eventDate: '2026-08-13', country: 'JP', venueId: source.id });
    mockVenueId = source.id;

    await render(<VenueDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Venue actions'));
    await fireEvent.press(screen.getByLabelText('Delete venue'));
    await fireEvent.press(screen.getByLabelText(`Migrate venue to ${target.name}`));
    await fireEvent.press(screen.getByLabelText('Migrate & Delete'));

    expect(eventRepo.getEvent(event.id)?.venueId).toBe(target.id);
    expect(venueRepo.getVenue(source.id)).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/venues');
  });

  it('shows the location-data attribution below the saved address and opens its links', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const venue = createVenueRepo(mockDb).createVenue({
      name: 'Hall A',
      country: 'JP',
      region: 'Tokyo',
      address: '1-2-3 Ginza',
    });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);
    expect(screen.getByText('1-2-3 Ginza')).toBeTruthy();
    expect(screen.getByLabelText('Powered by Geoapify')).toBeTruthy();
    expect(screen.getByLabelText('OpenStreetMap contributors')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Powered by Geoapify'));
    await fireEvent.press(screen.getByLabelText('OpenStreetMap contributors'));
    expect(openURL).toHaveBeenCalledWith('https://www.geoapify.com/');
    expect(openURL).toHaveBeenCalledWith('https://www.openstreetmap.org/copyright');
  });

  it('hides the drink card when registered drink prices have no event assignment', async () => {
    const venueRepo = createVenueRepo(mockDb);
    const eventRepo = createEventRepo(mockDb);
    const venue = venueRepo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    venueRepo.createDrinkPrice({ venueId: venue.id, label: 'Cola', currency: 'JPY', price: 600 });
    eventRepo.createEvent({ title: 'Live', eventDate: '2026-08-13', country: 'JP', venueId: venue.id });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);

    expect(screen.queryByTestId('venue-drink-card')).toBeNull();
    expect(screen.getByTestId('venue-visit-history-container')).toBeTruthy();
  });

  it('hides the drink card when the venue has no registered drink price', async () => {
    const venue = createVenueRepo(mockDb).createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    const eventRepo = createEventRepo(mockDb);
    eventRepo.createEvent({ title: 'Custom Drink', eventDate: '2026-08-13', country: 'JP', venueId: venue.id, drinkAmount: 600, drinkCurrency: 'JPY' });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);

    expect(screen.queryByTestId('venue-drink-card')).toBeNull();
  });

  it('hides zero-valued drink assignments while keeping used drink rows', async () => {
    const venueRepo = createVenueRepo(mockDb);
    const eventRepo = createEventRepo(mockDb);
    const venue = venueRepo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    venueRepo.createDrinkPrice({ venueId: venue.id, label: 'Cola', currency: 'JPY', price: 600 });
    venueRepo.createDrinkPrice({ venueId: venue.id, label: 'Tea', currency: 'JPY', price: 700 });
    eventRepo.createEvent({ title: 'No Drink', eventDate: '2026-08-12', country: 'JP', venueId: venue.id, drinkAmount: 0, drinkCurrency: 'JPY' });
    eventRepo.createEvent({ title: 'Live', eventDate: '2026-08-13', country: 'JP', venueId: venue.id, drinkAmount: 600, drinkCurrency: 'JPY' });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);

    const drinkCard = within(screen.getByTestId('venue-drink-card'));
    expect(drinkCard.getAllByText('¥ 600').length).toBeGreaterThanOrEqual(1);
    expect(drinkCard.queryAllByText('¥ 0')).toHaveLength(0);
    expect(drinkCard.queryAllByText('¥ 700')).toHaveLength(0);
  });

  it('renders the Figma venue summary card with the visit count', async () => {
    const venue = createVenueRepo(mockDb).createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    const eventRepo = createEventRepo(mockDb);
    eventRepo.createEvent({ title: 'January Live', eventDate: '2026-01-10', country: 'JP', venueId: venue.id });
    eventRepo.createEvent({ title: 'February Live', eventDate: '2026-02-10', country: 'JP', venueId: venue.id });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);

    const summary = screen.getByTestId('venue-summary-card');
    expect(within(summary).getByText('2')).toBeTruthy();
    expect(within(summary).getByText('Visit')).toBeTruthy();
    expect(within(summary).getByText('Hall A')).toBeTruthy();
    expect(within(summary).getByText('Jp')).toBeTruthy();
    expect(within(summary).getByText('Tokyo')).toBeTruthy();
    expect(StyleSheet.flatten(summary.props.style)).toEqual(expect.objectContaining({ minHeight: 66, overflow: 'visible' }));
    const ticketDivider = within(summary).getByTestId('venue-summary-ticket-divider');
    expect(StyleSheet.flatten(ticketDivider.props.style)).toEqual(expect.objectContaining({
      left: 60,
      top: -1,
      width: 8,
      height: 65,
    }));
    const ticketAsset = within(ticketDivider).getByTestId('venue-summary-ticket-asset');
    expect(ticketAsset.props.width).toBe(10);
    expect(ticketAsset.props.height).toBe(76);
    expect(StyleSheet.flatten(ticketAsset.props.style)).toEqual(expect.objectContaining({ left: -1, top: -4 }));
    const topNotch = within(ticketAsset).getByTestId('venue-summary-ticket-top-notch');
    expect(topNotch.props.d).toBe('M9 4C9 6.20914 7.20914 8 5 8C2.79086 8 1 6.20914 1 4');
    const ticketDashes = within(ticketAsset).getByTestId('venue-summary-ticket-dashes');
    expect(ticketDashes.props.x1).toBe(5);
    expect(ticketDashes.props.y1).toBe(11);
    expect(ticketDashes.props.x2).toBe(5);
    expect(ticketDashes.props.y2).toBe(65);
    expect(ticketDashes.props.strokeDasharray).toEqual([6, 6]);
    const bottomNotch = within(ticketAsset).getByTestId('venue-summary-ticket-bottom-notch');
    expect(bottomNotch.props.d).toBe('M9 72C9 69.7909 7.20914 68 5 68C2.79086 68 1 69.7909 1 72');
    const bottomCutout = within(ticketAsset).getByTestId('venue-summary-ticket-bottom-cutout');
    expect(bottomCutout.props.cy).toBe(72);
    expect(screen.queryByText('Drink Spending')).toBeNull();
  });

  it('keeps visit history controls fixed above a bounded nested list', async () => {
    const venue = createVenueRepo(mockDb).createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    const eventRepo = createEventRepo(mockDb);
    eventRepo.createEvent({ title: 'January Live', eventDate: '2026-01-10', country: 'JP', venueId: venue.id });
    eventRepo.createEvent({ title: 'March Live', eventDate: '2026-03-10', country: 'JP', venueId: venue.id });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);
    const history = screen.getByTestId('venue-visit-history-container');
    expect(history.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flex: 1 })]));
    expect(screen.getByTestId('venue-visit-history-header')).toBeTruthy();
    expect(screen.getByTestId('venue-visit-history-divider')).toBeTruthy();

    const list = screen.getByTestId('venue-visit-history-list');
    expect(list.props.nestedScrollEnabled).toBe(true);
    expect(list.props.showsVerticalScrollIndicator).toBe(false);
    expect(screen.getByLabelText('Month filter: All')).toBeTruthy();
    expect(screen.getByLabelText('Year filter: All')).toBeTruthy();
    expect(screen.getByLabelText('Sort newest first')).toBeTruthy();
    expect(screen.getByLabelText('January Live')).toBeTruthy();
    expect(screen.getByLabelText('March Live')).toBeTruthy();
  });

  it('renders the drink card from visit snapshots and filters visit history by month', async () => {
    const venueRepo = createVenueRepo(mockDb);
    const venue = venueRepo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    venueRepo.createDrinkPrice({ venueId: venue.id, label: 'Cola', currency: 'JPY', price: 2_000 });
    venueRepo.createDrinkPrice({ venueId: venue.id, label: 'Tea', currency: 'JPY', price: 1_000 });
    const eventRepo = createEventRepo(mockDb);
    eventRepo.createEvent({ title: 'January Live', eventDate: '2026-01-10', country: 'JP', venueId: venue.id, drinkAmount: 2_000, drinkCurrency: 'JPY' });
    eventRepo.createEvent({ title: 'February Live', eventDate: '2026-02-10', country: 'JP', venueId: venue.id, drinkAmount: 2_000, drinkCurrency: 'JPY' });
    eventRepo.createEvent({ title: 'March Live', eventDate: '2026-03-10', country: 'JP', venueId: venue.id, drinkAmount: 1_000, drinkCurrency: 'JPY' });
    mockVenueId = venue.id;

    await render(<VenueDetailScreen />);

    const drinkCard = within(screen.getByTestId('venue-drink-card'));
    expect(drinkCard.getByText('Drink:')).toBeTruthy();
    expect(drinkCard.getAllByText('¥ 2,000').length).toBeGreaterThanOrEqual(1);
    expect(drinkCard.getByText('2')).toBeTruthy();
    expect(drinkCard.getByText('¥ 4,000')).toBeTruthy();
    expect(drinkCard.getByText('Total ¥ 5,000')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Month filter: All'));
    await fireEvent.press(screen.getByText('January'));
    await fireEvent.press(screen.getByLabelText('Done'));

    expect(screen.getByLabelText('January Live')).toBeTruthy();
    expect(screen.queryByLabelText('February Live')).toBeNull();
    expect(screen.queryByLabelText('March Live')).toBeNull();
  });
});

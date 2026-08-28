import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createSettingsRepo } from '@/repositories/settings';
import { createVenueRepo } from '@/repositories/venue';
import { createEventRepo } from '@/repositories/event';
import { useSettingsStore } from '@/stores/settingsStore';
import { searchVenues } from '@/services/venueSearch';
import { createOrUpdateVenue, createVenueAndMigrate, VenueForm } from '../VenueForm';
import type { VenueSearchResult } from '@/services/venueSearch';

jest.mock('@/services/venueSearch', () => ({ searchVenues: jest.fn() }));

const mockSearchVenues = searchVenues as jest.MockedFunction<typeof searchVenues>;

const SEARCH_RESULT: VenueSearchResult = {
  id: 'place-a',
  name: 'KT Zepp Yokohama',
  country: 'JP',
  region: 'Kanagawa',
  address: '5-13-1 Kannai, Nishi-ku, Yokohama',
};

const SEARCH_RESULT_NO_REGION: VenueSearchResult = {
  id: 'place-b',
  name: 'Lido Connect',
  country: 'TH',
  region: null,
  address: 'Ratchadamri Road, Pathum Wan, Bangkok',
};

let mockDb = createNodeTestDb();

jest.mock('@/db', () => ({ getDb: () => mockDb }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/forms/CountryRegionFields', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View, Text, TextInput } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    CountryRegionFields: ({ country, region, onRegionChange, regionError }: { country: string; region: string; onRegionChange: (value: string) => void; regionError?: string | null }) => React.createElement(
      View,
      null,
      React.createElement(TextInput, { accessibilityLabel: 'Country', value: country, editable: false }),
      React.createElement(TextInput, { accessibilityLabel: 'Region', value: region, onChangeText: onRegionChange }),
      regionError ? React.createElement(Text, null, regionError) : null,
    ),
  };
});

describe('VenueForm', () => {
  beforeEach(() => {
    mockDb = createNodeTestDb();
    const settings = createSettingsRepo(mockDb);
    settings.upsertCountry('JP', true);
    useSettingsStore.setState({
      settings: settings.getSettings(),
      countries: settings.getCountries(),
      loaded: true,
      loadError: null,
    });
  });

  it('renders the Figma fields and submits required values', async () => {
    const onSubmit = jest.fn();
    await render(<VenueForm onSubmit={onSubmit} />);

    expect(screen.getByText('Basic Info')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Venue Name')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. 600')).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Venue Name'), 'Hall A');
    await fireEvent.changeText(screen.getByLabelText('Region'), 'Tokyo');
    await fireEvent.press(screen.getByLabelText('Save Venue'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      name: 'Hall A',
      country: 'JP',
      region: 'Tokyo',
      address: '',
      drinkPrice: '',
    }));
  });

  it('requires a region before submitting', async () => {
    const onSubmit = jest.fn();
    await render(<VenueForm onSubmit={onSubmit} />);

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Venue Name'), 'Hall A');
    await fireEvent.press(screen.getByLabelText('Save Venue'));

    expect(await screen.findByText('Region is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('persists the optional default drink price using the venue country currency', () => {
    const venue = createOrUpdateVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo', drinkPrice: '600' });
    expect(createVenueRepo(mockDb).listDrinkPrices(venue.id, false)).toEqual([
      expect.objectContaining({ label: null, currency: 'JPY', price: 600, isDefault: true }),
    ]);
  });

  it('updates the explicit default instead of a regular drink named Drink', () => {
    const repo = createVenueRepo(mockDb);
    const venue = repo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    const regularDrink = repo.createDrinkPrice({ venueId: venue.id, label: 'Drink', currency: 'JPY', price: 500 });
    const defaultDrink = repo.createDrinkPrice({ venueId: venue.id, label: 'House special', currency: 'JPY', price: 700, isDefault: true });

    createOrUpdateVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo', drinkPrice: '800' }, venue.id);

    expect(repo.getDrinkPrice(defaultDrink.id)?.price).toBe(800);
    expect(repo.getDrinkPrice(regularDrink.id)?.price).toBe(500);
  });

  it('persists the address through createOrUpdateVenue', () => {
    const venue = createOrUpdateVenue({
      name: 'Hall A',
      country: 'JP',
      region: 'Tokyo',
      address: '1-2-3 Ginza, Chuo-ku',
      drinkPrice: '',
    });
    expect(createVenueRepo(mockDb).getVenue(venue.id)?.address).toBe('1-2-3 Ginza, Chuo-ku');
  });

  it('migration flow receives the complete VenueFormValues payload including address', () => {
    const repo = createVenueRepo(mockDb);
    const eventRepo = createEventRepo(mockDb);
    const source = repo.createVenue({ name: 'Old Hall', country: 'JP', region: 'Tokyo' });
    const event = eventRepo.createEvent({ title: 'Live', eventDate: '2026-08-13', country: 'JP', venueId: source.id });

    const target = createVenueAndMigrate(
      { name: 'New Hall', country: 'JP', region: 'Osaka', address: '2-2-2 Namba', drinkPrice: '' },
      source.id,
    );

    expect(target.address).toBe('2-2-2 Namba');
    expect(eventRepo.getEvent(event.id)?.venueId).toBe(target.id);
    expect(repo.getVenue(source.id)).toBeNull();
  });
});

describe('VenueForm venue search integration', () => {
  beforeEach(() => {
    mockDb = createNodeTestDb();
    const settings = createSettingsRepo(mockDb);
    settings.upsertCountry('JP', true);
    settings.upsertCountry('TH', true);
    useSettingsStore.setState({
      settings: settings.getSettings(),
      countries: settings.getCountries(),
      loaded: true,
      loadError: null,
    });
    jest.useFakeTimers();
    mockSearchVenues.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function settleSearch() {
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('renders the Find venue or address button and no search UI until pressed', async () => {
    await render(<VenueForm onSubmit={jest.fn()} />);

    expect(screen.getByLabelText('Find venue or address')).toBeTruthy();
    expect(screen.queryByLabelText('Venue search')).toBeNull();
    expect(screen.queryByPlaceholderText('Search by venue name or address')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Find venue or address'));

    expect(screen.getByLabelText('Venue search')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search by venue name or address')).toBeTruthy();
  });

  it('never sends provider requests from the manual Venue Name field and opens an empty search field', async () => {
    await render(<VenueForm onSubmit={jest.fn()} />);

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Venue Name'), 'Zepp');
    await settleSearch();
    expect(mockSearchVenues).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('e.g. Venue Name').props.value).toBe('Zepp');

    await fireEvent.press(screen.getByLabelText('Find venue or address'));
    expect(screen.getByLabelText('Venue search').props.value).toBe('');
    expect(mockSearchVenues).not.toHaveBeenCalled();
  });

  it('closing search without selecting leaves every form value unchanged', async () => {
    mockSearchVenues.mockResolvedValue({ ok: true, results: [SEARCH_RESULT] });
    await render(<VenueForm onSubmit={jest.fn()} />);

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Venue Name'), 'Manual Hall');
    await fireEvent.changeText(screen.getByLabelText('Region'), 'Tokyo');
    await fireEvent.press(screen.getByLabelText('Find venue or address'));
    await fireEvent.changeText(screen.getByLabelText('Venue search'), 'Zepp');
    await settleSearch();
    await fireEvent.press(screen.getByLabelText('Enter manually'));

    expect(screen.getByPlaceholderText('e.g. Venue Name').props.value).toBe('Manual Hall');
    expect(screen.getByLabelText('Country').props.value).toBe('JP');
    expect(screen.getByLabelText('Region').props.value).toBe('Tokyo');
    expect(screen.getByLabelText('Venue Address').props.value).toBe('');
  });

  it('selecting a complete result fills all four fields without auto-submitting', async () => {
    mockSearchVenues.mockResolvedValue({ ok: true, results: [SEARCH_RESULT] });
    const onSubmit = jest.fn();
    await render(<VenueForm onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByLabelText('Find venue or address'));
    await fireEvent.changeText(screen.getByLabelText('Venue search'), 'Zepp');
    await settleSearch();
    await fireEvent.press(screen.getByLabelText(`${SEARCH_RESULT.name}, ${SEARCH_RESULT.address}`));

    expect(screen.getByPlaceholderText('e.g. Venue Name').props.value).toBe(SEARCH_RESULT.name);
    expect(screen.getByLabelText('Country').props.value).toBe('JP');
    expect(screen.getByLabelText('Region').props.value).toBe('Kanagawa');
    expect(screen.getByLabelText('Venue Address').props.value).toBe(SEARCH_RESULT.address);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps selected values editable and persists edited values including address', async () => {
    mockSearchVenues.mockResolvedValue({ ok: true, results: [SEARCH_RESULT] });
    const onSubmit = jest.fn();
    await render(<VenueForm onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByLabelText('Find venue or address'));
    await fireEvent.changeText(screen.getByLabelText('Venue search'), 'Zepp');
    await settleSearch();
    await fireEvent.press(screen.getByLabelText(`${SEARCH_RESULT.name}, ${SEARCH_RESULT.address}`));

    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Venue Name'), 'Edited Hall');
    await fireEvent.changeText(screen.getByLabelText('Venue Address'), 'Edited address 9-9-9');

    await fireEvent.press(screen.getByLabelText('Save Venue'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      name: 'Edited Hall',
      country: 'JP',
      region: 'Kanagawa',
      address: 'Edited address 9-9-9',
      drinkPrice: '',
    }));
  });

  it('shows the missing-Region notice and blocks Save when the result has no region', async () => {
    mockSearchVenues.mockResolvedValue({ ok: true, results: [SEARCH_RESULT_NO_REGION] });
    const onSubmit = jest.fn();
    await render(<VenueForm onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByLabelText('Find venue or address'));
    await fireEvent.changeText(screen.getByLabelText('Venue search'), 'Lido');
    await settleSearch();
    await fireEvent.press(screen.getByLabelText(`${SEARCH_RESULT_NO_REGION.name}, ${SEARCH_RESULT_NO_REGION.address}`));

    expect(screen.getByText('Region was not provided. Select it before saving.')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Venue Name').props.value).toBe(SEARCH_RESULT_NO_REGION.name);
    expect(screen.getByLabelText('Country').props.value).toBe('TH');
    expect(screen.getByLabelText('Venue Address').props.value).toBe(SEARCH_RESULT_NO_REGION.address);

    await fireEvent.press(screen.getByLabelText('Save Venue'));
    expect(await screen.findByText('Region is required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

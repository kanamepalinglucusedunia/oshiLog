import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet } from 'react-native';
import type { SqliteLike } from '@/db/types';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import { createVenueRepo } from '@/repositories/venue';
import { createTripRepo } from '@/repositories/trip';
import { createRegionRepo } from '@/repositories/region';
import { createSettingsRepo } from '@/repositories/settings';
import { useSettingsStore } from '@/stores/settingsStore';
import { RED_SCALE } from '@/design-system/colors';
import { EventForm } from '../EventForm';
import { cropImageUri, importImageFromUri } from '@/services/media';
import { detectInstaxFromUri } from '@/services/instaxDetect';
import * as ImagePicker from 'expo-image-picker';
import { todayISO } from '@/utils/date';

let mockDb: SqliteLike;

jest.mock('@/db', () => ({ getDb: () => mockDb }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/components/ui/CountryFlag', () => ({ CountryFlag: () => null }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/services/media', () => ({
  importImageFromUri: jest.fn(),
  cropImageUri: jest.fn(async (uri: string) => uri),
}));
jest.mock('@/services/instaxDetect', () => ({
  detectInstaxFromUri: jest.fn(),
  INSTAX_PRESETS: [
    { key: 'auto', label: 'Auto' },
    { key: 'mini', label: 'Mini' },
    { key: 'square', label: 'Square' },
    { key: 'wide', label: 'Wide' },
  ],
}));
jest.mock('@/services/instaxEnhance', () => ({
  enhanceInstaxUri: jest.fn(async (uri: string) => uri),
}));

describe('EventForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('keeps the form list keyboard-aware and blurs before opening a picker', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    try {
      const view = await render(<EventForm />);
      const list = view.getByTestId('event-form-list');

      expect(StyleSheet.flatten(list.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
      expect(list?.props.scrollsChildToFocus).toBe(true);
      expect(list?.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');

      await fireEvent(screen.getByPlaceholderText('Price'), 'focus');
      await fireEvent.press(screen.getByLabelText('Add cheki entry'));
      await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));

      expect(dismiss).toHaveBeenCalledTimes(3);
      expect(screen.getByPlaceholderText('Search')).toBeTruthy();
      expect(StyleSheet.flatten(screen.getByTestId('event-idol-picker-layout').props.style)).toEqual(
        expect.objectContaining({ gap: 8 }),
      );
      expect(screen.getByText('New Idol')).toBeTruthy();
      view.unmount();
    } finally {
      dismiss.mockRestore();
    }
  });

  it('creates an Event without a Trip and snapshots the selected Cheki price', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    const onSaved = jest.fn();

    const view = await render(<EventForm onSaved={onSaved} />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Idol Cream Soda Vol. 2'), 'No Trip Live');
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1'));
    await fireEvent.press(screen.getByText('2 Shot'));
    await fireEvent.press(screen.getByLabelText('Save Event'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const event = createEventRepo(mockDb).listEvents()[0];
    expect(event).toMatchObject({ title: 'No Trip Live', tripId: null });
    expect(createEventRepo(mockDb).listEntries(event.id)[0]).toMatchObject({
      chekiTypeId: type.id,
      currency: 'JPY',
      unitPrice: 1500,
    });
    view.unmount();
  });

  it('preselects the idol default cheki type for a new event entry', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    idolRepo.createChekiType({ idolId: idol.id, label: 'Normal', currency: 'JPY', unitPrice: 1500, isDefault: true });

    const view = await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));

    expect(screen.getByText('Normal (¥ 1.5K)')).toBeTruthy();
    view.unmount();
  });

  it('preselects the venue default drink for a new event', async () => {
    const venueRepo = createVenueRepo(mockDb);
    const venue = venueRepo.createVenue({ name: 'Hall A', country: 'JP', region: 'Tokyo' });
    venueRepo.createDrinkPrice({ venueId: venue.id, label: 'House drink', currency: 'JPY', price: 600, isDefault: true });
    const onSaved = jest.fn();

    const view = await render(<EventForm onSaved={onSaved} />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Idol Cream Soda Vol. 2'), 'Default Drink Live');
    await fireEvent.press(screen.getByLabelText('Select venue'));
    await fireEvent.press(screen.getByText('Hall A'));
    await fireEvent.press(screen.getByLabelText('Save Event'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(createEventRepo(mockDb).listEvents()[0]).toMatchObject({ drinkAmount: 600, drinkCurrency: 'JPY' });
    view.unmount();
  });

  it('keeps invalid ticket input visible and does not save it as an empty amount', async () => {
    const onSaved = jest.fn();
    const view = await render(<EventForm onSaved={onSaved} />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Idol Cream Soda Vol. 2'), 'Invalid Ticket');
    await fireEvent.changeText(screen.getByPlaceholderText('Price'), '12.50');
    await fireEvent.press(screen.getByLabelText('Save Event'));

    expect(await screen.findByText('Invalid ticket amount.')).toBeTruthy();
    expect(screen.getByDisplayValue('12.50')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(createEventRepo(mockDb).listEvents()).toHaveLength(0);
    view.unmount();
  });

  it('uses the event date card and attaches or detaches the trip covering that date', async () => {
    const tripRepo = createTripRepo(mockDb);
    const eventDate = todayISO();
    tripRepo.createTrip({ title: 'Jakarta Live Trip', startDate: eventDate, endDate: eventDate, countries: ['JP'] });

    const view = await render(<EventForm />);
    expect(screen.getByLabelText('Event date')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Event date'));
    expect(screen.getByLabelText('Save')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save'));

    expect(screen.getByLabelText('Attach Trip')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Attach Trip'));
    expect(screen.getByText('Jakarta Live Trip')).toBeTruthy();
    expect(screen.getByLabelText('Detach trip Jakarta Live Trip')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Detach trip Jakarta Live Trip'));
    expect(screen.getByLabelText('Attach Trip')).toBeTruthy();
    view.unmount();
  });

  it('opens a trip choice popup when several trips cover the event date', async () => {
    const tripRepo = createTripRepo(mockDb);
    const eventDate = todayISO();
    tripRepo.createTrip({ title: 'Trip A', startDate: eventDate, endDate: eventDate, countries: ['JP'] });
    tripRepo.createTrip({ title: 'Trip B', startDate: eventDate, endDate: eventDate, countries: ['JP'] });

    const view = await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Attach Trip'));
    expect(screen.getByText('Select Trip')).toBeTruthy();
    expect(screen.getByText('Trip A')).toBeTruthy();
    expect(screen.getByText('Trip B')).toBeTruthy();
    await fireEvent.press(screen.getByText('Trip B'));
    expect(screen.getByLabelText('Detach trip Trip B')).toBeTruthy();
    view.unmount();
  });

  it('provides a searchable venue picker scoped by the current location filters', async () => {
    const venueRepo = createVenueRepo(mockDb);
    venueRepo.createVenue({ name: 'Tokyo Hall', country: 'JP', region: 'Tokyo' });
    venueRepo.createVenue({ name: 'Seoul Hall', country: 'KR', region: 'Seoul' });

    const view = await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Select venue'));
    expect(StyleSheet.flatten(screen.getByTestId('event-venue-picker-layout').props.style)).toEqual(
      expect.objectContaining({ gap: 8 }),
    );
    expect(screen.getByPlaceholderText('Search')).toBeTruthy();
    expect(screen.getByText('Tokyo Hall')).toBeTruthy();
    expect(screen.getByText('Seoul Hall')).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText('Search'), 'Seoul');
    expect(screen.getByText('Seoul Hall')).toBeTruthy();
    expect(screen.queryByText('Tokyo Hall')).toBeNull();
    expect(screen.getByText('New Venue')).toBeTruthy();
    view.unmount();
  });

  it('fills country after selecting a region first', async () => {
    const settings = createSettingsRepo(mockDb);
    settings.upsertCountry('KR', true);
    createRegionRepo(mockDb).createRegion({ country: 'KR', name: 'Seoul' });
    useSettingsStore.setState({ countries: settings.getCountries(), settings: settings.getSettings() });

    const view = await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Region'));
    await fireEvent.press(screen.getByText('Seoul'));

    expect(screen.getByText('Seoul')).toBeTruthy();
    expect(screen.getByText('Korea')).toBeTruthy();
    view.unmount();
  });

  it('only renders a drink field for venues with active drinks and makes multiple drinks selectable', async () => {
    const venueRepo = createVenueRepo(mockDb);
    const noDrink = venueRepo.createVenue({ name: 'No Drink Hall', country: 'JP', region: 'Tokyo' });
    const oneDrink = venueRepo.createVenue({ name: 'One Drink Hall', country: 'JP', region: 'Tokyo' });
    venueRepo.createDrinkPrice({ venueId: oneDrink.id, label: 'House', currency: 'JPY', price: 600 });
    const manyDrinks = venueRepo.createVenue({ name: 'Many Drink Hall', country: 'JP', region: 'Tokyo' });
    venueRepo.createDrinkPrice({ venueId: manyDrinks.id, label: 'House', currency: 'JPY', price: 600, isDefault: true });
    venueRepo.createDrinkPrice({ venueId: manyDrinks.id, label: 'Premium', currency: 'JPY', price: 1200 });

    const view = await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Select venue'));
    await fireEvent.press(screen.getByText(noDrink.name));
    expect(screen.queryByText('Drink')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Select venue'));
    await fireEvent.press(screen.getByText(oneDrink.name));
    expect(screen.getByText(/600/)).toBeTruthy();
    expect(screen.queryByLabelText('Select drink')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Select venue'));
    await fireEvent.press(screen.getByText(manyDrinks.name));
    expect(screen.getByText(/600/)).toBeTruthy();
    expect(screen.getByLabelText('Select drink')).toBeTruthy();
    view.unmount();
  });

  it('creates a new idol in a popup and selects it for the current cheki entry', async () => {
    const view = await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByText('New Idol'));

    expect(screen.getByText('New Idol')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Idol Name'), 'Popup Idol');
    await fireEvent.press(screen.getByLabelText('Create & Use'));

    await waitFor(() => expect(createIdolRepo(mockDb).listIdols(true).some((idol) => idol.name === 'Popup Idol')).toBe(true));
    expect(screen.getByText('Popup Idol')).toBeTruthy();
    expect(screen.queryByLabelText('Create & Use')).toBeNull();
    view.unmount();
  });

  it('opens the batch crop editor for picked cheki photos before importing', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///cheki-a.jpg', width: 400, height: 300 },
        { uri: 'file:///cheki-b.jpg', width: 400, height: 300 },
      ],
    });
    const importMock = importImageFromUri as jest.Mock;
    importMock.mockImplementation(async (_db: unknown, uri: string) => ({
      assetId: `asset-${uri}`,
      deduplicated: false,
      width: 400,
      height: 300,
    }));

    await render(<EventForm />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Idol Cream Soda Vol. 2'), 'Cheki Crop Live');
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1'));
    await fireEvent.press(screen.getByText('2 Shot'));

    // Two cheki photos are allowed when the quantity is 2.
    await fireEvent.changeText(screen.getByLabelText('Cheki Quantity'), '2');

    // Pick two photos → the batch crop editor opens before any import.
    await fireEvent.press(screen.getByLabelText('Add photos for Cheki 1'));
    expect(screen.getByLabelText('Done cropping')).toBeTruthy();
    expect(screen.getByText('Photo 1 of 2')).toBeTruthy();
    expect(importMock).not.toHaveBeenCalled();

    // Done applies the crops and imports both cheki photos.
    await fireEvent.press(screen.getByLabelText('Done cropping'));
    await waitFor(() => expect(importMock).toHaveBeenCalledTimes(2));
    expect(importMock).toHaveBeenCalledWith(expect.anything(), 'file:///cheki-a.jpg', 'cheki', expect.objectContaining({ instaxPreset: 'mini' }));
    expect(importMock).toHaveBeenCalledWith(expect.anything(), 'file:///cheki-b.jpg', 'cheki', expect.objectContaining({ instaxPreset: 'mini' }));
    expect(screen.queryByLabelText('Done cropping')).toBeNull();
  });

  it('drops the picked cheki photos without importing when crop is cancelled', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cheki-a.jpg', width: 400, height: 300 }],
    });

    await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1'));
    await fireEvent.press(screen.getByText('2 Shot'));

    await fireEvent.press(screen.getByLabelText('Add photos for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Cancel crop'));
    expect(importImageFromUri).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Done cropping')).toBeNull();
  });

  it('shows a cheki photo as soon as import attaches it, without waiting for the import promise', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cheki-early.jpg', width: 400, height: 300 }],
    });

    let finishImport!: () => void;
    (importImageFromUri as jest.Mock).mockImplementation(async (_db: unknown, _uri: string, _kind: string, options?: {
      onImported?: (assetId: string, result: { deduplicated: boolean }) => void;
    }) => {
      options?.onImported?.('asset-early', { deduplicated: false });
      return new Promise((resolve) => {
        finishImport = () => resolve({ assetId: 'asset-early', deduplicated: false, width: 400, height: 300 });
      });
    });

    await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1'));
    await fireEvent.press(screen.getByText('2 Shot'));
    await fireEvent.press(screen.getByLabelText('Add photos for Cheki 1'));

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Done cropping'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByLabelText('Cheki photo 1')).toBeTruthy());
    expect(screen.queryByLabelText('Done cropping')).toBeNull();

    finishImport();
    await waitFor(() => expect(importImageFromUri).toHaveBeenCalledTimes(1));
  });

  it('opens an existing cheki photo for re-cropping and only the delete button removes it', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    const eventRepo = createEventRepo(mockDb);
    eventRepo.insertMediaAsset({
      id: 'existing-cheki',
      kind: 'cheki',
      contentHash: 'existing-cheki-hash',
      mimeType: 'image/jpeg',
      fileSize: 1,
      width: 400,
      height: 300,
      localPath: 'file:///existing-cheki.jpg',
      instaxPreset: 'mini',
    });
    const event = eventRepo.createEvent({
      title: 'Existing Cheki',
      eventDate: todayISO(),
      country: 'JP',
      entries: [{
        idolId: idol.id,
        chekiTypeId: type.id,
        quantity: 1,
        currency: 'JPY',
        unitPrice: 1500,
        photos: [{ mediaAssetId: 'existing-cheki' }],
      }],
    });

    await render(<EventForm initial={event} />);

    await fireEvent.press(screen.getByLabelText('Cheki photo 1'));
    expect(screen.getByLabelText('Done cropping')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel crop'));
    expect(screen.getByLabelText('Cheki photo 1')).toBeTruthy();

    const deleteStyle = StyleSheet.flatten(screen.getByLabelText('Delete Cheki photo 1').props.style);
    expect(deleteStyle).toEqual(expect.objectContaining({
      backgroundColor: RED_SCALE.R50,
      borderRadius: 999,
      width: 18,
      height: 18,
      padding: 3,
    }));

    await fireEvent.press(screen.getByLabelText('Delete Cheki photo 1'));
    expect(screen.queryByLabelText('Cheki photo 1')).toBeNull();
  });

  it('passes a 90 degree rotation into the persisted cheki import', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cheki-rotated.jpg', width: 400, height: 300 }],
    });
    (importImageFromUri as jest.Mock).mockResolvedValue({
      assetId: 'asset-rotated',
      deduplicated: false,
      width: 300,
      height: 400,
    });

    await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1'));
    await fireEvent.press(screen.getByText('2 Shot'));
    await fireEvent.press(screen.getByLabelText('Add photos for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Rotate image'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    await waitFor(() => expect(importImageFromUri).toHaveBeenCalledWith(
      expect.anything(),
      'file:///cheki-rotated.jpg',
      'cheki',
      expect.objectContaining({
        instaxPreset: 'mini',
        transform: { rotateDegrees: 90 },
      }),
    ));
    expect(cropImageUri).not.toHaveBeenCalled();
  });

  it('uses the selected Instax preset for the entry photo shape', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cheki-square.jpg', width: 400, height: 300 }],
    });
    const eventRepo = createEventRepo(mockDb);
    (importImageFromUri as jest.Mock).mockImplementation(async () => {
      eventRepo.insertMediaAsset({
        id: 'asset-square',
        kind: 'cheki',
        contentHash: 'square-hash',
        mimeType: 'image/jpeg',
        fileSize: 1,
        width: 800,
        height: 600,
        localPath: 'file:///cheki-square.jpg',
        instaxPreset: 'square',
      });
      return { assetId: 'asset-square', deduplicated: false, width: 800, height: 600 };
    });

    await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1'));
    await fireEvent.press(screen.getByText('2 Shot'));
    await fireEvent.press(screen.getByLabelText('Add photos for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Card size Square'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    await waitFor(() => expect(importImageFromUri).toHaveBeenCalledWith(
      expect.anything(),
      'file:///cheki-square.jpg',
      'cheki',
      expect.objectContaining({ instaxPreset: 'square' }),
    ));
    expect(screen.getByText('Remove Entry')).toBeTruthy();
    const photoStyle = StyleSheet.flatten(screen.getByLabelText('Cheki photo 1').props.style);
    expect(photoStyle).toEqual(expect.objectContaining({ width: 119, height: 100 }));
  });

  it('auto-detects the instax card from the crop editor', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cheki-a.jpg', width: 400, height: 300 }],
    });
    const detectMock = detectInstaxFromUri as jest.Mock;
    detectMock.mockResolvedValue({ quad: { tl: { x: 0.1, y: 0.1 }, tr: { x: 0.9, y: 0.1 }, br: { x: 0.9, y: 0.9 }, bl: { x: 0.1, y: 0.9 } }, confidence: 1 });

    await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1'));
    await fireEvent.press(screen.getByText('2 Shot'));

    await fireEvent.press(screen.getByLabelText('Add photos for Cheki 1'));
    await act(async () => {
      fireEvent(screen.getByTestId('crop-preview'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });
      fireEvent.press(screen.getByLabelText('Auto-detect instax card'));
    });
    await waitFor(() => expect(detectMock).toHaveBeenCalledWith('file:///cheki-a.jpg', 'mini'));
    // If detection returned null the editor would surface this instead of handles.
    expect(screen.queryByText('No mini instax card detected. Adjust the perspective corners manually.')).toBeNull();
    // Sanity: perspective mode becomes active (quad filled).
    await waitFor(() => expect(screen.getByLabelText('Switch to perspective mode').props.accessibilityState?.selected).toBe(true));
    expect(await screen.findByLabelText('Perspective handle top-left')).toBeTruthy();
  });

  it('keeps an applied perspective preview when Done is pressed afterward', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 1500 });
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cheki-a.jpg', width: 400, height: 300 }],
    });
    (detectInstaxFromUri as jest.Mock).mockResolvedValue({
      quad: { tl: { x: 0.1, y: 0.1 }, tr: { x: 0.9, y: 0.1 }, br: { x: 0.9, y: 0.9 }, bl: { x: 0.1, y: 0.9 } },
      confidence: 1,
    });
    (cropImageUri as jest.Mock).mockResolvedValue('file:///cheki-a-cropped.jpg');
    (importImageFromUri as jest.Mock).mockResolvedValue({ assetId: 'asset-cropped', deduplicated: false });

    await render(<EventForm />);
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Yui (Solo)'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1'));
    await fireEvent.press(screen.getByText('2 Shot'));
    await fireEvent.press(screen.getByLabelText('Add photos for Cheki 1'));
    await act(async () => {
      fireEvent(screen.getByTestId('crop-preview'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });
      fireEvent.press(screen.getByLabelText('Auto-detect instax card'));
    });
    await screen.findByLabelText('Perspective handle top-left');

    await fireEvent.press(screen.getByLabelText('Apply'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    await waitFor(() => expect(importImageFromUri).toHaveBeenCalledWith(
      expect.anything(),
      'file:///cheki-a-cropped.jpg',
      'cheki',
      expect.any(Object),
    ));
  });

  it('allows adding and removing multiple cheki type options for a single idol entry', async () => {
    const idolRepo = createIdolRepo(mockDb);
    const idol = idolRepo.createIdol({ name: 'Ichika', country: 'JP', status: 'active' });
    const type1 = idolRepo.createChekiType({ idolId: idol.id, label: '2 Shot', currency: 'JPY', unitPrice: 800, isDefault: true });
    const type2 = idolRepo.createChekiType({ idolId: idol.id, label: 'Solo', currency: 'JPY', unitPrice: 500 });
    const onSaved = jest.fn();

    const view = await render(<EventForm onSaved={onSaved} />);
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Idol Cream Soda Vol. 2'), 'Multi Type Event');
    await fireEvent.press(screen.getByLabelText('Add cheki entry'));
    await fireEvent.press(screen.getByLabelText('Select idol for Cheki 1'));
    await fireEvent.press(screen.getByLabelText('Select idol Ichika (Solo)'));

    // Initially 1 type row
    expect(screen.getByText('2 Shot (¥ 800)')).toBeTruthy();

    // Add a second type row
    await fireEvent.press(screen.getByLabelText('Add Cheki type option to entry 1'));
    await fireEvent.press(screen.getByLabelText('Select Cheki type for Cheki 1 option 2'));
    await fireEvent.press(screen.getByLabelText('Solo'));

    expect(screen.getByText('2 Shot (¥ 800)')).toBeTruthy();
    expect(screen.getByText('Solo (¥ 500)')).toBeTruthy();

    // First row now has a remove button (xCircle)
    expect(screen.getByLabelText('Remove Cheki type 1 from entry 1')).toBeTruthy();

    // Save event with 2 cheki type entries
    await fireEvent.press(screen.getByLabelText('Save Event'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    const event = createEventRepo(mockDb).listEvents()[0];
    const entries = createEventRepo(mockDb).listEntries(event.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ idolId: idol.id, chekiTypeId: type1.id, unitPrice: 800 });
    expect(entries[1]).toMatchObject({ idolId: idol.id, chekiTypeId: type2.id, unitPrice: 500 });
    view.unmount();
  });
});

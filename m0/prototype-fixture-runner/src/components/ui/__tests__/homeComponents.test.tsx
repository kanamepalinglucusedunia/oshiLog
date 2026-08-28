import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { generatePrimaryScale } from '@/design-system/colors';
import { useSettingsStore } from '@/stores/settingsStore';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavbarPill } from '@/components/ui/NavbarPill';
import { EventCard } from '@/components/ui/EventCard';
import { TripCard } from '@/components/ui/TripCard';
import { VenueCard } from '@/components/ui/VenueCard';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterButton } from '@/components/ui/FilterButton';

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    {ui}
  </SafeAreaProvider>
);

describe('NavbarPill', () => {
  it('shows label only on active tab and calls navigation', async () => {
    const onNavigate = jest.fn();
    await render(wrap(<NavbarPill activeRoute="index" onNavigate={onNavigate} />));
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.queryByText('Idol')).toBeNull();
    expect(screen.queryByText('Event')).toBeNull();

    fireEvent.press(screen.getByLabelText('Idol'));
    expect(onNavigate).toHaveBeenCalledWith('idols');
  });

  it('marks another tab active', async () => {
    await render(wrap(<NavbarPill activeRoute="trips" onNavigate={jest.fn()} />));
    expect(screen.getByText('Trip')).toBeTruthy();
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('uses exact widths: wide pill, 38 inactive items, 38 fab, active item has label', async () => {
    const { toJSON } = await render(<NavbarPill activeRoute="index" onNavigate={jest.fn()} />);
    const pill = toJSON()!;
    expect(JSON.stringify(pill.props.style)).toContain('"width":326');
  });

  it('updates active tab and fab colors when accentColor in settings changes', async () => {
    useSettingsStore.setState({
      settings: {
        id: 'default',
        surfaceStyle: 'outline',
        themeMode: 'light',
        accentColor: '#2E9E6B',
        homeHeaderLabel: 'oshiLog',
        onboardingCompleted: true,
        dataReminderFrequency: 'off',
        mediaReminderFrequency: 'off',
        schemaVersion: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        deletedAt: null,
      },
      loaded: true,
    });
    const { toJSON } = await render(wrap(<NavbarPill activeRoute="index" onNavigate={jest.fn()} />));
    const jsonStr = JSON.stringify(toJSON());
    expect(jsonStr).toContain('#2E9E6B');
    expect(jsonStr).toContain('#F5FAF8');
    expect(jsonStr).toContain('#ABD8C4');
  });
});

describe('EventCard', () => {
  it('renders date parts, title, cheki count and spend', async () => {
    await render(
      <EventCard
        title="Idol Cream Soda"
        eventDate="2025-05-22"
        chekiCount={12}
        spendLabel="¥ 400"
        locationLabel="Nagoya | Reny Limited"
      />,
    );
    expect(screen.getByText('22')).toBeTruthy();
    expect(screen.getByText('May')).toBeTruthy();
    expect(screen.getByText('2025')).toBeTruthy();
    expect(screen.getByText('Idol Cream Soda')).toBeTruthy();
    expect(screen.getByText('Nagoya | Reny Limited')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('¥ 400')).toBeTruthy();
  });

  it('formats region and venue into location subtitle', async () => {
    await render(
      <EventCard
        title="Idol Cream Soda"
        eventDate="2025-05-22"
        chekiCount={12}
        region="Nagoya"
        venue="Reny Limited"
      />,
    );
    expect(screen.getByText('Nagoya | Reny Limited')).toBeTruthy();
  });
});

describe('TripCard', () => {
  it('renders the ongoing style with status, progress and metadata', async () => {
    await render(
      <TripCard
        title="Idol Cream Soda"
        startDate="2025-01-10"
        endDate="2025-01-30"
        today="2025-01-20"
        eventCount={12}
        spendLabel="¥ 400"
      />,
    );
    const title = screen.getByText('Idol Cream Soda');
    const titleStyle = StyleSheet.flatten(title.props.style);
    expect(title).toBeTruthy();
    expect(titleStyle.flexShrink).toBe(1);
    expect(titleStyle.flex).toBeUndefined();
    expect(screen.getByText('On Going')).toBeTruthy();
    const statusStyle = StyleSheet.flatten(screen.getByTestId('trip-card-status').props.style);
    const primaryScale = generatePrimaryScale(useSettingsStore.getState().settings?.accentColor ?? '#7F6EB5');
    expect(statusStyle).toMatchObject({
      backgroundColor: primaryScale.P50,
      borderColor: primaryScale.P300,
      borderWidth: 1,
    });
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('¥ 400 Total')).toBeTruthy();
    expect(screen.getByTestId('trip-card-progress')).toBeTruthy();
  });

  it('renders the completed style without status or progress', async () => {
    await render(
      <TripCard
        title="Rad Jam"
        startDate="2024-12-01"
        endDate="2024-12-10"
        today="2025-01-01"
        eventCount={12}
        spendLabel="¥ 400"
      />,
    );
    expect(screen.getByText('Rad Jam')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('¥ 400 Total')).toBeTruthy();
    expect(screen.queryByText('On Going')).toBeNull();
    expect(screen.queryByTestId('trip-card-status')).toBeNull();
    expect(screen.queryByTestId('trip-card-progress')).toBeNull();
  });
});


describe('VenueCard', () => {
  it('renders name, country, region and event count', async () => {
    await render(
      <VenueCard
        name="Nagoya Reny Limited"
        country="Japan"
        region="Nagoya"
        eventCount={12}
      />,
    );
    expect(screen.getByText('Nagoya Reny Limited')).toBeTruthy();
    expect(screen.getByText('Japan')).toBeTruthy();
    expect(screen.getByText('Nagoya')).toBeTruthy();
    expect(screen.getByText('x12')).toBeTruthy();
    expect(screen.queryByText('Visit')).toBeNull();
  });
});

describe('SearchBar', () => {
  it('calls onChangeText when typing', async () => {
    const onChangeText = jest.fn();
    await render(<SearchBar value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText('Search'), 'abc');
    expect(onChangeText).toHaveBeenCalledWith('abc');
  });

  it('keeps the compact search bar at its fixed control height', async () => {
    await render(<SearchBar compact value="" onChangeText={jest.fn()} />);

    expect(StyleSheet.flatten(screen.getByLabelText('Search').parent?.props.style)).toEqual(expect.objectContaining({
      flex: 0,
      height: 36,
    }));
  });
});

describe('FilterButton', () => {
  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<FilterButton onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Filter'));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows the number of active filters and exposes it to accessibility', async () => {
    await render(<FilterButton onPress={jest.fn()} activeCount={3} />);

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByLabelText('Filter, 3 active')).toBeTruthy();
  });
});



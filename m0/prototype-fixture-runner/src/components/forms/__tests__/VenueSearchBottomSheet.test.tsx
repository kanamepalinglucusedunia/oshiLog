import { useState } from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { VenueSearchBottomSheet } from '../VenueSearchBottomSheet';
import { searchVenues } from '@/services/venueSearch';
import type { VenueSearchOutcome, VenueSearchResult } from '@/services/venueSearch';

jest.mock('@/services/venueSearch', () => ({ searchVenues: jest.fn() }));

const mockSearchVenues = searchVenues as jest.MockedFunction<typeof searchVenues>;

const RESULT_A: VenueSearchResult = {
  id: 'place-a',
  name: 'KT Zepp Yokohama',
  country: 'JP',
  region: 'Kanagawa',
  address: '5-13-1 Kannai, Nishi-ku, Yokohama',
};

const RESULT_B: VenueSearchResult = {
  id: 'place-b',
  name: 'Zepp Shinjuku',
  country: 'JP',
  region: 'Tokyo',
  address: '3-9-19 Shinjuku, Tokyo',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function renderSheet(onSelect = jest.fn()) {
  const onClose = jest.fn();
  function Harness() {
    const [visible, setVisible] = useState(true);
    return (
      <VenueSearchBottomSheet
        visible={visible}
        activeCountries={['JP', 'KR']}
        fallbackCountry="JP"
        onClose={() => {
          onClose();
          setVisible(false);
        }}
        onSelect={onSelect}
      />
    );
  }
  const view = await render(<Harness />);
  return { ...view, onClose, onSelect };
}

async function settleDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(400);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function typeQuery(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Venue search'), text);
}

async function press(label: string) {
  await fireEvent.press(screen.getByLabelText(label));
}

describe('VenueSearchBottomSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSearchVenues.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the title, search field, helper text, and manual action when open', async () => {
    await renderSheet();
    expect(screen.getByText('Find venue or address')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search by venue name or address')).toBeTruthy();
    expect(screen.getByText('Type at least 3 characters.')).toBeTruthy();
    expect(screen.getByLabelText('Enter manually')).toBeTruthy();
  });

  it('does not call the provider for queries under the minimum length', async () => {
    await renderSheet();
    await typeQuery('Z');
    await typeQuery('Ze');
    await settleDebounce();
    expect(mockSearchVenues).not.toHaveBeenCalled();
    expect(screen.getByText('Type at least 3 characters.')).toBeTruthy();
  });

  it('fires exactly one request after the 400 ms debounce for a valid query', async () => {
    mockSearchVenues.mockResolvedValue({ ok: true, results: [RESULT_A] });
    await renderSheet();
    await typeQuery('Zepp');
    expect(mockSearchVenues).not.toHaveBeenCalled();
    await settleDebounce();
    expect(mockSearchVenues).toHaveBeenCalledTimes(1);
    expect(mockSearchVenues.mock.calls[0][0]).toMatchObject({ query: 'Zepp', activeCountries: ['JP', 'KR'] });
  });

  it('aborts the previous request when the query changes', async () => {
    const first = deferred<VenueSearchOutcome>();
    const second = deferred<VenueSearchOutcome>();
    const signals: (AbortSignal | undefined)[] = [];
    mockSearchVenues.mockImplementation((input) => {
      signals.push(input.signal);
      return signals.length === 1 ? first.promise : second.promise;
    });

    await renderSheet();
    await typeQuery('Zepp');
    await settleDebounce();
    await typeQuery('Zepp Shinjuku');
    expect(signals[0]?.aborted).toBe(true);
    await settleDebounce();
    expect(mockSearchVenues).toHaveBeenCalledTimes(2);
  });

  it('renders three skeleton rows while loading', async () => {
    const pending = deferred<VenueSearchOutcome>();
    mockSearchVenues.mockReturnValue(pending.promise);

    await renderSheet();
    await typeQuery('Zepp');
    await settleDebounce();

    expect(screen.getAllByLabelText('Search result skeleton')).toHaveLength(3);
  });

  it('renders result rows with name, address, country, and region', async () => {
    mockSearchVenues.mockResolvedValue({ ok: true, results: [RESULT_A, RESULT_B] });

    await renderSheet();
    await typeQuery('Zepp');
    await settleDebounce();

    expect(screen.getByLabelText(`${RESULT_A.name}, ${RESULT_A.address}`)).toBeTruthy();
    expect(screen.getByText(RESULT_A.name)).toBeTruthy();
    expect(screen.getByText(RESULT_A.address)).toBeTruthy();
    expect(screen.getByText('JP · Kanagawa')).toBeTruthy();
    expect(screen.getByText('JP · Tokyo')).toBeTruthy();
  });

  it('renders the empty state with a spelling hint', async () => {
    mockSearchVenues.mockResolvedValue({ ok: true, results: [] });

    await renderSheet();
    await typeQuery('Zzzzz');
    await settleDebounce();

    expect(screen.getByText('No matching venue found.')).toBeTruthy();
  });

  const errorScenarios: {
    error: Extract<VenueSearchOutcome, { ok: false }>['error'];
    message: string;
    hasRetry: boolean;
  }[] = [
    { error: { code: 'NETWORK', retryable: true }, message: 'Venue search is unavailable. Check your connection or enter it manually.', hasRetry: true },
    { error: { code: 'RATE_LIMITED', retryable: true }, message: 'Search limit reached. Try again later or enter it manually.', hasRetry: false },
    { error: { code: 'UNAUTHORIZED', retryable: false }, message: 'Venue search is not available in this build.', hasRetry: false },
    { error: { code: 'NOT_CONFIGURED', retryable: false }, message: 'Venue search is not available in this build.', hasRetry: false },
    { error: { code: 'PROVIDER_UNAVAILABLE', retryable: true }, message: 'Venue search is temporarily unavailable.', hasRetry: true },
    { error: { code: 'INVALID_RESPONSE', retryable: true }, message: 'Venue search is temporarily unavailable.', hasRetry: true },
  ];

  it.each(errorScenarios)('maps error $error.code to its user-safe UI', async ({ error, message, hasRetry }) => {
    mockSearchVenues.mockResolvedValue({ ok: false, error });
    await renderSheet();
    await typeQuery('Zepp');
    await settleDebounce();

    expect(screen.getByText(message)).toBeTruthy();
    if (hasRetry) {
      expect(screen.getByLabelText('Try again')).toBeTruthy();
    } else {
      expect(screen.queryByLabelText('Try again')).toBeNull();
    }
  });

  it('retries only the current query when Try again is pressed', async () => {
    mockSearchVenues
      .mockResolvedValueOnce({ ok: false, error: { code: 'NETWORK', retryable: true } })
      .mockResolvedValueOnce({ ok: true, results: [RESULT_A] });

    await renderSheet();
    await typeQuery('Zepp');
    await settleDebounce();
    expect(screen.getByText('Venue search is unavailable. Check your connection or enter it manually.')).toBeTruthy();

    await act(async () => {
      await press('Try again');
      await Promise.resolve();
    });

    expect(mockSearchVenues).toHaveBeenCalledTimes(2);
    expect(mockSearchVenues.mock.calls[1][0].query).toBe('Zepp');
    expect(screen.getByText(RESULT_A.name)).toBeTruthy();
  });

  it('ignores a stale response that completes after a newer request', async () => {
    const first = deferred<VenueSearchOutcome>();
    const second = deferred<VenueSearchOutcome>();
    mockSearchVenues.mockImplementation(() => {
      if (mockSearchVenues.mock.calls.length === 1) return first.promise;
      return second.promise;
    });

    await renderSheet();
    await typeQuery('Zepp');
    await settleDebounce();
    await typeQuery('Zepp Shinjuku');
    await settleDebounce();

    await act(async () => {
      second.resolve({ ok: true, results: [RESULT_B] });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      first.resolve({ ok: true, results: [RESULT_A] });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(RESULT_B.name)).toBeTruthy();
    expect(screen.queryByText(RESULT_A.name)).toBeNull();
  });

  it('closing the sheet aborts work, resets state, and emits no selection', async () => {
    const pending = deferred<VenueSearchOutcome>();
    const signals: (AbortSignal | undefined)[] = [];
    mockSearchVenues.mockImplementation((input) => {
      signals.push(input.signal);
      return pending.promise;
    });

    const { onClose, onSelect } = await renderSheet();
    await typeQuery('Zepp');
    await settleDebounce();
    expect(signals[0]?.aborted).toBe(false);

    await press('Enter manually');

    expect(signals[0]?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ ok: false, error: { code: 'NETWORK', retryable: true } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('Venue search is unavailable. Check your connection or enter it manually.')).toBeNull();
  });

  it('emits the normalized result exactly once on selection', async () => {
    mockSearchVenues.mockResolvedValue({ ok: true, results: [RESULT_A] });
    const onSelect = jest.fn();
    const { onClose } = await renderSheet(onSelect);

    await typeQuery('Zepp');
    await settleDebounce();
    await press(`${RESULT_A.name}, ${RESULT_A.address}`);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(RESULT_A);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the Geoapify and OpenStreetMap attribution links', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    mockSearchVenues.mockResolvedValue({ ok: true, results: [RESULT_A] });

    await renderSheet();
    await typeQuery('Zepp');
    await settleDebounce();

    await fireEvent.press(screen.getByLabelText('Powered by Geoapify'));
    await fireEvent.press(screen.getByLabelText('OpenStreetMap contributors'));

    expect(openURL).toHaveBeenCalledWith('https://www.geoapify.com/');
    expect(openURL).toHaveBeenCalledWith('https://www.openstreetmap.org/copyright');
  });
});

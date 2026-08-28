import { searchVenues } from '../venueSearch';

const API_KEY = 'test-geoapify-key-12345';

const mockFetch = jest.fn<Promise<Partial<Response>>, [RequestInfo | URL, RequestInit?]>();

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: jest.fn(async () => JSON.stringify(body)),
  };
}

function errorResponse(status: number, body = '{}') {
  return {
    ok: false,
    status,
    text: jest.fn(async () => body),
  };
}

function feature(properties: Record<string, unknown>, id = 'place-1') {
  return { type: 'Feature', id, properties };
}

const VALID_FEATURE = feature({
  place_id: 'place-1',
  name: 'KT Zepp Yokohama',
  country_code: 'jp',
  state: 'Kanagawa',
  county: 'Yokohama',
  city: 'Nishi-ku',
  formatted: 'KT Zepp Yokohama, Kanagawa, Japan',
  address_line1: 'KT Zepp Yokohama',
  address_line2: 'Kanagawa, Japan',
});

const FEATURE_COLLECTION = { type: 'FeatureCollection', features: [VALID_FEATURE] };

describe('venueSearch service', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY = API_KEY;
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;
    delete (global as { fetch?: unknown }).fetch;
  });

  describe('query validation', () => {
    it('rejects a query shorter than 3 characters after trimming', async () => {
      for (const query of ['', ' ', 'ab', '  ab  ']) {
        const outcome = await searchVenues({ query, activeCountries: ['JP'] });
        expect(outcome).toEqual({ ok: false, error: { code: 'INVALID_QUERY', retryable: false } });
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects a query longer than 120 characters', async () => {
      const outcome = await searchVenues({ query: 'x'.repeat(121), activeCountries: ['JP'] });
      expect(outcome).toEqual({ ok: false, error: { code: 'INVALID_QUERY', retryable: false } });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it('returns NOT_CONFIGURED when the API key is missing', async () => {
    delete process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;
    const outcome = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });
    expect(outcome).toEqual({ ok: false, error: { code: 'NOT_CONFIGURED', retryable: false } });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  describe('request construction', () => {
    it('builds an HTTPS URL with limit, language, and encoded country filter', async () => {
      mockFetch.mockResolvedValue(okResponse(FEATURE_COLLECTION));
      await searchVenues({ query: 'Zepp Shinjuku', activeCountries: ['JP', 'ID', 'MY'] });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url.startsWith('https://api.geoapify.com/v1/geocode/autocomplete?')).toBe(true);

      const params = new URL(url).searchParams;
      expect(params.get('text')).toBe('Zepp Shinjuku');
      expect(params.get('format')).toBe('geojson');
      expect(params.get('limit')).toBe('5');
      expect(params.get('lang')).toBe('en');
      expect(params.get('filter')).toBe('countrycode:jp,id,my');
      expect(params.get('apiKey')).toBe(API_KEY);
    });

    it('does not include unsupported or duplicate country codes in the filter', async () => {
      mockFetch.mockResolvedValue(okResponse(FEATURE_COLLECTION));
      await searchVenues({
        query: 'Zepp',
        activeCountries: ['JP', 'JP', 'ZZ'] as never,
      });

      const params = new URL(mockFetch.mock.calls[0][0] as string).searchParams;
      expect(params.get('filter')).toBe('countrycode:jp');
    });

    it('passes the supplied abort signal to fetch', async () => {
      mockFetch.mockResolvedValue(okResponse(FEATURE_COLLECTION));
      const controller = new AbortController();
      await searchVenues({ query: 'Zepp', activeCountries: ['JP'], signal: controller.signal });

      expect(mockFetch.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
    });
  });

  describe('response mapping', () => {
    it('maps a valid feature to the normalized result shape', async () => {
      mockFetch.mockResolvedValue(okResponse(FEATURE_COLLECTION));
      const outcome = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });

      expect(outcome).toEqual({
        ok: true,
        results: [
          {
            id: 'place-1',
            name: 'KT Zepp Yokohama',
            country: 'JP',
            region: 'Kanagawa',
            address: 'KT Zepp Yokohama, Kanagawa, Japan',
          },
        ],
      });
    });

    it('resolves region precedence as state, then county, then city, then null', async () => {
      const cases: { props: Record<string, unknown>; expected: string | null }[] = [
        { props: { state: 'State', county: 'County', city: 'City' }, expected: 'State' },
        { props: { county: 'County', city: 'City' }, expected: 'County' },
        { props: { city: 'City' }, expected: 'City' },
        { props: {} as Record<string, unknown>, expected: null },
      ];

      for (const { props, expected } of cases) {
        mockFetch.mockResolvedValue(
          okResponse({
            type: 'FeatureCollection',
            features: [
              feature({
                place_id: `place-${expected}`,
                name: 'Venue',
                country_code: 'jp',
                formatted: 'Venue, Japan',
                ...props,
              }),
            ],
          }),
        );
        const outcome = await searchVenues({ query: 'Venue', activeCountries: ['JP'] });
        expect(outcome.ok).toBe(true);
        if (outcome.ok) {
          expect(outcome.results[0].region).toBe(expected);
        }
      }
    });

    it('falls back to address_line1 for the name when name is missing', async () => {
      mockFetch.mockResolvedValue(
        okResponse({
          type: 'FeatureCollection',
          features: [
            feature({
              place_id: 'place-2',
              country_code: 'jp',
              address_line1: 'Toyosu PIT',
              address_line2: 'Tokyo, Japan',
              formatted: 'Toyosu PIT, Tokyo, Japan',
            }),
          ],
        }),
      );
      const outcome = await searchVenues({ query: 'Toyosu', activeCountries: ['JP'] });
      expect(outcome).toEqual({
        ok: true,
        results: [{ id: 'place-2', name: 'Toyosu PIT', country: 'JP', region: null, address: 'Toyosu PIT, Tokyo, Japan' }],
      });
    });

    it('joins non-empty address lines when formatted is missing', async () => {
      mockFetch.mockResolvedValue(
        okResponse({
          type: 'FeatureCollection',
          features: [
            feature({
              place_id: 'place-3',
              name: 'Balai Sarbini',
              country_code: 'id',
              state: 'Jakarta',
              address_line1: 'Jalan Sultan Agung No. 55',
              address_line2: 'Setiabudi, Jakarta',
            }),
          ],
        }),
      );
      const outcome = await searchVenues({ query: 'Balai Sarbini', activeCountries: ['ID'] });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.results[0].address).toBe('Jalan Sultan Agung No. 55, Setiabudi, Jakarta');
      }
    });

    it('drops features with missing place_id, name, or address candidates individually', async () => {
      mockFetch.mockResolvedValue(
        okResponse({
          type: 'FeatureCollection',
          features: [
            feature({ name: 'No Place ID', country_code: 'jp', formatted: 'Tokyo' }),
            feature({ place_id: 'p2', country_code: 'jp', formatted: 'Osaka' }),
            feature({ place_id: 'p3', name: 'No Address', country_code: 'jp' }),
            feature({
              place_id: 'p4',
              name: 'Valid One',
              country_code: 'jp',
              formatted: 'Valid address',
              state: 'Tokyo',
            }),
          ],
        }),
      );
      const outcome = await searchVenues({ query: 'venue', activeCountries: ['JP'] });
      expect(outcome).toEqual({
        ok: true,
        results: [
          {
            id: 'p4',
            name: 'Valid One',
            country: 'JP',
            region: 'Tokyo',
            address: 'Valid address',
          },
        ],
      });
    });

    it('drops features with unsupported or inactive countries without crashing the list', async () => {
      mockFetch.mockResolvedValue(
        okResponse({
          type: 'FeatureCollection',
          features: [
            feature({ place_id: 'p1', name: 'Inactive', country_code: 'kr', formatted: 'Seoul' }),
            feature({ place_id: 'p2', name: 'Unsupported', country_code: 'us', formatted: 'New York' }),
            feature({ place_id: 'p3', name: 'Missing Country', formatted: 'Nowhere' }),
            feature({
              place_id: 'p4',
              name: 'Active JP',
              country_code: 'JP',
              formatted: 'Tokyo address',
              state: 'Tokyo',
            }),
          ],
        }),
      );
      const outcome = await searchVenues({ query: 'venue', activeCountries: ['JP'] });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.results.map((r) => r.id)).toEqual(['p4']);
      }
    });
  });

  describe('error classification', () => {
    it.each([
      [401, 'UNAUTHORIZED', false],
      [403, 'UNAUTHORIZED', false],
      [429, 'RATE_LIMITED', true],
      [500, 'PROVIDER_UNAVAILABLE', true],
      [503, 'PROVIDER_UNAVAILABLE', true],
      [400, 'PROVIDER_UNAVAILABLE', true],
    ] as const)('maps HTTP %s to %s with retryable=%s', async (status, code, retryable) => {
      mockFetch.mockResolvedValue(errorResponse(status));
      const outcome = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });
      expect(outcome).toEqual({ ok: false, error: { code, retryable } });
    });

    it('maps a fetch network failure to NETWORK', async () => {
      mockFetch.mockRejectedValue(new TypeError('Network request failed'));
      const outcome = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });
      expect(outcome).toEqual({ ok: false, error: { code: 'NETWORK', retryable: true } });
    });

    it('maps an aborted request to ABORTED and keeps it silent', async () => {
      mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
      const outcome = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });
      expect(outcome).toEqual({ ok: false, error: { code: 'ABORTED', retryable: false } });
    });

    it('maps malformed JSON to INVALID_RESPONSE', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, text: jest.fn(async () => 'not json') });
      const outcome = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });
      expect(outcome).toEqual({ ok: false, error: { code: 'INVALID_RESPONSE', retryable: true } });
    });

    it('maps a structurally invalid GeoJSON payload to INVALID_RESPONSE', async () => {
      mockFetch.mockResolvedValue(okResponse({ features: [{ properties: 'nope' }] }));
      const outcome = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });
      expect(outcome).toEqual({ ok: false, error: { code: 'INVALID_RESPONSE', retryable: true } });
    });

    it('never includes the response body, stack, or key in returned errors', async () => {
      mockFetch.mockResolvedValue(errorResponse(401, JSON.stringify({ error: 'Invalid API key: ' + API_KEY })));
      const outcome = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });
      expect(outcome).toEqual({ ok: false, error: { code: 'UNAUTHORIZED', retryable: false } });

      mockFetch.mockRejectedValue(new TypeError('Network request failed'));
      const network = await searchVenues({ query: 'Zepp', activeCountries: ['JP'] });
      expect(JSON.stringify(network)).not.toContain('Network request failed');
      expect(JSON.stringify(network)).not.toContain(API_KEY);
      expect(JSON.stringify(outcome)).not.toContain(API_KEY);
    });
  });
});

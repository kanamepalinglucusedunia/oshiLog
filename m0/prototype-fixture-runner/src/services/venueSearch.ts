import { z } from 'zod';
import type { CountryCode } from '@/types/domain';

const AUTOCOMPLETE_ENDPOINT = 'https://api.geoapify.com/v1/geocode/autocomplete';
const REQUEST_LIMIT = 5;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 120;

const SUPPORTED_COUNTRIES = new Set<CountryCode>(['JP', 'ID', 'MY', 'KR', 'TH']);

export interface VenueSearchResult {
  id: string;
  name: string;
  country: CountryCode;
  region: string | null;
  address: string;
}

export type VenueSearchErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_QUERY'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'ABORTED';

export type VenueSearchOutcome =
  | { ok: true; results: VenueSearchResult[] }
  | { ok: false; error: { code: VenueSearchErrorCode; retryable: boolean } };

export interface SearchVenuesInput {
  query: string;
  activeCountries: readonly CountryCode[];
  signal?: AbortSignal;
}

const featurePropertiesSchema = z.object({
  place_id: z.string().optional(),
  name: z.string().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  formatted: z.string().optional(),
  country_code: z.string().optional(),
  state: z.string().optional(),
  county: z.string().optional(),
  city: z.string().optional(),
});

const featureCollectionSchema = z.object({
  features: z.array(
    z.object({
      properties: featurePropertiesSchema,
    }),
  ),
});

type Feature = z.infer<typeof featureCollectionSchema>['features'][number];

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function normalizeFeature(feature: Feature, activeCountries: Set<CountryCode>): VenueSearchResult | null {
  const props = feature.properties;

  const countryCode = props.country_code?.trim().toUpperCase() as CountryCode;
  if (!countryCode || !SUPPORTED_COUNTRIES.has(countryCode) || !activeCountries.has(countryCode)) return null;

  if (!props.place_id) return null;

  const name = props.name?.trim() || props.address_line1?.trim();
  if (!name) return null;

  const address =
    props.formatted?.trim() ||
    [props.address_line1?.trim(), props.address_line2?.trim()].filter((part) => part).join(', ');
  if (!address) return null;

  return {
    id: props.place_id,
    name,
    country: countryCode,
    region: props.state?.trim() || props.county?.trim() || props.city?.trim() || null,
    address,
  };
}

export async function searchVenues(input: SearchVenuesInput): Promise<VenueSearchOutcome> {
  const query = input.query.trim();
  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: { code: 'INVALID_QUERY', retryable: false } };
  }

  const apiKey = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;
  if (!apiKey) {
    return { ok: false, error: { code: 'NOT_CONFIGURED', retryable: false } };
  }

  const activeCountries = [...new Set(input.activeCountries.filter((code) => SUPPORTED_COUNTRIES.has(code)))];
  const params = new URLSearchParams({
    text: query,
    format: 'geojson',
    limit: String(REQUEST_LIMIT),
    lang: 'en',
    filter: `countrycode:${activeCountries.map((code) => code.toLowerCase()).join(',')}`,
    apiKey,
  });

  let response: Response;
  try {
    response = await fetch(`${AUTOCOMPLETE_ENDPOINT}?${params.toString()}`, { signal: input.signal });
  } catch (error) {
    if (isAbortError(error)) return { ok: false, error: { code: 'ABORTED', retryable: false } };
    return { ok: false, error: { code: 'NETWORK', retryable: true } };
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: { code: 'UNAUTHORIZED', retryable: false } };
    }
    if (response.status === 429) {
      return { ok: false, error: { code: 'RATE_LIMITED', retryable: true } };
    }
    return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', retryable: true } };
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    if (isAbortError(error)) return { ok: false, error: { code: 'ABORTED', retryable: false } };
    return { ok: false, error: { code: 'NETWORK', retryable: true } };
  }

  let parsed: ReturnType<typeof featureCollectionSchema.safeParse>;
  try {
    parsed = featureCollectionSchema.safeParse(JSON.parse(bodyText));
  } catch {
    return { ok: false, error: { code: 'INVALID_RESPONSE', retryable: true } };
  }
  if (!parsed.success) {
    return { ok: false, error: { code: 'INVALID_RESPONSE', retryable: true } };
  }

  const activeSet = new Set<CountryCode>(input.activeCountries);
  const results: VenueSearchResult[] = [];
  for (const feature of parsed.data.features) {
    const normalized = normalizeFeature(feature, activeSet);
    if (normalized) results.push(normalized);
  }
  return { ok: true, results };
}

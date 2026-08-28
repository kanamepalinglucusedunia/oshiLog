import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { LocationDataAttribution } from '@/components/ui/LocationDataAttribution';
import { useTheme } from '@/hooks/useTheme';
import { searchVenues } from '@/services/venueSearch';
import type { VenueSearchErrorCode, VenueSearchResult } from '@/services/venueSearch';
import type { CountryCode } from '@/types/domain';

const DEBOUNCE_MS = 400;
const REQUEST_TIMEOUT_MS = 8000;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 120;

export interface VenueSearchBottomSheetProps {
  visible: boolean;
  activeCountries: readonly CountryCode[];
  fallbackCountry: CountryCode;
  onClose: () => void;
  onSelect: (result: VenueSearchResult) => void;
}

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

const ERROR_MESSAGES: Partial<Record<VenueSearchErrorCode, { message: string; retryable: boolean }>> = {
  NETWORK: {
    message: 'Venue search is unavailable. Check your connection or enter it manually.',
    retryable: true,
  },
  RATE_LIMITED: {
    message: 'Search limit reached. Try again later or enter it manually.',
    retryable: false,
  },
  UNAUTHORIZED: {
    message: 'Venue search is not available in this build.',
    retryable: false,
  },
  NOT_CONFIGURED: {
    message: 'Venue search is not available in this build.',
    retryable: false,
  },
  PROVIDER_UNAVAILABLE: {
    message: 'Venue search is temporarily unavailable.',
    retryable: true,
  },
  INVALID_RESPONSE: {
    message: 'Venue search is temporarily unavailable.',
    retryable: true,
  },
};

function Attribution() {
  const theme = useTheme();
  return (
    <View style={[styles.attribution, { borderTopColor: theme.color.borderLight }]}>
      <LocationDataAttribution />
    </View>
  );
}

export function VenueSearchBottomSheet({
  visible,
  activeCountries,
  fallbackCountry,
  onClose,
  onSelect,
}: VenueSearchBottomSheetProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<VenueSearchResult[]>([]);
  const [error, setError] = useState<VenueSearchErrorCode | null>(null);
  const [lastVisible, setLastVisible] = useState(visible);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const timedOutRef = useRef(false);
  const visibleRef = useRef(visible);

  const abortInFlight = useCallback(() => {
    seqRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    timedOutRef.current = false;
  }, []);

  if (lastVisible !== visible) {
    setLastVisible(visible);
    setQuery('');
    setStatus('idle');
    setResults([]);
    setError(null);
  }

  useEffect(() => {
    visibleRef.current = visible;
    if (!visible) abortInFlight();
  }, [visible, abortInFlight]);

  const runSearch = useCallback(
    async (searchQuery: string) => {
      const seq = ++seqRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      timedOutRef.current = false;
      setStatus('loading');
      setError(null);

      timeoutRef.current = setTimeout(() => {
        timedOutRef.current = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      const effectiveCountries = activeCountries.length > 0 ? activeCountries : [fallbackCountry];
      const outcome = await searchVenues({
        query: searchQuery,
        activeCountries: effectiveCountries,
        signal: controller.signal,
      });

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      if (seq !== seqRef.current || !visibleRef.current) return;

      if (outcome.ok) {
        setResults(outcome.results);
        setStatus(outcome.results.length > 0 ? 'success' : 'empty');
      } else if (outcome.error.code === 'ABORTED') {
        if (timedOutRef.current) {
          setError('NETWORK');
          setStatus('error');
        }
      } else {
        setError(outcome.error.code);
        setStatus('error');
      }
    },
    [activeCountries, fallbackCountry],
  );

  useEffect(() => {
    abortInFlight();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH || trimmed.length > MAX_QUERY_LENGTH) return;
    debounceRef.current = setTimeout(() => {
      void runSearch(trimmed);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeCountries, runSearch, abortInFlight]);

  useEffect(() => () => abortInFlight(), [abortInFlight]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    const trimmed = text.trim();
    if (trimmed.length < MIN_QUERY_LENGTH || trimmed.length > MAX_QUERY_LENGTH) {
      setStatus('idle');
      setResults([]);
      setError(null);
    }
  };

  const handleSelect = (result: VenueSearchResult) => {
    onSelect(result);
    onClose();
  };

  const errorInfo = error ? ERROR_MESSAGES[error] : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.85}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        scrollsChildToFocus
        contentContainerStyle={[styles.content, { paddingBottom: theme.spacing.lg }]}
      >
        <AppText weight="bold" size="h3">
          Find venue or address
        </AppText>

        <Field
          icon="search"
          label="Search venue"
          accessibilityLabel="Venue search"
          placeholder="Search by venue name or address"
          value={query}
          onChangeText={handleQueryChange}
          maxLength={MAX_QUERY_LENGTH}
          containerStyle={{ marginTop: theme.spacing.sm }}
        />
        {status === 'idle' ? (
          <AppText size="xs" muted style={{ marginTop: theme.spacing.xs }}>
            Type at least 3 characters.
          </AppText>
        ) : null}

        {status === 'loading' ? (
          <View style={{ marginTop: theme.spacing.sm }}>
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                accessibilityLabel="Search result skeleton"
                style={[
                  styles.skeletonRow,
                  {
                    borderBottomColor: theme.color.borderLight,
                    backgroundColor: theme.color.surfaceMuted,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}

        {status === 'success' ? (
          <View style={[styles.resultList, { marginTop: theme.spacing.sm }]}>
            {results.map((result) => (
              <Pressable
                key={result.id}
                accessibilityRole="button"
                accessibilityLabel={`${result.name}, ${result.address}`}
                onPress={() => handleSelect(result)}
                style={({ pressed }) => [
                  styles.resultRow,
                  { borderBottomColor: theme.color.borderLight },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <AppText weight="semibold" size="body">
                  {result.name}
                </AppText>
                <AppText size="small" muted numberOfLines={2}>
                  {result.address}
                </AppText>
                {result.region ? (
                  <AppText size="small" muted>
                    {result.country} · {result.region}
                  </AppText>
                ) : null}
              </Pressable>
            ))}
            <Attribution />
          </View>
        ) : null}

        {status === 'empty' ? (
          <View style={[styles.stateBox, { marginTop: theme.spacing.md }]}>
            <Icon name="search" size={28} color={theme.color.textMuted} strokeWidth={1} />
            <AppText size="body" muted style={{ marginTop: theme.spacing.sm }}>
              No matching venue found.
            </AppText>
            <AppText size="xs" muted style={{ marginTop: theme.spacing.xs }}>
              Check the spelling or try a different name.
            </AppText>
            <Attribution />
          </View>
        ) : null}

        {status === 'error' && errorInfo ? (
          <View style={[styles.stateBox, { marginTop: theme.spacing.md }]}>
            <AppText size="body" muted style={{ textAlign: 'center' }}>
              {errorInfo.message}
            </AppText>
            {errorInfo.retryable ? (
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => void runSearch(query.trim())}
                style={{ marginTop: theme.spacing.sm }}
              />
            ) : null}
          </View>
        ) : null}

        <Button
          label="Enter manually"
          variant="secondary"
          onPress={onClose}
          style={{ marginTop: theme.spacing.md }}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skeletonRow: {
    height: 48,
    marginBottom: 8,
  },
  resultList: {
    width: '100%',
  },
  resultRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stateBox: {
    alignItems: 'center',
  },
  attribution: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

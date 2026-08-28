import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { TripCard } from '@/components/ui/TripCard';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterButton } from '@/components/ui/FilterButton';
import { FilterChoiceChip, FilterSection, FilterSortBottomSheet } from '@/components/ui/FilterSortBottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SwipeableTab } from '@/components/ui/SwipeableTab';
import { useTabPagerStore } from '@/stores/tabPagerStore';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { useFormSheetStore } from '@/stores/formSheetStore';
import { getDb } from '@/db';
import { createAggregationService, totalsToSortedList, type TripListRow } from '@/services/aggregation';
import { TRIP_STATUS_LABEL, type TripStatus } from '@/utils/tripStatus';
import { formatMoneyCompact } from '@/utils/money';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { type TripSort } from '@/services/mainListSort';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useTheme } from '@/hooks/useTheme';

type TripFilter = 'all' | TripStatus;

const FILTER_OPTIONS: { value: TripFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'on-going', label: 'On Going' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'passed', label: 'Passed' },
];

const SORT_OPTIONS: { label: string; ascendingValue: TripSort; descendingValue: TripSort }[] = [
  { label: 'Start date', ascendingValue: 'start-asc', descendingValue: 'start-desc' },
  { label: 'Events', ascendingValue: 'events-asc', descendingValue: 'events-desc' },
  { label: 'Recently added', ascendingValue: 'recently-added-asc', descendingValue: 'recently-added' },
];

export default function TripsScreen() {
  const router = useRouter();
  const setFocusedIndex = useTabPagerStore((s) => s.setFocusedIndex);
  const theme = useTheme();
  const [filter, setFilter] = useState<TripFilter>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [sort, setSort] = useState<TripSort>('start-desc');
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<TripFilter>('all');
  const [draftCountryFilter, setDraftCountryFilter] = useState('all');
  const [draftSort, setDraftSort] = useState<TripSort>('start-desc');
  const dataVersion = useUiStore((s) => s.dataVersion);
  const requestOpenForm = useFormSheetStore((s) => s.requestOpenForm);

  const filters = useMemo(() => ({ q: query, country: countryFilter, status: filter }), [query, countryFilter, filter]);
  const fetchTrips = useCallback((args: { filters: typeof filters; sort: TripSort; limit: number; cursor: string | null }) => {
    return readDataAtVersion(dataVersion, () => createAggregationService(getDb()).listTripsPage({ filters: args.filters as never, sort: args.sort, limit: args.limit, cursor: args.cursor }));
  }, [dataVersion]);
  const { items: trips, hasMore, isLoading, isLoadingMore, error, loadMore, refresh } = usePaginatedQuery(fetchTrips, filters, sort, 50);

  const meta = useMemo(() => readDataAtVersion(dataVersion, () => {
    const db = getDb();
    const rows = db.getAllSync<{ country: string }>(`SELECT DISTINCT country FROM trip_country WHERE deleted_at IS NULL`);
    return { countries: [...new Set(rows.map((r) => r.country))].sort() };
  }), [dataVersion]);
  const countries = meta.countries;

  const draftResultCount = useMemo(() => {
    return readDataAtVersion(dataVersion, () => createAggregationService(getDb()).countTrips({ q: query, country: draftCountryFilter, status: draftFilter }));
  }, [dataVersion, query, draftCountryFilter, draftFilter]);

  const activeFilterCount = (filter !== 'all' ? 1 : 0)
    + (countryFilter !== 'all' ? 1 : 0)
    + (sort !== 'start-desc' ? 1 : 0);

  const openFilterSheet = () => {
    setDraftFilter(filter);
    setDraftCountryFilter(countryFilter);
    setDraftSort(sort);
    setFilterOpen(true);
  };

  const resetDraftFilters = () => {
    setDraftFilter('all');
    setDraftCountryFilter('all');
    setDraftSort('start-desc');
  };

  const applyDraftFilters = () => {
    setFilter(draftFilter);
    setCountryFilter(draftCountryFilter);
    setSort(draftSort);
    setFilterOpen(false);
  };

  const renderItem = ({ item }: { item: TripListRow }) => {
    const totals = totalsToSortedList(item.eventTotals);
    return (
      <TripCard
        title={item.title}
        startDate={item.startDate}
        endDate={item.endDate}
        eventCount={item.eventCount}
        spendLabel={totals[0] ? formatMoneyCompact(totals[0].amount, totals[0].currency) : null}
        onPress={() => router.push(`/trip/${item.id}`)}
      />
    );
  };

  const onEndReached = useCallback(() => { if (hasMore && !isLoadingMore && !isLoading) loadMore(); }, [hasMore, isLoadingMore, isLoading, loadMore]);

  return (
    <SwipeableTab index={4} onNavigate={(i) => setFocusedIndex(i)}>
      <Screen scroll={false} contentStyle={{ padding: 0 }}>
        <View style={styles.header}>
          <AppText weight="semibold" size="h2">
            Trip
          </AppText>
          <View style={styles.searchRow}>
            <SearchBar value={query} onChangeText={setQuery} />
            <FilterButton accessibilityLabel="Filter trips" activeCount={activeFilterCount} onPress={openFilterSheet} />
          </View>
        </View>
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={theme.color.accent} />}
          ListFooterComponent={
            isLoadingMore ? <View style={{ paddingVertical: 16 }}><ActivityIndicator color={theme.color.accent} /></View> :
            error ? <View style={{ paddingVertical: 12, alignItems: 'center' }}><AppText size="small" color={theme.color.danger}>{error}</AppText></View> : null
          }
          ListEmptyComponent={
            isLoading ? <View style={{ paddingVertical: 24 }}><ActivityIndicator color={theme.color.accent} /></View> :
            <EmptyState
              icon="airplane-outline"
              title="No trips yet"
              description="Group your events and travel expenses into trips."
              actionLabel="New Trip"
              onAction={() => requestOpenForm('trip')}
            />
          }
        />
        <FilterSortBottomSheet
          visible={filterOpen}
          title="Filter & Sort Trips"
          sortOptions={SORT_OPTIONS}
          selectedSort={draftSort}
          onSortChange={setDraftSort}
          onReset={resetDraftFilters}
          onApply={applyDraftFilters}
          onClose={() => setFilterOpen(false)}
          resultCount={draftResultCount}
        >
          <FilterSection title="Status">
            {FILTER_OPTIONS.map((option) => (
              <FilterChoiceChip
                key={option.value}
                label={option.label}
                selected={draftFilter === option.value}
                onPress={() => setDraftFilter(option.value)}
              />
            ))}
          </FilterSection>
          {countries.length > 0 ? (
            <FilterSection title="Country">
              {['all', ...countries].map((country) => (
                <FilterChoiceChip
                  key={country}
                  label={country === 'all' ? 'All countries' : country}
                  selected={draftCountryFilter === country}
                  onPress={() => setDraftCountryFilter(country)}
                />
              ))}
            </FilterSection>
          ) : null}
        </FilterSortBottomSheet>
      </Screen>
    </SwipeableTab>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  list: {
    padding: 16,
    paddingTop: 8,
    gap: CARD_STACK_GAP,
  },
});

export { TRIP_STATUS_LABEL };

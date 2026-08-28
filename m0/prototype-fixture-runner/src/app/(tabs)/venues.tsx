import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { VenueCard } from '@/components/ui/VenueCard';
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
import { createAggregationService, type VenueListRow } from '@/services/aggregation';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { type VenueSort } from '@/services/mainListSort';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useTheme } from '@/hooks/useTheme';

const SORT_OPTIONS: { label: string; ascendingValue: VenueSort; descendingValue: VenueSort }[] = [
  { label: 'Name', ascendingValue: 'name-asc', descendingValue: 'name-desc' },
  { label: 'Visits', ascendingValue: 'visits-asc', descendingValue: 'visits-desc' },
  { label: 'Recently added', ascendingValue: 'recently-added-asc', descendingValue: 'recently-added' },
];

export default function VenuesScreen() {
  const router = useRouter();
  const setFocusedIndex = useTabPagerStore((s) => s.setFocusedIndex);
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [sort, setSort] = useState<VenueSort>('name-asc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftCountryFilter, setDraftCountryFilter] = useState('all');
  const [draftRegionFilter, setDraftRegionFilter] = useState('all');
  const [draftSort, setDraftSort] = useState<VenueSort>('name-asc');
  const dataVersion = useUiStore((s) => s.dataVersion);
  const requestOpenForm = useFormSheetStore((s) => s.requestOpenForm);

  const filters = useMemo(() => ({ q: query, country: countryFilter, region: regionFilter }), [query, countryFilter, regionFilter]);
  const fetchVenues = useCallback((args: { filters: typeof filters; sort: VenueSort; limit: number; cursor: string | null }) => {
    return readDataAtVersion(dataVersion, () => createAggregationService(getDb()).listVenuesPage({ filters: args.filters as never, sort: args.sort, limit: args.limit, cursor: args.cursor }));
  }, [dataVersion]);
  const { items: venues, hasMore, isLoading, isLoadingMore, error, loadMore, refresh } = usePaginatedQuery(fetchVenues, filters, sort, 50);

  const meta = useMemo(() => readDataAtVersion(dataVersion, () => {
    const db = getDb();
    const cRows = db.getAllSync<{ country: string }>(`SELECT DISTINCT country FROM venue WHERE deleted_at IS NULL`);
    const rRows = db.getAllSync<{ region: string }>(`SELECT DISTINCT region FROM venue WHERE deleted_at IS NULL AND region IS NOT NULL AND region != ''`);
    return { countries: [...new Set(cRows.map((r) => r.country))].sort(), regions: [...new Set(rRows.map((r) => r.region))].sort() };
  }), [dataVersion]);
  const countries = meta.countries;
  const regions = meta.regions;

  const draftResultCount = useMemo(() => {
    return readDataAtVersion(dataVersion, () => createAggregationService(getDb()).countVenues({ q: query, country: draftCountryFilter, region: draftRegionFilter }));
  }, [dataVersion, query, draftCountryFilter, draftRegionFilter]);

  const activeFilterCount = (countryFilter !== 'all' ? 1 : 0)
    + (regionFilter !== 'all' ? 1 : 0)
    + (sort !== 'name-asc' ? 1 : 0);

  const openFilterSheet = () => {
    setDraftCountryFilter(countryFilter);
    setDraftRegionFilter(regionFilter);
    setDraftSort(sort);
    setFilterOpen(true);
  };

  const resetDraftFilters = () => {
    setDraftCountryFilter('all');
    setDraftRegionFilter('all');
    setDraftSort('name-asc');
  };

  const applyDraftFilters = () => {
    setCountryFilter(draftCountryFilter);
    setRegionFilter(draftRegionFilter);
    setSort(draftSort);
    setFilterOpen(false);
  };

  const renderItem = ({ item }: { item: VenueListRow }) => {
    return (
      <VenueCard
        name={item.name}
        country={item.country}
        region={item.region}
        eventCount={item.visitCount}
        onPress={() => router.push(`/venue/${item.id}`)}
      />
    );
  };

  const onEndReached = useCallback(() => { if (hasMore && !isLoadingMore && !isLoading) loadMore(); }, [hasMore, isLoadingMore, isLoading, loadMore]);

  return (
    <SwipeableTab index={3} onNavigate={(i) => setFocusedIndex(i)}>
      <Screen scroll={false} contentStyle={{ padding: 0 }}>
        <View style={styles.header}>
          <AppText weight="semibold" size="h2">
            Venue
          </AppText>
          <View style={styles.searchRow}>
            <SearchBar value={query} onChangeText={setQuery} />
            <FilterButton accessibilityLabel="Filter venues" activeCount={activeFilterCount} onPress={openFilterSheet} />
          </View>
        </View>
        <FlatList
          data={venues}
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
              icon="location-outline"
              title="No venues yet"
              description="Track where your events happened."
              actionLabel="New Venue"
              onAction={() => requestOpenForm('venue')}
            />
          }
        />
        <FilterSortBottomSheet
          visible={filterOpen}
          title="Filter & Sort Venues"
          sortOptions={SORT_OPTIONS}
          selectedSort={draftSort}
          onSortChange={setDraftSort}
          onReset={resetDraftFilters}
          onApply={applyDraftFilters}
          onClose={() => setFilterOpen(false)}
          resultCount={draftResultCount}
        >
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
          {regions.length > 0 ? (
            <FilterSection title="Region">
              {['all', ...regions].map((region) => (
                <FilterChoiceChip
                  key={region}
                  label={region === 'all' ? 'All regions' : region}
                  selected={draftRegionFilter === region}
                  onPress={() => setDraftRegionFilter(region)}
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

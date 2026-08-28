import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { EventCard } from '@/components/ui/EventCard';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterButton } from '@/components/ui/FilterButton';
import { FilterChoiceChip, FilterSection, FilterSortBottomSheet } from '@/components/ui/FilterSortBottomSheet';
import { MONTH_FILTER_OPTIONS, WheelFilterButton } from '@/components/ui/WheelFilterButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SwipeableTab } from '@/components/ui/SwipeableTab';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { useTabPagerStore } from '@/stores/tabPagerStore';
import { getDb } from '@/db';
import { createEventRepo, type EventListRow } from '@/repositories/event';
import { formatMoneyTotals } from '@/utils/money';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { type EventSort } from '@/services/mainListSort';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useTheme } from '@/hooks/useTheme';

type TripPresenceFilter = 'all' | 'with-trip' | 'without-trip';

const SORT_OPTIONS: { label: string; ascendingValue: EventSort; descendingValue: EventSort }[] = [
  { label: 'Event date', ascendingValue: 'date-asc', descendingValue: 'date-desc' },
  { label: 'Cheki', ascendingValue: 'cheki-asc', descendingValue: 'cheki-desc' },
  { label: 'Recently added', ascendingValue: 'recently-added-asc', descendingValue: 'recently-added' },
];

export default function EventsScreen() {
  const router = useRouter();
  const setIdolSegment = useUiStore((s) => s.setIdolSegment);
  const setFocusedIndex = useTabPagerStore((s) => s.setFocusedIndex);
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [tripFilter, setTripFilter] = useState<TripPresenceFilter>('all');
  const [sort, setSort] = useState<EventSort>('date-desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftMonthFilter, setDraftMonthFilter] = useState('all');
  const [draftYearFilter, setDraftYearFilter] = useState('all');
  const [draftCountryFilter, setDraftCountryFilter] = useState('all');
  const [draftRegionFilter, setDraftRegionFilter] = useState('all');
  const [draftTripFilter, setDraftTripFilter] = useState<TripPresenceFilter>('all');
  const [draftSort, setDraftSort] = useState<EventSort>('date-desc');
  const dataVersion = useUiStore((s) => s.dataVersion);

  const filters = useMemo(() => ({ q: query, month: monthFilter, year: yearFilter, country: countryFilter, region: regionFilter, tripPresence: tripFilter }), [query, monthFilter, yearFilter, countryFilter, regionFilter, tripFilter]);

  const fetchPage = useCallback((args: { filters: typeof filters; sort: EventSort; limit: number; cursor: string | null }) => {
    return readDataAtVersion(dataVersion, () => createEventRepo(getDb()).listEventsPage({ filters: args.filters as never, sort: args.sort, limit: args.limit, cursor: args.cursor }));
  }, [dataVersion]);

  const { items: events, hasMore, isLoading, isLoadingMore, error, loadMore, refresh } = usePaginatedQuery(fetchPage, filters, sort, 50);

  const meta = useMemo(() => readDataAtVersion(dataVersion, () => createEventRepo(getDb()).listEventFilterMeta()), [dataVersion]);
  const years = meta.years;
  const countries = meta.countries;
  const regions = meta.regions;

  const draftResultCount = useMemo(() => {
    return readDataAtVersion(dataVersion, () => createEventRepo(getDb()).countEvents({ q: query, month: draftMonthFilter, year: draftYearFilter, country: draftCountryFilter, region: draftRegionFilter, tripPresence: draftTripFilter } as never));
  }, [dataVersion, query, draftMonthFilter, draftYearFilter, draftCountryFilter, draftRegionFilter, draftTripFilter]);

  const activeFilterCount = (monthFilter !== 'all' ? 1 : 0)
    + (yearFilter !== 'all' ? 1 : 0)
    + (countryFilter !== 'all' ? 1 : 0)
    + (regionFilter !== 'all' ? 1 : 0)
    + (tripFilter !== 'all' ? 1 : 0)
    + (sort !== 'date-desc' ? 1 : 0);

  const openFilterSheet = () => {
    setDraftMonthFilter(monthFilter);
    setDraftYearFilter(yearFilter);
    setDraftCountryFilter(countryFilter);
    setDraftRegionFilter(regionFilter);
    setDraftTripFilter(tripFilter);
    setDraftSort(sort);
    setFilterOpen(true);
  };

  const resetDraftFilters = () => {
    setDraftMonthFilter('all');
    setDraftYearFilter('all');
    setDraftCountryFilter('all');
    setDraftRegionFilter('all');
    setDraftTripFilter('all');
    setDraftSort('date-desc');
  };

  const applyDraftFilters = () => {
    setMonthFilter(draftMonthFilter);
    setYearFilter(draftYearFilter);
    setCountryFilter(draftCountryFilter);
    setRegionFilter(draftRegionFilter);
    setTripFilter(draftTripFilter);
    setSort(draftSort);
    setFilterOpen(false);
  };

  const renderItem = ({ item }: { item: EventListRow }) => {
    const spendTotals = { ...item.chekiTotals };
    if (item.ticketCurrency && item.ticketAmount != null) spendTotals[item.ticketCurrency] += item.ticketAmount;
    if (item.drinkCurrency && item.drinkAmount != null) spendTotals[item.drinkCurrency] += item.drinkAmount;
    return (
      <EventCard
        title={item.title}
        eventDate={item.eventDate}
        chekiCount={item.chekiCount}
        region={item.venueRegion}
        venue={item.venueName}
        spendLabel={formatMoneyTotals(spendTotals, { compact: true })}
        onPress={() => router.push(`/event/${item.id}`)}
      />
    );
  };

  const onEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && !isLoading) loadMore();
  }, [hasMore, isLoadingMore, isLoading, loadMore]);

  return (
    <SwipeableTab
      index={2}
      onNavigate={(i) => setFocusedIndex(i)}
      onSwipeRight={() => {
        setIdolSegment('group');
        setFocusedIndex(1);
        router.navigate('/idols');
      }}
    >
      <Screen scroll={false} contentStyle={{ padding: 0 }}>
        <View style={styles.header}>
          <AppText weight="semibold" size="h2">
            Event
          </AppText>
          <View style={styles.searchRow}>
            <SearchBar value={query} onChangeText={setQuery} />
            <FilterButton accessibilityLabel="Filter events" activeCount={activeFilterCount} onPress={openFilterSheet} />
          </View>
        </View>
        <FlatList
          data={events}
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
              icon="calendar-outline"
              title="No events yet"
              description="Every visit you log becomes part of your history."
              actionLabel="New Event"
              onAction={() => router.push('/event/new')}
            />
          }
        />
        <FilterSortBottomSheet
          visible={filterOpen}
          title="Filter & Sort Events"
          sortOptions={SORT_OPTIONS}
          selectedSort={draftSort}
          onSortChange={setDraftSort}
          onReset={resetDraftFilters}
          onApply={applyDraftFilters}
          onClose={() => setFilterOpen(false)}
          resultCount={draftResultCount}
        >
          <FilterSection title="Month & Year">
            <WheelFilterButton
              label="Month"
              value={draftMonthFilter}
              options={MONTH_FILTER_OPTIONS}
              displayValue={draftMonthFilter === 'all' ? 'All' : MONTH_FILTER_OPTIONS.find((option) => option.value === draftMonthFilter)?.label.slice(0, 3) ?? 'All'}
              onChange={setDraftMonthFilter}
            />
            <WheelFilterButton
              label="Year"
              value={draftYearFilter}
              options={[{ value: 'all', label: 'All Years' }, ...years.map((value) => ({ value, label: value }))]}
              displayValue={draftYearFilter === 'all' ? 'All' : draftYearFilter}
              onChange={setDraftYearFilter}
            />
          </FilterSection>
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
          <FilterSection title="Trip">
            {([
              ['all', 'All events'],
              ['with-trip', 'In a trip'],
              ['without-trip', 'Without trip'],
            ] as const).map(([value, label]) => (
              <FilterChoiceChip
                key={value}
                label={label}
                selected={draftTripFilter === value}
                onPress={() => setDraftTripFilter(value)}
              />
            ))}
          </FilterSection>
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

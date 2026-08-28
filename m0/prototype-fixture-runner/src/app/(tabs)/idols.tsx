import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { IdolCard } from '@/components/ui/IdolCard';
import { GroupCard, countryName } from '@/components/ui/GroupCard';
import { IdolGroupTab } from '@/components/ui/IdolGroupTab';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterButton } from '@/components/ui/FilterButton';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { FilterChoiceChip, FilterSection, FilterSortBottomSheet } from '@/components/ui/FilterSortBottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SwipeableTab } from '@/components/ui/SwipeableTab';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { useFormSheetStore } from '@/stores/formSheetStore';
import { getDb } from '@/db';
import { createIdolRepo } from '@/repositories/idol';
import { createAggregationService, totalsToSortedList, type GroupListRow, type IdolListRow } from '@/services/aggregation';
import { resolveIdolPhotoUris } from '@/services/dashboard';
import { formatMoneyCompact } from '@/utils/money';
import { MOTION_SCREEN_MS } from '@/animation/motion';
import type { CurrencyCode, IdolStatus } from '@/types/domain';
import { MAIN_IDOL_GROUP_CARD_STACK_GAP } from '@/design-system/theme';
import { type IdolGroupSort } from '@/services/mainListSort';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useTheme } from '@/hooks/useTheme';

const STATUS_FILTERS: { value: 'all' | IdolStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'hiatus', label: 'Hiatus' },
  { value: 'inactive', label: 'Inactive' },
];

const SORT_OPTIONS: { label: string; ascendingValue: IdolGroupSort; descendingValue: IdolGroupSort }[] = [
  { label: 'Name', ascendingValue: 'name-asc', descendingValue: 'name-desc' },
  { label: 'Events', ascendingValue: 'events-asc', descendingValue: 'events-desc' },
  { label: 'Cheki', ascendingValue: 'cheki-asc', descendingValue: 'cheki-desc' },
  { label: 'Recently added', ascendingValue: 'recently-added-asc', descendingValue: 'recently-added' },
];

function spendLabelOf(totals: Record<CurrencyCode, number>): string | null {
  const list = totalsToSortedList(totals);
  return list[0] ? formatMoneyCompact(list[0].amount, list[0].currency) : null;
}

export default function IdolsScreen() {
  const router = useRouter();
  const segment = useUiStore((s) => s.idolSegment);
  const setIdolSegment = useUiStore((s) => s.setIdolSegment);
  const requestOpenForm = useFormSheetStore((s) => s.requestOpenForm);
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | IdolStatus>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [sort, setSort] = useState<IdolGroupSort>('name-asc');
  const [draftStatusFilter, setDraftStatusFilter] = useState<'all' | IdolStatus>('all');
  const [draftCountryFilter, setDraftCountryFilter] = useState('all');
  const [draftRegionFilter, setDraftRegionFilter] = useState('all');
  const [draftGroupFilter, setDraftGroupFilter] = useState('all');
  const [draftSort, setDraftSort] = useState<IdolGroupSort>('name-asc');
  const [gridWidth, setGridWidth] = useState(0);

  // Smart-Animate-style crossfade when switching the Idol/Group sub-tab.
  // Starts fully visible; only a real segment change triggers the fade-in,
  // so the grid is never stuck invisible if an animation is interrupted.
  const [segmentProgress] = useState(() => new Animated.Value(1));
  const prevSegmentRef = useRef(segment);
  useEffect(() => {
    if (prevSegmentRef.current === segment) return;
    prevSegmentRef.current = segment;
    segmentProgress.setValue(0);
    Animated.timing(segmentProgress, {
      toValue: 1,
      duration: MOTION_SCREEN_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [segment, segmentProgress]);
  const segmentStyle = {
    opacity: segmentProgress,
    transform: [{ scale: segmentProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
  };
  const theme = useTheme();

  const idolFilters = useMemo(() => ({ q: query, status: statusFilter, country: countryFilter, region: regionFilter, group: groupFilter, favoritesOnly }), [query, statusFilter, countryFilter, regionFilter, groupFilter, favoritesOnly]);
  const groupFilters = useMemo(() => ({ q: query, country: countryFilter, region: regionFilter, favoritesOnly }), [query, countryFilter, regionFilter, favoritesOnly]);

  const fetchIdols = useCallback((args: { filters: typeof idolFilters; sort: IdolGroupSort; limit: number; cursor: string | null }) => {
    return readDataAtVersion(dataVersion, () => createAggregationService(getDb()).listIdolsPage({ filters: args.filters as never, sort: args.sort, limit: args.limit, cursor: args.cursor }));
  }, [dataVersion]);

  const fetchGroups = useCallback((args: { filters: typeof groupFilters; sort: IdolGroupSort; limit: number; cursor: string | null }) => {
    return readDataAtVersion(dataVersion, () => createAggregationService(getDb()).listGroupsPage({ filters: args.filters as never, sort: args.sort, limit: args.limit, cursor: args.cursor }));
  }, [dataVersion]);

  const idolQuery = usePaginatedQuery(fetchIdols, idolFilters, sort, 50);
  const groupQuery = usePaginatedQuery(fetchGroups, groupFilters, sort, 50);

  const rows = segment === 'idol' ? idolQuery.items : groupQuery.items;
  const isLoading = segment === 'idol' ? idolQuery.isLoading : groupQuery.isLoading;
  const isLoadingMore = segment === 'idol' ? idolQuery.isLoadingMore : groupQuery.isLoadingMore;
  const hasMore = segment === 'idol' ? idolQuery.hasMore : groupQuery.hasMore;
  const loadMore = segment === 'idol' ? idolQuery.loadMore : groupQuery.loadMore;
  const refresh = segment === 'idol' ? idolQuery.refresh : groupQuery.refresh;
  const error = segment === 'idol' ? idolQuery.error : groupQuery.error;

  const photos = useMemo(() => resolveIdolPhotoUris(getDb(), rows.map((r) => r.photoMediaId)), [rows]);

  const meta = useMemo(() => readDataAtVersion(dataVersion, () => {
    const db = getDb();
    const idolCountries = db.getAllSync<{ country: string }>(`SELECT DISTINCT country FROM idol WHERE deleted_at IS NULL`);
    const groupCountries = db.getAllSync<{ country: string }>(`SELECT DISTINCT country FROM groups WHERE deleted_at IS NULL`);
    const idolRegions = db.getAllSync<{ region: string }>(`SELECT DISTINCT region FROM idol WHERE deleted_at IS NULL AND region IS NOT NULL AND region != ''`);
    const groupRegions = db.getAllSync<{ region: string }>(`SELECT DISTINCT region FROM groups WHERE deleted_at IS NULL AND region IS NOT NULL AND region != ''`);
    const groupNames = db.getAllSync<{ name: string }>(`SELECT DISTINCT g.name FROM groups g WHERE g.deleted_at IS NULL ORDER BY g.name`);
    const allCountries = new Set<string>();
    for (const r of [...idolCountries, ...groupCountries]) allCountries.add(countryName(r.country as never));
    const allRegions = new Set<string>();
    for (const r of [...idolRegions, ...groupRegions]) if (r.region) allRegions.add(r.region);
    return {
      countries: [...allCountries].sort(),
      regions: [...allRegions].sort(),
      groups: groupNames.map((r) => r.name).sort(),
    };
  }), [dataVersion]);

  const countries = meta.countries;
  const regions = meta.regions;
  const groups = segment === 'idol' ? meta.groups : [];

  const draftResultCount = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      const svc = createAggregationService(getDb());
      if (segment === 'idol') return svc.countIdols({ q: query, status: draftStatusFilter, country: draftCountryFilter, region: draftRegionFilter, group: draftGroupFilter, favoritesOnly });
      return svc.countGroups({ q: query, country: draftCountryFilter, region: draftRegionFilter, favoritesOnly });
    });
  }, [dataVersion, segment, query, draftStatusFilter, draftCountryFilter, draftRegionFilter, draftGroupFilter, favoritesOnly]);

  const activeFilterCount = (sort !== 'name-asc' ? 1 : 0)
    + (countryFilter !== 'all' ? 1 : 0)
    + (regionFilter !== 'all' ? 1 : 0)
    + (segment === 'idol' && statusFilter !== 'all' ? 1 : 0)
    + (segment === 'idol' && groupFilter !== 'all' ? 1 : 0);

  const openFilterSheet = () => {
    setDraftStatusFilter(statusFilter);
    setDraftCountryFilter(countryFilter);
    setDraftRegionFilter(regionFilter);
    setDraftGroupFilter(groupFilter);
    setDraftSort(sort);
    setFilterOpen(true);
  };

  const resetDraftFilters = () => {
    setDraftStatusFilter('all');
    setDraftCountryFilter('all');
    setDraftRegionFilter('all');
    setDraftGroupFilter('all');
    setDraftSort('name-asc');
  };

  const applyDraftFilters = () => {
    setStatusFilter(draftStatusFilter);
    setCountryFilter(draftCountryFilter);
    setRegionFilter(draftRegionFilter);
    setGroupFilter(draftGroupFilter);
    setSort(draftSort);
    setFilterOpen(false);
  };

  const toggleFavorite = (id: string, isFavorite: boolean) => {
    const repo = createIdolRepo(getDb());
    if (segment === 'idol') repo.updateIdol(id, { isFavorite: !isFavorite });
    else repo.updateGroup(id, { isFavorite: !isFavorite });
  };

  const renderItem = ({ item }: { item: IdolListRow | GroupListRow }) => {
    const photoUri = item.photoMediaId ? photos.get(item.photoMediaId) ?? null : null;
    const spendLabel = spendLabelOf(item.spendTotals);
    const onPress = () => router.push(segment === 'idol' ? `/idol/${item.id}` : `/group/${item.id}`);
    const onFavoritePress = () => toggleFavorite(item.id, item.isFavorite);
    // Deterministic 2-column sizing: (grid width - 16px padding ×2 - 8px gap) / 2.
    const cardWidth = gridWidth > 0 ? (gridWidth - 40) / 2 : undefined;
    if (segment === 'idol') {
      const idol = item as IdolListRow;
      return (
        <IdolCard
          idol={{
            name: idol.name,
            status: idol.status,
            isFavorite: idol.isFavorite,
            groupName: idol.groupName,
            eventCount: idol.eventCount,
            chekiCount: idol.chekiCount,
            spendLabel,
          }}
          photoUri={photoUri}
          onPress={onPress}
          onFavoritePress={onFavoritePress}
          width={cardWidth}
        />
      );
    }
    const group = item as GroupListRow;
    return (
      <GroupCard
        group={{
          name: group.name,
          country: group.country,
          region: group.region,
          isFavorite: group.isFavorite,
          eventCount: group.eventCount,
          chekiCount: group.chekiCount,
          spendLabel,
        }}
        photoUri={photoUri}
        onPress={onPress}
        onFavoritePress={onFavoritePress}
        width={cardWidth}
      />
    );
  };

  // Swipe: Home <-> Idol/Group <-> Event. Group is a sub-tab of Idol.
  const handleSwipeLeft = () => {
    if (segment === 'idol') {
      setIdolSegment('group');
    } else {
      router.navigate('/events');
    }
  };
  const handleSwipeRight = () => {
    if (segment === 'group') {
      setIdolSegment('idol');
    } else {
      router.navigate('/');
    }
  };

  return (
    <SwipeableTab index={1} onNavigate={() => {}} onSwipeLeft={handleSwipeLeft} onSwipeRight={handleSwipeRight}>
      <Screen scroll={false} contentStyle={{ padding: 0 }}>
        <View style={styles.header}>
          <IdolGroupTab value={segment} onChange={setIdolSegment} />
          <View style={styles.searchRow}>
            <SearchBar value={query} onChangeText={setQuery} />
            <FilterButton accessibilityLabel={`Filter ${segment === 'idol' ? 'idols' : 'groups'}`} activeCount={activeFilterCount} onPress={openFilterSheet} />
            <FavoriteButton
              accessibilityLabel="Toggle favorites"
              isFavorite={favoritesOnly}
              onPress={() => setFavoritesOnly((f) => !f)}
            />
          </View>
        </View>
        <Animated.View style={[styles.list, segmentStyle]} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            numColumns={2}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.grid}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => { if (hasMore && !isLoadingMore && !isLoading) loadMore(); }}
            onEndReachedThreshold={0.4}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={theme.color.accent} />}
            ListFooterComponent={
              isLoadingMore ? <View style={{ paddingVertical: 16 }}><ActivityIndicator color={theme.color.accent} /></View> :
              error ? <View style={{ paddingVertical: 12, alignItems: 'center' }}><AppText size="small" color={theme.color.danger}>{error}</AppText></View> : null
            }
            ListEmptyComponent={
              isLoading ? <View style={{ paddingVertical: 24 }}><ActivityIndicator color={theme.color.accent} /></View> :
              <EmptyState
                icon={segment === 'idol' ? 'person-outline' : 'people-outline'}
                title={`No ${segment === 'idol' ? 'idols' : 'groups'} yet`}
                description="Use the + button to create one."
                actionLabel="New Idol"
                onAction={() => requestOpenForm(segment === 'idol' ? 'idol' : 'group')}
              />
            }
          />
        </Animated.View>
      </Screen>
      <FilterSortBottomSheet
        visible={filterOpen}
        title={`Filter & Sort ${segment === 'idol' ? 'Idols' : 'Groups'}`}
        sortOptions={SORT_OPTIONS}
        selectedSort={draftSort}
        onSortChange={setDraftSort}
        onReset={resetDraftFilters}
        onApply={applyDraftFilters}
        onClose={() => setFilterOpen(false)}
        resultCount={draftResultCount}
      >
        {segment === 'idol' ? (
          <FilterSection title="Status">
            {STATUS_FILTERS.map((option) => (
              <FilterChoiceChip
                key={option.value}
                label={option.label}
                selected={draftStatusFilter === option.value}
                onPress={() => setDraftStatusFilter(option.value)}
              />
            ))}
          </FilterSection>
        ) : null}
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
        {segment === 'idol' && groups.length > 0 ? (
          <FilterSection title="Group">
            {['all', ...groups].map((group) => (
              <FilterChoiceChip
                key={group}
                label={group === 'all' ? 'All groups' : group}
                selected={draftGroupFilter === group}
                onPress={() => setDraftGroupFilter(group)}
              />
            ))}
          </FilterSection>
        ) : null}
      </FilterSortBottomSheet>
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
  favButton: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRow: {
    gap: 8,
  },
  list: {
    flexGrow: 1,
  },
  grid: {
    padding: 16,
    paddingTop: 8,
    gap: MAIN_IDOL_GROUP_CARD_STACK_GAP,
  },
});

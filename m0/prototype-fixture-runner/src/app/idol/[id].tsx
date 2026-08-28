import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Counter } from '@/components/ui/Counter';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { EmptyState } from '@/components/ui/EmptyState';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { Icon } from '@/components/ui/Icon';
import { ChekiTypeRow, type ChekiTypeFormData } from '@/components/forms/IdolForm';
import { MembershipHistoryManager } from '@/components/forms/MembershipHistoryManager';
import { AddMediaModal } from '@/components/album/AddMediaModal';
import { MediaViewer } from '@/components/album/MediaViewer';
import { Modal } from '@/components/ui/Modal';
import { MONTH_FILTER_OPTIONS, WheelFilterButton } from '@/components/ui/WheelFilterButton';
import { BLACK_SCALE, withAlpha } from '@/design-system/colors';
import { TYPOGRAPHY } from '@/design-system/typography';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { getDb } from '@/db';
import { useTheme } from '@/hooks/useTheme';
import { createEventRepo, type AlbumMediaRow } from '@/repositories/event';
import { createIdolRepo } from '@/repositories/idol';
import { createAggregationService } from '@/services/aggregation';
import { resolveIdolPhotoUris } from '@/services/dashboard';
import {
  buildSixMonthChekiSeries,
  albumMediaAspectRatio,
  calculateAlbumTileHeight,
  getIdolDetailHistory,
  getIdolDetailHistoryPage,
  summarizeChekiTypes,
  type AlbumFilterKind,
  type DetailSortOrder,
  type IdolDetailHistoryRow,
} from '@/services/idolDetail';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { pickDisplayMembership, resolveIdolDisplayName } from '@/services/membership';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  COUNTRIES,
  CURRENCIES,
  type ChekiType,
  type GroupMembership,
  type GroupMembershipStatusPeriod,
  type Idol,
  type MemberColor,
} from '@/types/domain';
import { formatISODate, formatISODateCompact, formatISODateFull, todayISO } from '@/utils/date';
import { formatMoney, formatMoneyTotals } from '@/utils/money';

import { DetailIdolTabIndicator, DETAIL_TABS, type DetailTab } from '@/components/ui/DetailIdolTabIndicator';
const DETAIL_TAB_BAR_HEIGHT = 50;
const DETAIL_LAYOUT_GAP = 16;
export default function IdolDetailScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dataVersion = useUiStore((state) => state.dataVersion);
  const initialTab = DETAIL_TABS.some((item) => item.key === tab) ? (tab as DetailTab) : 'summary';
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);
  const [typeManagerVisible, setTypeManagerVisible] = useState(false);
  const [historyManagerVisible, setHistoryManagerVisible] = useState(false);

  const detail = useMemo(
    () => readDataAtVersion(dataVersion, () => {
      const db = getDb();
      const idolRepo = createIdolRepo(db);
      const idol = idolRepo.getIdol(id);
      if (!idol) return null;
      const memberships = idolRepo.listMembershipsByGroupAllWithGroupName(id);
      const membershipPeriods = idolRepo.listMembershipStatusPeriodsByIdol(id);
      const chekiTypes = idolRepo.listChekiTypes(id, true);
      const colors = idolRepo.listMemberColors();
      return {
        idol,
        memberships,
        membershipPeriods,
        chekiTypes,
        colors,
        stats: createAggregationService(db).getIdolStats(id),
        photoUri: idol.photoMediaId
          ? resolveIdolPhotoUris(db, [idol.photoMediaId]).get(idol.photoMediaId) ?? null
          : null,
      };
    }),
    [dataVersion, id],
  );

  if (!detail) {
    return <EntityNotFound entity="Idol" onBack={() => router.replace('/(tabs)/idols')} />;
  }

  const displayMembership = pickDisplayMembership(detail.memberships, todayISO()) as
    | (GroupMembership & { groupName: string })
    | null;
  const displayName = resolveIdolDisplayName(detail.idol.name, detail.memberships, todayISO());
  const toggleFavorite = () => {
    createIdolRepo(getDb()).updateIdol(detail.idol.id, { isFavorite: !detail.idol.isFavorite });
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.color.background }]}>
      <RNStatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent
        animated
      />
      <HeroHeader
        idol={detail.idol}
        displayName={displayName}
        groupName={displayMembership?.groupName ?? 'Solo'}
        photoUri={detail.photoUri}
        topInset={insets.top}
        onBack={() => router.back()}
        onEdit={() => router.push(`/idol/edit?id=${detail.idol.id}`)}
        onFavorite={toggleFavorite}
      />

      <View style={styles.paneHost}>
        <Pane active={activeTab === 'summary'}>
          <SummaryTab
            idol={detail.idol}
            memberships={detail.memberships}
            membershipPeriods={detail.membershipPeriods}
            colors={detail.colors}
            stats={detail.stats}
            onManageHistory={() => setHistoryManagerVisible(true)}
          />
        </Pane>
        <Pane active={activeTab === 'cheki'}>
          <ChekiTab
            idolId={detail.idol.id}
            stats={detail.stats}
            chekiTypes={detail.chekiTypes}
            tabBarBottomInset={Math.max(insets.bottom, DETAIL_LAYOUT_GAP)}
            onManageTypes={() => setTypeManagerVisible(true)}
            onOpenEvent={(eventId) => router.push(`/event/${eventId}`)}
          />
        </Pane>
        <Pane active={activeTab === 'album'}>
          <AlbumTab idolId={detail.idol.id} isActive={activeTab === 'album'} />
        </Pane>
      </View>

      <View style={[styles.tabBarWrapper, { bottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none">
        <DetailIdolTabIndicator activeTab={activeTab} onChange={setActiveTab} />
      </View>
      <ChekiTypeManagerModal
        visible={typeManagerVisible}
        idolId={detail.idol.id}
        types={detail.chekiTypes}
        onClose={() => setTypeManagerVisible(false)}
      />
      <MembershipHistoryManager
        visible={historyManagerVisible}
        idolId={detail.idol.id}
        onClose={() => setHistoryManagerVisible(false)}
      />
    </View>
  );
}

function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <View
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[styles.pane, !active && styles.hiddenPane]}
    >
      {children}
    </View>
  );
}

function HeroHeader({
  idol,
  displayName,
  groupName,
  photoUri,
  topInset,
  onBack,
  onEdit,
  onFavorite,
}: {
  idol: Idol;
  displayName: string;
  groupName: string;
  photoUri: string | null;
  topInset: number;
  onBack: () => void;
  onEdit: () => void;
  onFavorite: () => void;
}) {
  const theme = useTheme();
  const statusColor = idol.status === 'active'
    ? theme.color.success
    : idol.status === 'hiatus'
      ? theme.color.warning
      : theme.color.textMuted;
  return (
    <View style={[styles.hero, { backgroundColor: theme.color.surfaceMuted, borderBottomColor: theme.surface.borderColor }]}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
          <Ionicons name="person" size={64} color={theme.color.accent} />
        </View>
      )}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="heroVignette" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.38" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#heroVignette)" />
      </Svg>

      <View style={[styles.heroActions, { top: Math.max(topInset, 16) + 4 }]}>
        <HeroIconButton label="Go back" icon="arrow-back" onPress={onBack} />
        <HeroIconButton label="Edit Idol" icon="edit" onPress={onEdit} />
      </View>

      <View style={styles.heroIdentity}>
        <View style={styles.heroText}>
          <View style={styles.nameRow}>
            <AppText weight="semibold" size="h3" color={BLACK_SCALE.B0} numberOfLines={1} style={styles.heroName}>
              {displayName}
            </AppText>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>
          <AppText weight="light" size="large" color={BLACK_SCALE.B0} numberOfLines={1}>
            {groupName}
          </AppText>
        </View>
        <FavoriteButton isFavorite={idol.isFavorite} onPress={onFavorite} />
      </View>
    </View>
  );
}

function HeroIconButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: 'arrow-back' | 'edit' | keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.heroIconButton, pressed && styles.pressed]}
    >
      {icon === 'edit' ? (
        <Icon name="edit" size={24} color={BLACK_SCALE.B900} strokeWidth={2} viewBoxPadding={1} />
      ) : (
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={24} color={BLACK_SCALE.B900} />
      )}
    </Pressable>
  );
}



function SummaryTab({
  idol,
  memberships,
  membershipPeriods,
  colors,
  stats,
  onManageHistory,
}: {
  idol: Idol;
  memberships: (GroupMembership & { groupName: string })[];
  membershipPeriods: GroupMembershipStatusPeriod[];
  colors: MemberColor[];
  stats: ReturnType<ReturnType<typeof createAggregationService>['getIdolStats']>;
  onManageHistory: () => void;
}) {
  const theme = useTheme();
  const colorById = useMemo(() => new Map(colors.map((color) => [color.id, color])), [colors]);
  const displayMembership = pickDisplayMembership(memberships, todayISO());
  const memberColorValue = displayMembership?.memberColor ?? idol.memberColor;
  const memberColor = memberColorValue ? colorById.get(memberColorValue) : null;
  const countryName = COUNTRIES.find((country) => country.code === idol.country)?.name ?? idol.country;
  const history = [...memberships].sort((a, b) => {
    const currentOrder = Number(a.status === 'grad') - Number(b.status === 'grad');
    if (currentOrder !== 0) return currentOrder;
    return (b.endDate ?? b.startDate).localeCompare(a.endDate ?? a.startDate);
  });
  const periodsByMembership = useMemo(() => {
    const grouped = new Map<string, GroupMembershipStatusPeriod[]>();
    for (const period of membershipPeriods) {
      const existing = grouped.get(period.groupMembershipId) ?? [];
      existing.push(period);
      grouped.set(period.groupMembershipId, existing);
    }
    for (const periods of grouped.values()) {
      periods.sort((a, b) => b.startDate.localeCompare(a.startDate));
    }
    return grouped;
  }, [membershipPeriods]);

  return (
    <ScrollView scrollsChildToFocus contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Counter eventCount={stats.eventCount} chekiCount={stats.chekiCount} totals={stats.spendTotals} />
      <Card style={styles.infoCard}>
        <InfoRow label="Member Color">
          <View style={styles.infoValueRow}>
            {memberColorValue ? (
              <View style={[styles.colorSwatch, { backgroundColor: memberColor?.hex ?? memberColorValue, borderColor: theme.color.borderLight }]} />
            ) : null}
            <AppText size="body">{memberColor?.name ?? memberColorValue ?? '—'}</AppText>
          </View>
        </InfoRow>
        <InfoRow label="Country">
          <View style={styles.infoValueRow}>
            <CountryFlag country={idol.country} width={24} />
            <AppText size="body">{countryName}</AppText>
          </View>
        </InfoRow>
        <InfoRow label="Region"><AppText size="body">{idol.region ?? '—'}</AppText></InfoRow>
        <InfoRow label="Birthday"><AppText size="body">{idol.birthDate ? formatISODate(idol.birthDate) : '—'}</AppText></InfoRow>
      </Card>

      <Card>
        <View style={styles.historyTitleRow}>
          <AppText weight="semibold" size="large" style={styles.flexOne}>History</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit group history"
            hitSlop={8}
            onPress={onManageHistory}
            style={styles.historyEditButton}
          >
            <Icon name="edit" size={20} color={theme.color.accent} strokeWidth={2} />
          </Pressable>
        </View>
        {history.length === 0 ? (
          <AppText size="small" muted style={styles.emptyCopy}>No group history yet.</AppText>
        ) : history.map((membership) => {
          const displayColor = membership.memberColor ? colorById.get(membership.memberColor) : null;
          const statusSuffix = membership.status === 'hiatus'
            ? ' (Hiatus)'
            : membership.status === 'grad'
              ? ' (Grad)'
              : '';
          const memberName = membership.name ?? idol.name;
          const periods = periodsByMembership.get(membership.id) ?? [];
          return (
            <View
              key={membership.id}
              style={[
                styles.membershipRow,
                { borderTopColor: theme.color.borderLight, gap: theme.spacing.xs, paddingTop: theme.spacing.sm, marginTop: theme.spacing.sm },
              ]}
            >
              <View style={[styles.membershipHeader, { gap: theme.spacing.sm }]}>
                <AppText size="body" numberOfLines={1} style={styles.membershipGroup}>
                  {`• ${membership.groupName}${statusSuffix}`}
                </AppText>
                <AppText size="small" color={theme.color.accent} align="right" numberOfLines={1} style={styles.membershipDate}>
                  {displayColor ? `${memberName} (${displayColor.name})` : memberName}
                </AppText>
              </View>
              <View style={[styles.membershipPeriods, { paddingLeft: theme.spacing.lg }]}>
                {periods.length > 0 ? periods.map((period) => (
                  <AppText key={period.id} weight="light" size="small">
                    {`${formatISODateCompact(period.startDate)} – ${period.endDate ? formatISODateCompact(period.endDate) : 'Now'}${period.status === 'hiatus' ? ' (Hiatus)' : ''}`}
                  </AppText>
                )) : (
                  <AppText weight="light" size="small">
                    {`${formatISODateCompact(membership.startDate)} – ${membership.endDate ? formatISODateCompact(membership.endDate) : 'Now'}`}
                  </AppText>
                )}
              </View>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.color.borderLight }]}>
      <AppText weight="light" size="body">{label}</AppText>
      <View style={styles.infoRight}>{children}</View>
    </View>
  );
}

function AlbumTab({ idolId, isActive }: { idolId: string; isActive: boolean }) {
  const theme = useTheme();
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [kind, setKind] = useState<AlbumFilterKind>('cheki');
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  const [order, setOrder] = useState<DetailSortOrder>('newest');
  const [viewer, setViewer] = useState<AlbumMediaRow | null>(null);
  const [addMediaVisible, setAddMediaVisible] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const tileHeight = calculateAlbumTileHeight(gridWidth || 328);

  const albumFilters = useMemo(() => ({ kind, month, year }), [kind, month, year]);
  const fetchAlbum = useCallback((args: { filters: typeof albumFilters; sort: DetailSortOrder; limit: number; cursor: string | null }) => {
    if (!isActive) return { rows: [], nextCursor: null, hasMore: false };
    return readDataAtVersion(dataVersion, () => {
      const repo = createEventRepo(getDb());
      return repo.listIdolAlbumPage(idolId, { kind: args.filters.kind as never, month: args.filters.month, year: args.filters.year, order: args.sort, limit: args.limit, cursor: args.cursor });
    });
  }, [dataVersion, idolId, isActive]);

  const albumQuery = usePaginatedQuery(fetchAlbum as never, albumFilters as never, order as never, 48);

  const years = useMemo(() => readDataAtVersion(dataVersion, () => {
    const db = getDb();
    const directYears = db.getAllSync<{ y: string }>(`SELECT DISTINCT substr(ma.created_at,1,4) AS y FROM idol_media im JOIN media_asset ma ON ma.id = im.media_asset_id WHERE im.idol_id = ? AND ma.deleted_at IS NULL`, idolId).map((r) => r.y);
    const chekiYears = db.getAllSync<{ y: string }>(`SELECT DISTINCT substr(ma.created_at,1,4) AS y FROM cheki_entry ce JOIN cheki_entry_media cem ON cem.cheki_entry_id = ce.id JOIN media_asset ma ON ma.id = cem.media_asset_id WHERE ce.idol_id = ? AND ce.deleted_at IS NULL AND ma.deleted_at IS NULL`, idolId).map((r) => r.y);
    return [...new Set([...directYears, ...chekiYears])].sort().reverse();
  }), [dataVersion, idolId]);

  const flatRows = useMemo(() => {
    const items = albumQuery.items as AlbumMediaRow[];
    // Group by date for section headers
    const byDate = new Map<string, AlbumMediaRow[]>();
    for (const item of items) {
      const date = item.createdAt.slice(0, 10);
      const list = byDate.get(date) ?? [];
      list.push(item);
      byDate.set(date, list);
    }
    const sortedDates = [...byDate.keys()].sort((a, b) => order === 'newest' ? b.localeCompare(a) : a.localeCompare(b));
    const flat: ({ type: 'header'; date: string } | { type: 'row'; tiles: AlbumMediaRow[]; key: string })[] = [];
    for (const date of sortedDates) {
      flat.push({ type: 'header', date });
      const tiles = byDate.get(date)!;
      for (let i = 0; i < tiles.length; i += 4) {
        const rowTiles = tiles.slice(i, i + 4);
        flat.push({ type: 'row', tiles: rowTiles, key: `${date}-${i}` });
      }
    }
    return flat;
  }, [albumQuery.items, order]);

  const renderFlatItem = useCallback(({ item }: { item: typeof flatRows[number] }) => {
    if (item.type === 'header') {
      return <AppText size="body" color={theme.color.accent}>{formatISODateCompact(item.date)}</AppText>;
    }
    return (
      <View style={styles.albumGrid}>
        {item.tiles.map((tile) => (
          <AlbumTile key={`${tile.source}-${tile.id}-${tile.entryId ?? ''}`} item={tile} tileHeight={tileHeight} onPress={() => setViewer(tile)} />
        ))}
      </View>
    );
  }, [theme.color.accent, tileHeight]);

  if (!isActive) {
    // Lazy: don't query until visible; show placeholder that will hydrate on tab switch
    return (
      <View style={[styles.albumScrollContent, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
        <AppText size="small" muted>Album will load when opened</AppText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w !== gridWidth) setGridWidth(w); }}>
      <View style={styles.albumToolbar}>
        <AlbumTypeDropdown value={kind} onChange={setKind} />
        <WheelFilterButton
          label="Month"
          value={month}
          options={MONTH_FILTER_OPTIONS}
          displayValue={month === 'all' ? 'All' : MONTH_FILTER_OPTIONS.find((option) => option.value === month)?.label.slice(0, 3) ?? 'All'}
          onChange={setMonth}
        />
        <WheelFilterButton
          label="Year"
          value={year}
          options={[{ value: 'all', label: 'All Years' }, ...years.map((value) => ({ value, label: value }))]}
          displayValue={year === 'all' ? 'All' : year}
          onChange={setYear}
        />
        <SortButton order={order} onChange={setOrder} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add Photo"
          onPress={() => setAddMediaVisible(true)}
          style={({ pressed }) => [
            styles.iconControl,
            {
              borderColor: theme.surface.borderColor,
              backgroundColor: theme.color.surface,
              borderWidth: theme.surface.borderWidth,
            },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="imagePlus" size={20} color={theme.color.text} strokeWidth={1.25} />
        </Pressable>
      </View>
      <View style={[styles.albumDivider, { backgroundColor: theme.color.border }]} />
      <FlatList
        data={flatRows}
        keyExtractor={(item, index) => item.type === 'header' ? `h-${item.date}` : item.key}
        renderItem={renderFlatItem}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        contentContainerStyle={styles.albumScrollContent}
        onEndReached={() => { if (albumQuery.hasMore && !albumQuery.isLoadingMore) albumQuery.loadMore(); }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          albumQuery.isLoading ? <View style={{ paddingVertical: 24, alignItems: 'center' }}><ActivityIndicator color={theme.color.accent} /></View> :
          <EmptyState icon="images-outline" title="No media found" description="Try another filter or add a photo." />
        }
        ListFooterComponent={
          albumQuery.isLoadingMore ? <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator color={theme.color.accent} /></View> : null
        }
      />
      {viewer ? <MediaViewer asset={viewer} onClose={() => setViewer(null)} /> : null}
      <AddMediaModal
        visible={addMediaVisible}
        idolId={idolId}
        onClose={() => setAddMediaVisible(false)}
      />
    </View>
  );
}

function AlbumTypeDropdown({ value, onChange }: { value: AlbumFilterKind; onChange: (value: AlbumFilterKind) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const options: { value: AlbumFilterKind; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'cheki', label: 'Cheki' },
    { value: 'photo', label: 'Photo' },
    { value: 'video', label: 'Video' },
  ];
  const selected = options.find((option) => option.value === value)!;
  return (
    <View style={styles.dropdownHost}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Album type filter: ${selected.label}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={[
          styles.filterControl,
          styles.typeFilter,
          {
            borderColor: theme.surface.borderColor,
            backgroundColor: theme.color.surface,
            borderWidth: theme.surface.borderWidth,
          },
        ]}
      >
        <AppText weight="light" size="body" align="center">{selected.label}</AppText>
      </Pressable>
      {open ? (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: theme.color.surface,
              borderColor: theme.surface.borderColor,
              borderWidth: theme.surface.borderWidth,
              shadowColor: theme.surface.shadowColor,
              shadowOpacity: Math.max(theme.surface.shadowOpacity, 0.12),
            },
          ]}
        >
          {options.filter((option) => option.value !== value).map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.dropdownOption, { borderBottomColor: theme.color.borderLight }, pressed && styles.pressed]}
            >
              <AppText size="small">{option.label}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SortButton({ order, onChange, compact = false }: { order: DetailSortOrder; onChange: (order: DetailSortOrder) => void; compact?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort ${order === 'newest' ? 'newest first' : 'oldest first'}`}
      onPress={() => onChange(order === 'newest' ? 'oldest' : 'newest')}
      style={({ pressed }) => [
        styles.iconControl,
        compact && styles.historySortControl,
        {
          borderColor: theme.surface.borderColor,
          backgroundColor: theme.color.surface,
          borderWidth: theme.surface.borderWidth,
        },
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={order === 'newest' ? 'arrowDown' : 'arrowUp'}
        size={20}
        color={theme.color.text}
        strokeWidth={1.25}
      />
    </Pressable>
  );
}

function AlbumTile({ item, tileHeight, onPress }: { item: AlbumMediaRow; tileHeight: number; onPress: () => void }) {
  const theme = useTheme();
  const uri = item.thumbnailPath ?? item.localPath;
  const isVideo = item.kind === 'video';
  const tileWidth = Math.max(1, Math.round(tileHeight * albumMediaAspectRatio(item)));
  const handlePress = () => {
    if (!item.localPath) {
      Alert.alert('Missing media', 'The original file is not available on this device.');
      return;
    }
    onPress();
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.source === 'cheki' ? 'Cheki' : isVideo ? 'Video' : 'Photo'} media`}
      onPress={handlePress}
      style={({ pressed }) => [styles.albumTile, { width: tileWidth, height: tileHeight, backgroundColor: theme.color.surfaceMuted }, pressed && styles.pressed]}
    >
      {uri && !isVideo ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} /> : (
        <Ionicons name={isVideo ? 'videocam' : 'image-outline'} size={22} color={item.localPath ? theme.color.accent : theme.color.textMuted} />
      )}
      {isVideo ? <View style={[styles.playBadge, { backgroundColor: withAlpha(BLACK_SCALE.B900, 0.5) }]}><Ionicons name="play" size={14} color={BLACK_SCALE.B0} /></View> : null}
    </Pressable>
  );
}

function ChekiTab({
  idolId,
  stats,
  chekiTypes,
  tabBarBottomInset,
  onManageTypes,
  onOpenEvent,
}: {
  idolId: string;
  stats: ReturnType<ReturnType<typeof createAggregationService>['getIdolStats']>;
  chekiTypes: ChekiType[];
  tabBarBottomInset: number;
  onManageTypes: () => void;
  onOpenEvent: (eventId: string) => void;
}) {
  const theme = useTheme();
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [paneHeight, setPaneHeight] = useState(0);
  const historyFull = useMemo(() => readDataAtVersion(dataVersion, () => getIdolDetailHistory(getDb(), idolId)), [dataVersion, idolId]);
  const summary = summarizeChekiTypes(historyFull);
  const seenTypeIds = new Set(summary.map((line) => line.chekiTypeId));
  const summaryRows = [
    ...summary,
    ...chekiTypes.filter((type) => !type.isArchived && !seenTypeIds.has(type.id)).map((type) => ({
      chekiTypeId: type.id,
      label: type.label,
      currency: type.currency,
      unitPrice: type.unitPrice,
      quantity: 0,
      subtotal: 0,
    })),
  ];
  const chart = buildSixMonthChekiSeries(historyFull, todayISO());
  const historyHeight = Math.max(
    0,
    paneHeight - tabBarBottomInset - DETAIL_TAB_BAR_HEIGHT - (DETAIL_LAYOUT_GAP * 2),
  );
  const historyBottomPadding = tabBarBottomInset + DETAIL_TAB_BAR_HEIGHT + DETAIL_LAYOUT_GAP;
  const handlePaneLayout = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setPaneHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
  };

  return (
    <View testID="cheki-tab-viewport" onLayout={handlePaneLayout} style={styles.chekiTabViewport}>
      <ScrollView
        testID="cheki-tab-scroll"
        scrollsChildToFocus
        contentContainerStyle={[styles.scrollContent, { paddingBottom: historyBottomPadding }]}
        showsVerticalScrollIndicator={false}
        style={styles.flexOne}
      >
        <Counter chekiOnly chekiCount={stats.chekiCount} totals={stats.spendTotals} />
        <Card>
          <View style={styles.sectionHeader}>
            <AppText weight="semibold" size="large">Type Summary</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Manage Cheki Types" onPress={onManageTypes} hitSlop={10}>
              <Ionicons name="pencil" size={18} color={theme.color.accent} />
            </Pressable>
          </View>
          <View style={[styles.chekiTableRow, styles.chekiHeaderRow, { borderBottomColor: theme.surface.borderColor, borderBottomWidth: 1 }]}>
            <AppText size="body" weight="regular" style={styles.typeCol}>Type</AppText>
            <AppText size="body" weight="regular" align="center" style={styles.priceCol}>Price</AppText>
            <AppText size="body" weight="regular" align="center" style={styles.countCol}>Count</AppText>
            <AppText size="body" weight="regular" align="right" style={styles.totalCol}>Total</AppText>
          </View>
          {summaryRows.length === 0 ? <AppText size="small" muted style={styles.emptyCopy}>No Cheki Types yet.</AppText> : summaryRows.map((line, index) => {
            const isLast = index === summaryRows.length - 1;
            return (
              <View key={`${line.chekiTypeId}-${line.currency}-${line.unitPrice}`} style={[styles.chekiTableRow, { borderBottomColor: theme.color.borderLight, borderBottomWidth: isLast ? 0 : 1 }]}>
                <AppText size="small" weight="light" numberOfLines={1} style={styles.typeCol}>{line.label}</AppText>
                <AppText size="small" weight="light" align="center" numberOfLines={1} style={styles.priceCol}>{formatMoney(line.unitPrice, line.currency)}</AppText>
                <AppText size="small" weight="light" align="center" style={styles.countCol}>{line.quantity}</AppText>
                <AppText size="small" weight="light" align="right" numberOfLines={1} style={styles.totalCol}>{formatMoney(line.subtotal, line.currency)}</AppText>
              </View>
            );
          })}
        </Card>

        <Card>
          <AppText weight="semibold" size="large">Last 6 Months</AppText>
          <ChekiChart series={chart} />
        </Card>

        <FilteredHistory
          idolId={idolId}
          height={historyHeight}
          emptyTitle="No Cheki history"
          renderItem={(event) => <ChekiHistoryCard key={event.id} event={event} onPress={() => onOpenEvent(event.id)} />}
        />
      </ScrollView>
    </View>
  );
}

const PLOT_HEIGHT = 116;

export function calculateChartTicks(maxCount: number, maxLines = 5): { step: number; yMax: number; ticks: number[] } {
  if (maxCount <= 0) {
    return { step: 2, yMax: 4, ticks: [2, 4] };
  }

  const multipliers = [2, 5, 10, 25, 50];
  let magnitude = 1;

  while (true) {
    for (const m of multipliers) {
      const step = m * magnitude;
      const lines = Math.ceil(maxCount / step);
      if (lines <= maxLines) {
        const numLines = Math.max(1, lines);
        const yMax = numLines * step;
        const ticks: number[] = [];
        for (let i = 1; i <= numLines; i++) {
          ticks.push(i * step);
        }
        return { step, yMax, ticks };
      }
    }
    magnitude *= 10;
  }
}

function ChekiChart({ series }: { series: { key: string; label: string; count: number }[] }) {
  const theme = useTheme();
  const max = Math.max(0, ...series.map((item) => item.count));
  const { yMax, ticks } = useMemo(() => calculateChartTicks(max), [max]);
  const gridLineColor = 'rgba(0, 0, 0, 0.5)';
  const baselineColor = 'rgba(0, 0, 0, 0.5)';

  return (
    <View style={styles.chart}>
      <View style={styles.chartPlotArea}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {ticks.map((tick) => {
            const bottomPos = (tick / yMax) * PLOT_HEIGHT;
            return (
              <View key={tick} style={[styles.gridLineRow, { bottom: bottomPos }]}>
                <Svg height="1" width="100%">
                  <Line x1="0" y1="0" x2="100%" y2="0" stroke={gridLineColor} strokeWidth="1" strokeDasharray="4 4" />
                </Svg>
              </View>
            );
          })}
        </View>
        <View style={styles.chartBarsRow}>
          {series.map((item) => {
            const barHeight = item.count > 0 ? (item.count / yMax) * PLOT_HEIGHT : 0;
            return (
              <View key={item.key} style={styles.chartBarSlot}>
                {item.count > 0 ? (
                  <AppText size="xs" color={theme.color.accent} style={styles.chartValueText}>
                    {item.count}
                  </AppText>
                ) : null}
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: Math.max(item.count > 0 ? 8 : 0, barHeight),
                      backgroundColor: theme.color.accent,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={[styles.baseline, { backgroundColor: baselineColor }]} />
      <View style={styles.chartLabelsRow}>
        {series.map((item) => (
          <AppText key={item.key} weight="light" size="xs" align="center" style={styles.chartMonthLabel}>
            {item.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

function FilteredHistory({
  idolId,
  height,
  emptyTitle,
  renderItem,
}: {
  idolId: string;
  height: number;
  emptyTitle: string;
  renderItem: (event: IdolDetailHistoryRow) => React.ReactNode;
}) {
  const theme = useTheme();
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  const [order, setOrder] = useState<DetailSortOrder>('newest');
  const years = useMemo(() => readDataAtVersion(dataVersion, () => {
    const db = getDb();
    const rows = db.getAllSync<{ y: string }>(`SELECT DISTINCT substr(e.event_date,1,4) AS y FROM cheki_entry ce JOIN event e ON e.id = ce.event_id WHERE ce.idol_id = ? AND ce.deleted_at IS NULL AND e.deleted_at IS NULL ORDER BY y DESC`, idolId);
    return rows.map((r) => r.y);
  }), [dataVersion, idolId]);

  const filters = useMemo(() => ({ month, year }), [month, year]);
  const fetchHistory = useCallback((args: { filters: typeof filters; sort: DetailSortOrder; limit: number; cursor: string | null }) => {
    return readDataAtVersion(dataVersion, () => getIdolDetailHistoryPage(getDb(), idolId, { filters: args.filters as never, sort: args.sort, limit: args.limit, cursor: args.cursor }));
  }, [dataVersion, idolId]);

  const { items: filtered, hasMore, isLoading, isLoadingMore, loadMore } = usePaginatedQuery(fetchHistory, filters, order, 30);

  return (
    <View
      testID="cheki-history-container"
      style={[
        styles.historyContainer,
        {
          height,
          backgroundColor: theme.color.surface,
          borderColor: theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.shadowOpacity,
          shadowRadius: theme.surface.shadowRadius,
          elevation: theme.surface.elevation,
        },
      ]}
    >
      <View testID="cheki-history-header" style={styles.historyToolbar}>
        <AppText weight="semibold" size="large" style={styles.flexOne}>History</AppText>
        <WheelFilterButton
          label="Month"
          value={month}
          options={MONTH_FILTER_OPTIONS}
          displayValue={month === 'all' ? 'All' : MONTH_FILTER_OPTIONS.find((option) => option.value === month)?.label.slice(0, 3) ?? 'All'}
          onChange={setMonth}
          compact
        />
        <WheelFilterButton
          label="Year"
          value={year}
          options={[{ value: 'all', label: 'All Years' }, ...years.map((value) => ({ value, label: value }))]}
          displayValue={year === 'all' ? 'All' : year}
          onChange={setYear}
          compact
        />
        <SortButton order={order} onChange={setOrder} compact />
      </View>
      <View testID="cheki-history-divider" style={[styles.historyDivider, { backgroundColor: theme.surface.borderColor }]} />
      <FlatList
        testID="cheki-history-scroll"
        data={filtered as IdolDetailHistoryRow[]}
        keyExtractor={(item) => (item as IdolDetailHistoryRow).id}
        renderItem={({ item }) => <>{renderItem(item as IdolDetailHistoryRow)}</>}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollsToTop={false}
        style={styles.historyList}
        contentContainerStyle={styles.historyListContent}
        onEndReached={() => { if (hasMore && !isLoadingMore) loadMore(); }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          isLoading ? <View style={{ paddingVertical: 16, alignItems: 'center' }}><ActivityIndicator color={theme.color.accent} /></View> :
          <AppText size="small" muted style={styles.emptyCopy}>{emptyTitle}</AppText>
        }
        ListFooterComponent={isLoadingMore ? <View style={{ paddingVertical: 12, alignItems: 'center' }}><ActivityIndicator color={theme.color.accent} /></View> : null}
      />
    </View>
  );
}

function ChekiHistoryCard({ event, onPress }: { event: IdolDetailHistoryRow; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cheki history: ${event.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chekiHistoryCard,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          borderRadius: theme.radius.lg,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.shadowOpacity,
          shadowRadius: theme.surface.shadowRadius,
          shadowOffset: { width: 0, height: 2 },
          elevation: theme.surface.elevation,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.historyCardHeader}>
        <AppText weight="regular" size="large" style={styles.flexOne} numberOfLines={1}>
          {formatISODateFull(event.eventDate)}
        </AppText>
        <AppText weight="regular" size="large" color={theme.color.accent}>
          ×{event.chekiCount}
        </AppText>
      </View>
      <View style={[styles.historyHeaderDivider, { backgroundColor: theme.surface.borderColor }]} />
      {event.types.map((line) => (
        <View key={`${line.chekiTypeId}-${line.currency}-${line.unitPrice}`} style={styles.historyTypeLine}>
          <AppText weight="light" size="small" color={theme.color.accent} style={styles.historyTypeQty}>
            {line.quantity}×
          </AppText>
          <AppText weight="light" size="small" style={styles.historyTypeLabel} numberOfLines={1}>
            {line.label}
          </AppText>
          <AppText weight="light" size="small" align="right" style={styles.historyTypeSubtotal}>
            {formatMoney(line.subtotal, line.currency)}
          </AppText>
        </View>
      ))}
      <View style={styles.historySubtotalContainer}>
        <View style={[styles.historySubtotalDivider, { backgroundColor: theme.color.accent }]} />
        <AppText weight="light" size="small" align="right" color={theme.color.accent}>
          Sub total {formatMoneyTotals(event.chekiTotals, { separator: ' · ' }) ?? '—'}
        </AppText>
      </View>
    </Pressable>
  );
}

function ChekiTypeManagerModal({
  visible,
  idolId,
  types,
  onClose,
}: {
  visible: boolean;
  idolId: string;
  types: ChekiType[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const [labels, setLabels] = useState<Record<string, string>>({});
  const countries = useSettingsStore((state) => state.countries);
  const bumpDataVersion = useUiStore((state) => state.bumpDataVersion);
  const availableCurrencies = useMemo(() => {
    const activeCountries = countries.filter((country) => country.isActive).map((country) => country.country);
    const currencyCountries = activeCountries.length > 0 ? activeCountries : COUNTRIES.map((country) => country.code);
    return [...new Set(currencyCountries.map((country) => CURRENCIES[country]))];
  }, [countries]);
  const [newType, setNewType] = useState<ChekiTypeFormData>(() => ({
    label: '',
    currency: availableCurrencies[0] ?? 'JPY',
    unitPrice: 0,
  }));
  const [adding, setAdding] = useState(false);
  const [newError, setNewError] = useState('');

  const resetNewType = () => {
    setNewType({ label: '', currency: availableCurrencies[0] ?? 'JPY', unitPrice: 0 });
    setNewError('');
  };
  const startAdd = () => {
    resetNewType();
    setAdding(true);
  };
  const cancelAdd = () => {
    resetNewType();
    setAdding(false);
  };

  const saveLabel = (type: ChekiType) => {
    const label = labels[type.id]?.trim();
    if (!label || label === type.label) return;
    createIdolRepo(getDb()).updateChekiType(type.id, { label });
    bumpDataVersion();
  };
  const toggleArchive = (type: ChekiType) => {
    createIdolRepo(getDb()).updateChekiType(type.id, { isArchived: !type.isArchived });
    bumpDataVersion();
  };
  const setDefault = (type: ChekiType) => {
    createIdolRepo(getDb()).setDefaultChekiType(type.id);
    bumpDataVersion();
  };
  const addType = () => {
    if (!newType.label.trim()) {
      setNewError('Type name is required.');
      return;
    }
    try {
      createIdolRepo(getDb()).createChekiType({
        idolId,
        label: newType.label.trim(),
        currency: newType.currency,
        unitPrice: newType.unitPrice,
      });
      bumpDataVersion();
      cancelAdd();
    } catch (error) {
      setNewError(error instanceof Error ? error.message : 'Could not add the cheki type.');
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Manage Cheki Types">
      {types.map((type) => (
        <View key={type.id} style={[styles.managerRow, { borderBottomColor: theme.color.borderLight }]}>
          <View style={styles.managerMain}>
            <TextInput
              accessibilityLabel={`${type.label} type name`}
              value={labels[type.id] ?? type.label}
              onChangeText={(value) => setLabels((current) => ({ ...current, [type.id]: value }))}
              onSubmitEditing={() => saveLabel(type)}
              style={[
                styles.managerInput,
                TYPOGRAPHY.regular.body,
                {
                  color: theme.color.text,
                  backgroundColor: theme.color.surface,
                  borderColor: theme.surface.borderColor,
                  borderRadius: theme.radius.sm,
                  borderWidth: theme.surface.borderWidth,
                },
              ]}
            />
            <AppText weight="light" size="small" muted>
              {formatMoney(type.unitPrice, type.currency)} · price locked
            </AppText>
          </View>
          {type.isDefault ? (
            <AppText size="xs" color={theme.color.accent}>Default</AppText>
          ) : !type.isArchived ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Set ${type.label} as default`}
              onPress={() => setDefault(type)}
              style={({ pressed }) => [
                styles.managerDefaultButton,
                {
                  borderColor: theme.color.accent,
                  borderRadius: theme.radius.pill,
                  borderWidth: theme.surface.borderWidth,
                  backgroundColor: theme.color.accentSurface,
                },
                pressed && styles.pressed,
              ]}
            >
              <AppText size="xs" weight="semibold" color={theme.color.accent}>Set default</AppText>
            </Pressable>
          ) : null}
          <Pressable accessibilityLabel={`Save ${type.label}`} onPress={() => saveLabel(type)} hitSlop={8}>
            <Ionicons name="checkmark" size={20} color={theme.color.accent} />
          </Pressable>
          <Pressable accessibilityLabel={`${type.isArchived ? 'Reactivate' : 'Archive'} ${type.label}`} onPress={() => toggleArchive(type)} hitSlop={8}>
            <Ionicons name={type.isArchived ? 'refresh-outline' : 'archive-outline'} size={19} color={type.isArchived ? theme.color.success : theme.color.textMuted} />
          </Pressable>
        </View>
      ))}

      <View style={styles.addTypeSection}>
        <View style={styles.sectionHeader}>
          <AppText weight="semibold" size="body">Add Cheki Type</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={adding ? 'Cancel add Cheki Type' : 'Add Cheki Type'}
            onPress={adding ? cancelAdd : startAdd}
            hitSlop={10}
          >
            <Ionicons
              name={adding ? 'close' : 'add-circle-outline'}
              size={22}
              color={adding ? theme.color.textMuted : theme.color.accent}
            />
          </Pressable>
        </View>
        {adding ? (
          <>
            <ChekiTypeRow
              chekiType={newType}
              availableCurrencies={availableCurrencies}
              onChange={(patch) => {
                setNewType((current) => ({ ...current, ...patch }));
                setNewError('');
              }}
              onRemove={cancelAdd}
              isLast
              onAdd={addType}
              typeInputAccessibilityLabel="New Cheki Type Name"
              priceInputAccessibilityLabel="New Cheki Type Price"
            />
            {newError ? <AppText size="xs" color={theme.color.danger}>{newError}</AppText> : null}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { height: 270, overflow: 'hidden', borderBottomWidth: 1 },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  heroActions: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  heroIconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  heroIdentity: { position: 'absolute', left: 16, right: 16, bottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, zIndex: 10 },
  heroText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  heroName: { flexShrink: 1 },
  favoriteButton: { width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  paneHost: { flex: 1 },
  pane: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  chekiTabViewport: { flex: 1 },
  hiddenPane: { display: 'none' },
  scrollContent: { padding: 16, paddingBottom: 84, gap: 16 },
  tabBarWrapper: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 40 },
  pressed: { opacity: 0.72 },
  infoCard: { paddingVertical: 0 },
  infoRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  infoRight: { flex: 1, alignItems: 'flex-end' },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorSwatch: { width: 18, height: 18, borderRadius: 6, borderWidth: 1 },
  membershipRow: { borderTopWidth: StyleSheet.hairlineWidth },
  historyTitleRow: { flexDirection: 'row', alignItems: 'center' },
  historyEditButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  membershipHeader: { flexDirection: 'row', alignItems: 'center' },
  membershipGroup: { flex: 1, minWidth: 0 },
  membershipDate: { flexShrink: 0 },
  membershipPeriods: { gap: 4 },
  flexOne: { flex: 1 },
  emptyCopy: { paddingVertical: 16, textAlign: 'center' },
  albumScrollContent: { padding: 16, paddingBottom: 84, gap: 8 },
  albumToolbar: { width: '100%', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 5 },
  albumDivider: { height: StyleSheet.hairlineWidth },
  filterControl: { height: 36, borderWidth: 1, borderRadius: 8, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  typeFilter: { width: '100%', paddingHorizontal: 12, justifyContent: 'center' },
  dropdownHost: { flex: 1, zIndex: 10 },
  dropdown: { position: 'absolute', top: 38, left: 0, right: 0, borderWidth: 1, borderRadius: 8, overflow: 'hidden', shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
  dropdownOption: { height: 36, paddingHorizontal: 8, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  iconControl: { width: 36, height: 36, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  albumGroup: { gap: 8 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  albumTile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  playBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  chekiTableRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chekiHeaderRow: { minHeight: 32 },
  typeCol: { flex: 1.1 },
  priceCol: { flex: 1.15 },
  countCol: { width: 48 },
  totalCol: { flex: 1.25 },
  chart: { width: '100%', paddingTop: 12, marginTop: 8 },
  chartPlotArea: { height: 136, width: '100%', position: 'relative' },
  gridLineRow: { position: 'absolute', left: 0, right: 0, height: 1 },
  chartBarsRow: { width: '100%', height: '100%', flexDirection: 'row', alignItems: 'flex-end' },
  chartBarSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  chartValueText: { marginBottom: 2 },
  chartBar: { width: 18, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  baseline: { width: '100%', height: 1.5 },
  chartLabelsRow: { width: '100%', flexDirection: 'row', paddingTop: 6 },
  chartMonthLabel: { flex: 1, textAlign: 'center' },
  historyContainer: { width: '100%', padding: 16, borderRadius: 16, gap: 8, overflow: 'hidden' },
  historyToolbar: { width: '100%', minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 3 },
  historyDivider: { width: '100%', height: 1 },
  historyList: { flex: 1, width: '100%' },
  historyListContent: { gap: CARD_STACK_GAP, paddingBottom: 1 },
  historySortControl: { width: 28, height: 28, borderRadius: 8 },
  chekiHistoryCard: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyHeaderDivider: {
    height: 1,
    width: '100%',
    marginVertical: 2,
  },
  historyTypeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyTypeQty: {
    width: 24,
  },
  historyTypeLabel: {
    flex: 1,
  },
  historyTypeSubtotal: {
    textAlign: 'right',
  },
  historySubtotalContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    gap: 2,
    marginTop: 2,
  },
  historySubtotalDivider: {
    width: 94,
    height: 1,
  },
  managerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  managerMain: { flex: 1, gap: 4 },
  managerInput: { minHeight: 40, paddingHorizontal: 10, paddingVertical: 6 },
  managerDefaultButton: { paddingHorizontal: 8, paddingVertical: 5 },
  addTypeSection: { marginTop: 20, gap: 8 },
});

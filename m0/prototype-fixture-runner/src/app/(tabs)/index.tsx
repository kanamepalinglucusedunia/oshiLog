import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { Calendar } from '@/components/ui/Calendar';
import { IdolCard } from '@/components/ui/IdolCard';
import { EventCard } from '@/components/ui/EventCard';
import { TripCard } from '@/components/ui/TripCard';
import { Chip } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import { Screen } from '@/components/ui/Screen';
import { SwipeableTab } from '@/components/ui/SwipeableTab';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTabPagerStore } from '@/stores/tabPagerStore';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { createAggregationService, totalsToSortedList } from '@/services/aggregation';
import {
  getActiveTrip,
  getEventsByDate,
  getMonthEventDates,
  getRecentEventsWithStats,
  getTopIdols,
  resolveIdolPhotoUris,
  type TopIdolMetric,
} from '@/services/dashboard';
import { getDb } from '@/db';
import { createIdolRepo } from '@/repositories/idol';
import { formatMoney, formatMoneyTotals } from '@/utils/money';
import { formatISODate, todayISO } from '@/utils/date';
import { CARD_STACK_GAP } from '@/design-system/theme';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const setFocusedIndex = useTabPagerStore((s) => s.setFocusedIndex);
  const headerLabel = useSettingsStore((s) => s.settings?.homeHeaderLabel ?? 'oshiLog');
  const today = useMemo(() => todayISO(), []);
  const [topMetric, setTopMetric] = useState<TopIdolMetric>('cheki');
  const now = new Date();
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [calendarView, setCalendarView] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() + 1 }));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const stats = useMemo(() => readDataAtVersion(dataVersion, () => createAggregationService(getDb()).getHomeStats()), [dataVersion]);
  const totals = useMemo(() => totalsToSortedList(stats.spendingTotals), [stats.spendingTotals]);
  const activeTrip = useMemo(() => readDataAtVersion(dataVersion, () => getActiveTrip(getDb(), today)), [today, dataVersion]);
  const recentEvents = useMemo(() => readDataAtVersion(dataVersion, () => getRecentEventsWithStats(getDb(), 4)), [dataVersion]);
  const topIdols = useMemo(() => readDataAtVersion(dataVersion, () => getTopIdols(getDb(), topMetric, 5)), [topMetric, dataVersion]);
  const calendarMonthKey = `${calendarView.year}-${String(calendarView.month).padStart(2, '0')}`;
  const monthEvents = useMemo(
    () => readDataAtVersion(dataVersion, () => getMonthEventDates(getDb(), calendarMonthKey)),
    [calendarMonthKey, dataVersion],
  );
  const idolPhotos = useMemo(
    () => resolveIdolPhotoUris(getDb(), topIdols.map((i) => i.photoMediaId)),
    [topIdols],
  );
  const dateEvents = useMemo(
    () => readDataAtVersion(dataVersion, () => (selectedDate ? getEventsByDate(getDb(), selectedDate) : [])),
    [selectedDate, dataVersion],
  );

  const tripStats = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      if (!activeTrip) return null;
      return createAggregationService(getDb()).getTripStats(activeTrip.id);
    });
  }, [activeTrip, dataVersion]);

  const tripSpend = useMemo(() => {
    if (!tripStats) return null;
    return formatMoneyTotals(tripStats.eventTotals, { compact: true });
  }, [tripStats]);
  return (
    <>
    <SwipeableTab index={0} onNavigate={(i) => setFocusedIndex(i)}>
      <Screen scroll>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <AppText weight="semibold" size="h2">
              Oshilog
            </AppText>
            <AppText size="body" weight="regular">
              {headerLabel}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
            hitSlop={12}
            style={({ pressed }) => [styles.settingsButton, pressed && { opacity: 0.6 }]}
          >
            <Icon name="settings" size={22} color={theme.color.text} strokeWidth={1} />
          </Pressable>
        </View>

        {/* Main Herocard / Activity Card */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.color.surface,
              borderRadius: theme.radius.lg,
              borderWidth: theme.surface.borderWidth,
              borderColor: theme.surface.borderColor,
            },
          ]}
        >
          <View style={styles.heroHeader}>
            <AppText weight="semibold" size="h3">
              Activity
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View activity summary"
              onPress={() => router.push('/stats')}
              hitSlop={8}
              style={({ pressed }) => [
                styles.detailButton,
                {
                  backgroundColor: theme.color.accentSurface,
                  borderColor: theme.color.accent,
                  borderRadius: theme.radius.sm,
                  borderWidth: theme.surface.borderWidth,
                  gap: theme.spacing.xs,
                  paddingVertical: theme.spacing.xs + 2,
                  paddingLeft: theme.spacing.sm,
                  paddingRight: theme.spacing.xs,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppText size="body" weight="light" color={theme.color.accent}>
                Detail
              </AppText>
              <Icon name="chevronRight" size={16} color={theme.color.accent} strokeWidth={1.5} />
            </Pressable>
          </View>

          {totals.length === 0 ? (
            <View style={[styles.currencyBox, { backgroundColor: theme.color.accentSurface, borderColor: theme.color.accentMuted }]}>
              <AppText muted size="body" align="center">
                No spending yet
              </AppText>
            </View>
          ) : (
            <View style={[styles.currencyBox, { backgroundColor: theme.color.accentSurface, borderColor: theme.color.accentMuted }]}>
              {totals.map((total, index) => (
                <View key={total.currency}>
                  {index > 0 ? <View style={[styles.currencyDivider, { backgroundColor: theme.color.accentMuted }]} /> : null}
                  <View style={styles.currencyRow}>
                    <AppText size="large" weight="regular" color={theme.color.text} style={styles.currencyCode}>
                      {total.currency}
                    </AppText>
                    <AppText size="large" weight="regular" color={theme.color.text} numberOfLines={1} style={styles.currencyAmount}>
                      {formatMoney(total.amount, total.currency)}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.statValueRow}>
                <Icon name="camera" size={24} color={theme.color.accent} strokeWidth={1} />
                <AppText size="large" weight="light" color={theme.color.accent}>{stats.chekiCount.toLocaleString()}</AppText>
              </View>
              <AppText size="small" weight="light" color={theme.color.text}>Cheki</AppText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.color.accentMuted }]} />
            <View style={styles.statItem}>
              <View style={styles.statValueRow}>
                <Icon name="calendar" size={24} color={theme.color.accent} strokeWidth={1} />
                <AppText size="large" weight="light" color={theme.color.accent}>{stats.eventCount.toLocaleString()}</AppText>
              </View>
              <AppText size="small" weight="light" color={theme.color.text}>Event</AppText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.color.accentMuted }]} />
            <View style={styles.statItem}>
              <View style={styles.statValueRow}>
                <Icon name="plane" size={24} color={theme.color.accent} strokeWidth={1} />
                <AppText size="large" weight="light" color={theme.color.accent}>{stats.tripCount.toLocaleString()}</AppText>
              </View>
              <AppText size="small" weight="light" color={theme.color.text}>Trip</AppText>
            </View>
          </View>
        </View>

        {/* Calendar */}
        <View style={styles.section}>
          <Calendar
            year={calendarView.year}
            month={calendarView.month}
            markedDates={monthEvents}
            today={today}
            selectedDate={selectedDate}
            onChangeMonth={(year, month) => setCalendarView({ year, month })}
            onSelectDate={(date) => setSelectedDate(date)}
          />
        </View>

        {/* Active Trip */}
        {activeTrip ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText weight="semibold" size="large">Ongoing Trip</AppText>
            </View>
            <TripCard
              title={activeTrip.title}
              startDate={activeTrip.startDate}
              endDate={activeTrip.endDate}
              today={today}
              eventCount={tripStats?.eventCount ?? 0}
              spendLabel={tripSpend}
              onPress={() => router.push(`/trip/${activeTrip.id}`)}
            />
          </View>
        ) : null}

        {/* Top Idol */}
        {topIdols.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText weight="semibold" size="large">Top Idol</AppText>
              <View style={styles.metricRow}>
                {(['cheki', 'event'] as TopIdolMetric[]).map((m) => (
                  <Chip
                    key={m}
                    label={m === 'cheki' ? 'Cheki' : 'Event'}
                    selected={topMetric === m}
                    onPress={() => setTopMetric(m)}
                  />
                ))}
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.idolList}>
              {topIdols.map((idol) => (
                <IdolCard
                  key={idol.idolId}
                  idol={{
                    name: idol.idolName,
                    status: idol.status,
                    isFavorite: idol.isFavorite,
                    groupName: idol.groupName,
                    eventCount: idol.eventCount,
                    chekiCount: idol.chekiCount,
                    spendLabel: formatMoneyTotals(idol.spendTotals, { compact: true }),
                  }}
                  photoUri={idolPhotos.get(idol.photoMediaId ?? '') ?? null}
                  onPress={() => router.push(`/idol/${idol.idolId}`)}
                  onFavoritePress={() => {
                    createIdolRepo(getDb()).updateIdol(idol.idolId, { isFavorite: !idol.isFavorite });
                  }}
                  width={132}
                  photoHeight={132}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Recent Event */}
        {recentEvents.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText weight="semibold" size="large">Recent Event</AppText>
            </View>
            <View style={styles.eventList}>
              {recentEvents.map((event) => (
                <EventCard
                  key={event.id}
                  title={event.title}
                  eventDate={event.eventDate}
                  chekiCount={event.chekiCount}
                  region={event.venueRegion}
                  venue={event.venueName}
                  spendLabel={formatMoneyTotals(event.spendTotals, { compact: true })}
                  onPress={() => router.push(`/event/${event.id}`)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Screen>
    </SwipeableTab>

    {/* Events on selected date */}
    <Modal
      visible={selectedDate !== null}
      onClose={() => setSelectedDate(null)}
      title={selectedDate ? formatISODate(selectedDate) : undefined}
    >
        {dateEvents.length === 0 ? (
          <AppText muted>No events on this date.</AppText>
        ) : (
          dateEvents.map((event) => (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              onPress={() => {
                setSelectedDate(null);
                router.push(`/event/${event.id}`);
              }}
              style={({ pressed }) => [
                styles.dateEventRow,
                {
                  borderColor: theme.surface.borderColor,
                  borderBottomWidth: theme.surface.borderWidth,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppText size="body" weight="regular" numberOfLines={1} style={{ flex: 1 }}>
                {event.title}
              </AppText>
              {event.venueName ? (
                <AppText size="small" muted numberOfLines={1}>
                  {event.venueName}
                </AppText>
              ) : null}
            </Pressable>
          ))
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    gap: 0,
  },
  settingsButton: {
    padding: 6,
  },
  heroCard: {
    padding: 16,
    gap: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyBox: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  currencyCode: {
    flexShrink: 0,
  },
  currencyAmount: {
    flexShrink: 1,
    textAlign: 'right',
  },
  currencyDivider: {
    height: 1,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  section: {
    marginTop: 16,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  idolList: {
    gap: 8,
    paddingRight: 16,
  },
  eventList: {
    gap: CARD_STACK_GAP,
  },
  dateEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
});

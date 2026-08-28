import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityBreakdownCard } from '@/components/ui/ActivityBreakdownCard';
import { AppText } from '@/components/ui/AppText';
import { Calendar } from '@/components/ui/Calendar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Header } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Screen } from '@/components/ui/Screen';
import { TopIdolPodium } from '@/components/ui/TopIdolPodium';
import { useTheme } from '@/hooks/useTheme';
import { getDb } from '@/db';
import { getActivitySummary } from '@/services/activitySummary';
import { getEventsByDate, getMonthEventDates, resolveIdolPhotoUris } from '@/services/dashboard';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { formatISODate, todayISO } from '@/utils/date';

export default function StatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const today = useMemo(() => todayISO(), []);
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [calendarView, setCalendarView] = useState(() => ({ year: currentYear, month: Number(today.slice(5, 7)) }));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dataVersion = useUiStore((state) => state.dataVersion);
  const range = useMemo(() => ({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }), [year]);

  const summary = useMemo(
    () => readDataAtVersion(dataVersion, () => getActivitySummary(getDb(), range)),
    [dataVersion, range],
  );
  const calendarMonthKey = `${calendarView.year}-${String(calendarView.month).padStart(2, '0')}`;
  const monthEvents = useMemo(
    () => readDataAtVersion(dataVersion, () => getMonthEventDates(getDb(), calendarMonthKey)),
    [calendarMonthKey, dataVersion],
  );
  const dateEvents = useMemo(
    () => readDataAtVersion(dataVersion, () => (selectedDate ? getEventsByDate(getDb(), selectedDate) : [])),
    [dataVersion, selectedDate],
  );
  const idolPhotos = useMemo(
    () => readDataAtVersion(dataVersion, () => resolveIdolPhotoUris(getDb(), summary.topIdols.map((idol) => idol.photoMediaId))),
    [dataVersion, summary.topIdols],
  );

  const changeYear = (delta: number) => {
    const nextYear = year + delta;
    if (nextYear > currentYear) return;
    setYear(nextYear);
    setCalendarView((current) => ({ year: nextYear, month: current.month }));
    setSelectedDate(null);
  };

  return (
    <>
      <Screen scroll>
        <Header
          title="Activity Summary"
          subtitle={`${year} Replay`}
          right={(
            <View style={styles.yearControl}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous year"
                onPress={() => changeYear(-1)}
                hitSlop={8}
              >
                <Icon name="chevronLeft" size={18} color={theme.color.accent} strokeWidth={1.5} />
              </Pressable>
              <AppText size="small" weight="semibold" color={theme.color.accent}>{year}</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next year"
                onPress={() => changeYear(1)}
                disabled={year >= currentYear}
                hitSlop={8}
                style={year >= currentYear ? styles.disabled : null}
              >
                <Icon name="chevronRight" size={18} color={theme.color.accent} strokeWidth={1.5} />
              </Pressable>
            </View>
          )}
        />

        <View
          style={[
            styles.hero,
            {
              backgroundColor: theme.color.accent,
              borderColor: theme.color.accentStrong,
              borderRadius: theme.radius.lg,
              borderWidth: theme.surface.borderWidth,
              padding: theme.spacing.lg,
            },
          ]}
        >
          <AppText weight="bold" size="h2" color={theme.color.onAccent}>
            Your activity in numbers
          </AppText>
          <AppText size="body" color={theme.color.onAccent}>
            A year of showing up
          </AppText>
          <View style={styles.heroStats}>
            <SummaryMetric value={summary.eventCount} label="Events" color={theme.color.onAccent} />
            <SummaryMetric value={summary.chekiCount} label="Cheki" color={theme.color.onAccent} />
            <SummaryMetric value={summary.tripCount} label="Trips" color={theme.color.onAccent} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <AppText weight="semibold" size="large">Event calendar</AppText>
              <AppText size="small" muted>{summary.eventCount.toLocaleString()} events this year</AppText>
            </View>
          </View>
          <Calendar
            year={calendarView.year}
            month={calendarView.month}
            markedDates={monthEvents}
            today={today}
            selectedDate={selectedDate}
            onChangeMonth={(nextYear, nextMonth) => setCalendarView({ year: nextYear, month: nextMonth })}
            onSelectDate={setSelectedDate}
          />
        </View>

        <View style={styles.section}>
          <ActivityBreakdownCard
            spendingBreakdown={summary.spendingBreakdown}
            chekiBreakdown={summary.chekiBreakdown}
          />
        </View>

        <View style={styles.section}>
          {summary.topIdols.length > 0 ? (
            <TopIdolPodium
              idols={summary.topIdols}
              photoUris={idolPhotos}
              onIdolPress={(idolId) => router.push(`/idol/${idolId}`)}
            />
          ) : (
            <Card>
              <EmptyState
                icon="star-outline"
                title="No top idol yet"
                description="Add Cheki entries in this period to build your podium."
              />
            </Card>
          )}
        </View>
      </Screen>

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
              accessibilityLabel={event.title}
              onPress={() => {
                setSelectedDate(null);
                router.push(`/event/${event.id}`);
              }}
              style={({ pressed }) => [
                styles.dateEventRow,
                { borderColor: theme.surface.borderColor, borderBottomWidth: theme.surface.borderWidth },
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppText size="body" numberOfLines={1} style={styles.dateEventTitle}>
                {event.title}
              </AppText>
              {event.venueName ? <AppText size="small" muted numberOfLines={1}>{event.venueName}</AppText> : null}
            </Pressable>
          ))
        )}
      </Modal>
    </>
  );
}

function SummaryMetric({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.summaryMetric}>
      <AppText weight="bold" size="h2" color={color}>{value.toLocaleString()}</AppText>
      <AppText size="small" color={color}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  yearControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  disabled: {
    opacity: 0.35,
  },
  hero: {
    gap: 4,
  },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  summaryMetric: {
    flex: 1,
    alignItems: 'center',
  },
  section: {
    marginTop: 16,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleWrap: {
    gap: 2,
  },
  dateEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dateEventTitle: {
    flex: 1,
  },
});

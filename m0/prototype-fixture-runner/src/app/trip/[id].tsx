import { Fragment, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Counter } from '@/components/ui/Counter';
import { Divider } from '@/components/ui/Divider';
import { EventCard } from '@/components/ui/EventCard';
import { Header } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { Chip } from '@/components/ui/Chip';
import { useTheme } from '@/hooks/useTheme';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { getDb } from '@/db';
import { createTripRepo } from '@/repositories/trip';
import { createEventRepo, type EventListRow } from '@/repositories/event';
import { createAggregationService, totalsToSortedList } from '@/services/aggregation';
import { COUNTRIES, EXPENSE_CATEGORY_LABELS, type CurrencyCode, type ExpenseCategory } from '@/types/domain';
import { formatISODateCompact, formatISODateFull, todayISO } from '@/utils/date';
import { formatMinorUnits, formatMoney, formatMoneyInput, formatMoneyTotals, parseMinorUnits } from '@/utils/money';
import { CARD_STACK_GAP, SPACING } from '@/design-system/theme';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [expenseModal, setExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const [spendingDetailsExpanded, setSpendingDetailsExpanded] = useState(false);

  const trip = useMemo(() => readDataAtVersion(dataVersion, () => createTripRepo(getDb()).getTrip(id)), [id, dataVersion]);
  const countries = useMemo(() => readDataAtVersion(dataVersion, () => createTripRepo(getDb()).listTripCountries(id)), [id, dataVersion]);
  const expenses = useMemo(() => readDataAtVersion(dataVersion, () => createTripRepo(getDb()).listExpenses(id)), [id, dataVersion]);
  const events = useMemo(() => readDataAtVersion(dataVersion, () => createEventRepo(getDb()).listEventsWithSummary().filter((e) => e.tripId === id)), [id, dataVersion]);
  const stats = useMemo(() => readDataAtVersion(dataVersion, () => createAggregationService(getDb()).getTripStats(id)), [id, dataVersion]);

  if (!trip) return <EntityNotFound entity="Trip" onBack={() => router.replace('/(tabs)/trips')} />;

  const eventTotals = totalsToSortedList(stats.eventTotals);
  const spendingTotals = (Object.keys(stats.eventTotals) as CurrencyCode[]).reduce(
    (totals, currency) => ({
      ...totals,
      [currency]: stats.eventTotals[currency] + stats.expenseTotals[currency],
    }),
    {} as Record<CurrencyCode, number>,
  );
  const countryNames = countries
    .map((code) => COUNTRIES.find((country) => country.code === code)?.name ?? code)
    .join(', ');

  const categoryLabel = (e: (typeof expenses)[number]) =>
    e.category === 'other' && e.customCategoryLabel ? e.customCategoryLabel : EXPENSE_CATEGORY_LABELS[e.category];

  return (
    <Screen contentStyle={styles.screenContent}>
      <Header
        variant="detail"
        testID="trip-detail-header"
        title="Trip Details"
        titleContent={<AppText size="h3" weight="semibold" numberOfLines={1}>Trip Details</AppText>}
        right={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit trip"
            hitSlop={10}
            onPress={() => router.push(`/trip/edit?id=${trip.id}`)}
          >
            <Icon name="edit" size={24} color={theme.color.text} strokeWidth={2} viewBoxPadding={1} />
          </Pressable>
        )}
      />
      <ScrollView
        testID="trip-detail-content"
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        scrollsChildToFocus
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: 120,
          gap: theme.spacing.md,
        }}
      >
        <Card style={styles.infoCard}>
          <AppText size="large" weight="semibold" numberOfLines={2}>{trip.title}</AppText>
          <View style={[styles.majorDivider, { backgroundColor: theme.surface.borderColor }]} />
          <AppText size="body" weight="regular" color={theme.color.accent}>
            {formatISODateFull(trip.startDate)} - {formatISODateFull(trip.endDate)}
          </AppText>
          <View style={[styles.innerDivider, { backgroundColor: theme.color.borderLight }]} />
          <View style={styles.detailRow}>
            <AppText size="small" weight="light" style={styles.detailLabel}>Country</AppText>
            <AppText size="small" weight="regular" style={styles.detailValue}>{countryNames || '—'}</AppText>
          </View>
          <View style={[styles.innerDivider, { backgroundColor: theme.color.borderLight }]} />
          <View style={[styles.detailRow, styles.descriptionRow]}>
            <AppText size="small" weight="light" style={styles.detailLabel}>Description</AppText>
            <AppText size="small" weight="regular" style={styles.detailValue}>{trip.description || '—'}</AppText>
          </View>
        </Card>

        <Card style={styles.summaryCard}>
          <Counter
            layout="stacked"
            metrics={[
              { value: stats.eventCount, label: 'Event' },
              { value: stats.chekiCount, label: 'Cheki' },
              { value: stats.expenseCount, label: 'Expense' },
            ]}
            totals={spendingTotals}
            compactSpending={false}
            spendingLabel="Total Spending"
            spendingDetailsExpanded={spendingDetailsExpanded}
            onToggleSpendingDetails={() => setSpendingDetailsExpanded((expanded) => !expanded)}
            style={styles.counter}
            testID="trip-summary"
          />
          {spendingDetailsExpanded ? (
            <>
              <Divider lineStyle="dashed" color={theme.surface.borderColor} testID="trip-spend-divider" />
              <View style={styles.spendSection}>
                <AppText size="large" weight="semibold">Spend</AppText>
                <View style={[styles.majorDivider, { backgroundColor: theme.surface.borderColor }]} />
                {eventTotals.length === 0 && expenses.length === 0 ? (
                  <AppText size="small" weight="light" muted>No spending yet.</AppText>
                ) : (
                  <>
                    {eventTotals.map((total, index) => (
                      <Fragment key={`event-${total.currency}`}>
                        {index > 0 ? <View style={[styles.innerDivider, { backgroundColor: theme.color.borderLight }]} /> : null}
                        <View style={styles.spendRow}>
                          <AppText size="small" weight="light">Event</AppText>
                          <AppText size="small" weight="regular">{formatMoney(total.amount, total.currency)}</AppText>
                        </View>
                      </Fragment>
                    ))}
                    {expenses.map((expense, index) => (
                      <Fragment key={expense.id}>
                        {eventTotals.length > 0 || index > 0 ? <View style={[styles.innerDivider, { backgroundColor: theme.color.borderLight }]} /> : null}
                        <View style={styles.spendRow}>
                          <AppText size="small" weight="light">{categoryLabel(expense)}</AppText>
                          <AppText size="small" weight="regular">{formatMoney(expense.amount, expense.currency)}</AppText>
                        </View>
                      </Fragment>
                    ))}
                  </>
                )}
              </View>
            </>
          ) : null}
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <AppText weight="semibold" size="large">Expenses</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add Expense"
              hitSlop={8}
              onPress={() => { setEditingExpense(null); setExpenseModal(true); }}
              style={({ pressed }) => [
                styles.addExpenseButton,
                {
                  backgroundColor: theme.color.accentSurface,
                  borderColor: theme.color.accent,
                  borderWidth: theme.surface.borderWidth,
                  borderRadius: theme.radius.sm,
                },
                pressed ? { opacity: 0.75 } : null,
              ]}
            >
              <Icon name="plus" size={14} color={theme.color.accent} strokeWidth={1} />
              <AppText size="small" weight="light" color={theme.color.accent}>Add Expense</AppText>
            </Pressable>
          </View>
          <View style={[styles.majorDivider, { backgroundColor: theme.surface.borderColor }]} />
          {expenses.length === 0 ? (
            <AppText size="small" weight="light" muted>No expenses yet.</AppText>
          ) : (
            expenses.map((expense, index) => (
              <Fragment key={expense.id}>
                {index > 0 ? <View style={[styles.innerDivider, { backgroundColor: theme.color.borderLight }]} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Expense ${expense.title}`}
                  style={styles.expenseRow}
                  onPress={() =>
                    Alert.alert(expense.title, `${categoryLabel(expense)} · ${formatMoney(expense.amount, expense.currency)}`, [
                      {
                        text: 'Edit',
                        onPress: () => {
                          setEditingExpense(expense.id);
                          setExpenseModal(true);
                        },
                      },
                      { text: 'Close', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => createTripRepo(getDb()).deleteExpense(expense.id),
                      },
                    ])
                  }
                >
                  <View style={styles.expenseBody}>
                    <AppText weight="regular" size="body" numberOfLines={1}>{expense.title}</AppText>
                    <AppText size="small" weight="light" color={theme.color.accent} numberOfLines={1}>
                      {categoryLabel(expense)} | {formatISODateCompact(expense.date)}
                    </AppText>
                  </View>
                  <AppText weight="regular" size="small">{formatMoney(expense.amount, expense.currency)}</AppText>
                </Pressable>
              </Fragment>
            ))
          )}
        </Card>

        <TripEventHistoryCard events={events} onOpenEvent={(eventId) => router.push(`/event/${eventId}`)} />
      </ScrollView>

      {expenseModal ? (
        <AddExpenseModal
          visible
          onClose={() => { setExpenseModal(false); setEditingExpense(null); }}
          tripId={trip.id}
          editingExpenseId={editingExpense}
        />
      ) : null}
    </Screen>
  );
}

type TripHistorySortOrder = 'newest' | 'oldest';

const TRIP_MONTH_OPTIONS = [
  { value: 'all', label: 'All Months' },
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

function TripEventHistoryCard({
  events,
  onOpenEvent,
}: {
  events: EventListRow[];
  onOpenEvent: (eventId: string) => void;
}) {
  const theme = useTheme();
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  const [order, setOrder] = useState<TripHistorySortOrder>('newest');
  const years = useMemo(() => [...new Set(events.map((event) => event.eventDate.slice(0, 4)))].sort().reverse(), [events]);
  const filtered = useMemo(() => events
    .filter((event) => month === 'all' || event.eventDate.slice(5, 7) === month)
    .filter((event) => year === 'all' || event.eventDate.slice(0, 4) === year)
    .slice()
    .sort((a, b) => order === 'newest'
      ? b.eventDate.localeCompare(a.eventDate)
      : a.eventDate.localeCompare(b.eventDate)), [events, month, order, year]);

  return (
    <View
      testID="trip-event-history-container"
      style={[
        styles.historyContainer,
        {
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
      <View testID="trip-event-history-header" style={styles.historyToolbar}>
        <AppText weight="semibold" size="large" style={styles.flexOne}>Event</AppText>
        <TripDateFilterButton
          label="Month"
          value={month}
          options={TRIP_MONTH_OPTIONS}
          displayValue={month === 'all' ? 'All' : TRIP_MONTH_OPTIONS.find((option) => option.value === month)?.label.slice(0, 3) ?? 'All'}
          onChange={setMonth}
        />
        <TripDateFilterButton
          label="Year"
          value={year}
          options={[{ value: 'all', label: 'All Years' }, ...years.map((value) => ({ value, label: value }))]}
          displayValue={year === 'all' ? 'All' : year}
          onChange={setYear}
        />
        <TripSortButton order={order} onChange={setOrder} />
      </View>
      <Divider testID="trip-event-history-divider" />
      <ScrollView
        testID="trip-event-history-list"
        nestedScrollEnabled
        scrollsChildToFocus
        showsVerticalScrollIndicator={false}
        style={styles.historyList}
        contentContainerStyle={styles.historyListContent}
      >
        {filtered.length === 0 ? (
          <AppText size="small" weight="light" muted style={styles.emptyCopy}>No Event history</AppText>
        ) : filtered.map((event) => (
          <EventCard
            key={event.id}
            title={event.title}
            eventDate={event.eventDate}
            chekiCount={event.chekiCount}
            spendLabel={formatMoneyTotals(event.chekiTotals)}
            region={event.venueRegion}
            venue={event.venueName}
            onPress={() => onOpenEvent(event.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function TripDateFilterButton({
  label,
  value,
  displayValue,
  options,
  onChange,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const itemHeight = 44;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === draft));
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.max(0, Math.min(options.length - 1, Math.round(event.nativeEvent.contentOffset.y / itemHeight)));
    setDraft(options[index].value);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} filter: ${value === 'all' ? 'All' : displayValue}`}
        onPress={() => {
          setDraft(value);
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.historyFilterControl,
          {
            borderColor: theme.surface.borderColor,
            backgroundColor: theme.color.surface,
            borderWidth: theme.surface.borderWidth,
          },
          pressed && styles.pressed,
        ]}
      >
        <AppText size="xs" weight="light" color={theme.color.accent} align="center" style={styles.filterLabel}>{label}</AppText>
        <AppText size="small" weight="light" align="center" style={styles.historyFilterValue}>{displayValue}</AppText>
      </Pressable>
      <Modal visible={open} onClose={() => setOpen(false)} title={`Select ${label}`}>
        <View style={styles.wheelViewport}>
          <View pointerEvents="none" style={[styles.wheelSelection, { borderColor: theme.color.accent, backgroundColor: theme.color.accentSoft }]} />
          <ScrollView
            key={`${label}-${value}-${options.length}`}
            contentOffset={{ x: 0, y: selectedIndex * itemHeight }}
            contentContainerStyle={styles.wheelContent}
            snapToInterval={itemHeight}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
          >
            {options.map((option) => (
              <Pressable key={option.value} onPress={() => setDraft(option.value)} style={styles.wheelItem}>
                <AppText size="body" weight={draft === option.value ? 'semibold' : 'light'} color={draft === option.value ? theme.color.accent : theme.color.text}>
                  {option.label}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <Button
          label="Done"
          style={styles.modalAction}
          onPress={() => {
            onChange(draft);
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}

function TripSortButton({ order, onChange }: { order: TripHistorySortOrder; onChange: (order: TripHistorySortOrder) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sort ${order === 'newest' ? 'newest first' : 'oldest first'}`}
      onPress={() => onChange(order === 'newest' ? 'oldest' : 'newest')}
      style={({ pressed }) => [
        styles.historySortControl,
        {
          borderColor: theme.surface.borderColor,
          backgroundColor: theme.color.surface,
          borderWidth: theme.surface.borderWidth,
        },
        pressed && styles.pressed,
      ]}
    >
      <Icon name={order === 'newest' ? 'arrowDown' : 'arrowUp'} size={20} color={theme.color.text} strokeWidth={1.25} />
    </Pressable>
  );
}

function AddExpenseModal({ visible, onClose, tripId, editingExpenseId }: { visible: boolean; onClose: () => void; tripId: string; editingExpenseId: string | null }) {
  const expense = editingExpenseId ? createTripRepo(getDb()).getExpense(editingExpenseId) : null;
  const [title, setTitle] = useState(expense?.title ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'flight');
  const [customLabel, setCustomLabel] = useState(expense?.customCategoryLabel ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(expense?.currency ?? 'JPY');
  const [amount, setAmount] = useState(expense ? formatMinorUnits(expense.amount, expense.currency) : '');
  const [date, setDate] = useState(expense?.date ?? todayISO());

  const save = () => {
    const minor = parseMinorUnits(amount, currency);
    if (minor === null) return;
    const repo = createTripRepo(getDb());
    if (expense) {
      repo.updateExpense(expense.id, {
        title: title.trim(),
        category,
        customCategoryLabel: category === 'other' ? customLabel.trim() || null : null,
        currency,
        amount: minor,
        date: date.trim(),
      });
    } else {
      repo.createExpense({
        tripId,
        title: title.trim(),
        category,
        customCategoryLabel: category === 'other' ? customLabel.trim() || null : null,
        currency,
        amount: minor,
        date: date.trim(),
      });
    }
    onClose();
    setTitle('');
    setAmount('');
    setCustomLabel('');
  };

  return (
    <Modal visible={visible} onClose={onClose} title={expense ? 'Edit Expense' : 'New Expense'}>
      <Field label="Title *" value={title} onChangeText={setTitle} placeholder="e.g. Narita Express" />
      <AppText weight="semibold" size="small" style={{ marginTop: 16, marginBottom: 8 }}>Category</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {(['flight', 'hotel', 'transport', 'meal', 'other'] as ExpenseCategory[]).map((c) => (
          <Chip key={c} label={c === 'other' ? 'Other' : EXPENSE_CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      {category === 'other' ? (
        <Field label="Custom category label *" value={customLabel} onChangeText={setCustomLabel} placeholder="e.g. Merch shipping" />
      ) : null}
      <AppText weight="semibold" size="small" style={{ marginTop: 16, marginBottom: 8 }}>Currency</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.sm }}>
        {(['JPY', 'IDR', 'MYR', 'KRW', 'THB'] as const).map((c) => (
          <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
        ))}
      </View>
      <Field label="Amount *" value={amount} onChangeText={(value) => setAmount(formatMoneyInput(value, currency))} keyboardType="numeric" placeholder="1500" />
      <DateField label="Date *" value={date} onChange={setDate} placeholder="Pick a date" style={{ marginTop: SPACING.sm }} />
      <Button
        label="Save Expense"
        style={{ marginTop: 16 }}
        disabled={title.trim() === '' || amount.trim() === '' || date.trim() === '' || (category === 'other' && customLabel.trim() === '')}
        onPress={save}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    padding: 0,
    paddingBottom: 0,
  },
  scroll: {
    flex: 1,
  },
  infoCard: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 8,
  },
  majorDivider: {
    width: '100%',
    height: 1,
  },
  innerDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  descriptionRow: {
    alignItems: 'flex-start',
  },
  detailLabel: {
    width: 90,
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
  },
  summaryCard: {
    padding: 0,
    overflow: 'hidden',
  },
  counter: {
    borderWidth: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    paddingTop: 16,
    paddingBottom: 8,
  },
  spendSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 8,
  },
  spendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionCard: {
    padding: 16,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addExpenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingLeft: 5,
    paddingRight: 8,
    paddingVertical: 4,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expenseBody: {
    flex: 1,
    minWidth: 0,
  },
  historyContainer: {
    width: '100%',
    height: 532,
    padding: 16,
    borderRadius: 16,
    gap: 8,
    overflow: 'hidden',
  },
  historyToolbar: {
    width: '100%',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 3,
  },
  historyList: {
    flex: 1,
    width: '100%',
  },
  historyListContent: {
    gap: CARD_STACK_GAP,
    paddingBottom: 1,
  },
  emptyCopy: {
    paddingVertical: 16,
    textAlign: 'center',
  },
  historyFilterControl: {
    width: 60,
    height: 28,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 2,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: {
    lineHeight: 12,
    marginBottom: -2,
  },
  historyFilterValue: {
    lineHeight: 14,
  },
  historySortControl: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelViewport: {
    height: 220,
    overflow: 'hidden',
  },
  wheelSelection: {
    position: 'absolute',
    top: 88,
    left: 0,
    right: 0,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
  },
  wheelContent: {
    paddingVertical: 88,
  },
  wheelItem: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAction: {
    marginTop: 16,
  },
  flexOne: {
    flex: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});

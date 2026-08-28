import { useMemo, useState } from 'react';
import {
  Text,
  TextInput,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EventCard } from '@/components/ui/EventCard';
import { VenueSummaryCard } from '@/components/ui/VenueSummaryCard';
import { Screen } from '@/components/ui/Screen';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Divider } from '@/components/ui/Divider';
import { LocationDataAttribution } from '@/components/ui/LocationDataAttribution';
import { Header } from '@/components/ui/Header';
import { BLACK_SCALE } from '@/design-system/colors';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { VenueFormBottomSheet, createVenueAndMigrate, type VenueFormValues } from '@/components/forms/VenueForm';
import { useTheme } from '@/hooks/useTheme';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { getDb } from '@/db';
import { createVenueRepo } from '@/repositories/venue';
import { createEventRepo, type EventListRow } from '@/repositories/event';
import { createAggregationService } from '@/services/aggregation';
import { summarizeVenueDrinkRows, type VenueDrinkSummaryRow } from '@/services/venueDetail';
import { COUNTRIES, type CurrencyCode, type VenueDrinkPrice } from '@/types/domain';
import { formatMoney, formatMoneyInput, formatMoneyTotals, formatMinorUnits, parseMinorUnits } from '@/utils/money';

const VENUE_LIST_ROUTE = '/(tabs)/venues';

export default function VenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const dataVersion = useUiStore((s) => s.dataVersion);
  const bumpDataVersion = useUiStore((s) => s.bumpDataVersion);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [migrationTargetId, setMigrationTargetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newTargetSheet, setNewTargetSheet] = useState(false);
  const [drinkManagerVisible, setDrinkManagerVisible] = useState(false);
  const [drinkEditing, setDrinkEditing] = useState(false);
  const [drinkValue, setDrinkValue] = useState('');
  const [drinkError, setDrinkError] = useState<string | null>(null);
  const [drinkAdding, setDrinkAdding] = useState(false);
  const [newDrinkValue, setNewDrinkValue] = useState('');
  const [newDrinkError, setNewDrinkError] = useState<string | null>(null);

  const venue = useMemo(() => readDataAtVersion(dataVersion, () => createVenueRepo(getDb()).getVenue(id)), [id, dataVersion]);
  const prices = useMemo(() => readDataAtVersion(dataVersion, () => createVenueRepo(getDb()).listDrinkPrices(id)), [id, dataVersion]);
  const stats = useMemo(() => readDataAtVersion(dataVersion, () => createAggregationService(getDb()).getVenueStats(id)), [id, dataVersion]);
  const events = useMemo(
    () => readDataAtVersion(dataVersion, () => createEventRepo(getDb()).listEventsWithSummary().filter((e) => e.venueId === id)),
    [id, dataVersion],
  );
  const migrationTargets = useMemo(
    () => readDataAtVersion(dataVersion, () => createVenueRepo(getDb()).listVenues().filter((candidate) => candidate.id !== id)),
    [id, dataVersion],
  );

  const defaultDrink = prices.find((price) => price.isDefault && !price.isArchived) ?? null;
  const countryCurrency = COUNTRIES.find((country) => country.code === venue?.country)?.currency ?? 'JPY';
  const eventDrinkRows = useMemo(() => summarizeVenueDrinkRows(events), [events]);
  const drinkTableRows = useMemo(() => {
    const registeredKeys = new Set(
      prices
        .filter((price) => !price.isArchived)
        .map((price) => `${price.currency}:${price.price}`),
    );
    return eventDrinkRows.filter((row) => registeredKeys.has(`${row.currency}:${row.price}`));
  }, [eventDrinkRows, prices]);
  const drinkRows = prices.filter((price) => price.id !== defaultDrink?.id);
  const usedDrinkPriceIds = useMemo(() => {
    const usedKeys = new Set(
      events
        .filter((event) => event.drinkAmount != null && event.drinkCurrency != null)
        .map((event) => `${event.drinkCurrency}:${event.drinkAmount}`),
    );
    return new Set(prices.filter((price) => usedKeys.has(`${price.currency}:${price.price}`)).map((price) => price.id));
  }, [events, prices]);
  if (!venue) return <EntityNotFound entity="Venue" onBack={() => router.replace(VENUE_LIST_ROUTE)} />;

  const startRename = () => {
    setRenameValue(venue.name);
    setRenameError(null);
    setMenuOpen(false);
    setRenameMode(true);
  };

  const cancelRename = () => {
    setRenameMode(false);
    setRenameValue(venue.name);
    setRenameError(null);
  };

  const saveRename = () => {
    const name = renameValue.trim();
    if (!name) {
      setRenameError('Venue name is required.');
      return;
    }
    try {
      createVenueRepo(getDb()).updateVenue(venue.id, { name });
      setRenameMode(false);
      setRenameError(null);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Could not rename the venue.');
    }
  };

  const startDrinkEdit = () => {
    setDrinkAdding(false);
    setNewDrinkValue('');
    setNewDrinkError(null);
    setDrinkValue(defaultDrink ? formatMinorUnits(defaultDrink.price, defaultDrink.currency) : '');
    setDrinkError(null);
    setDrinkEditing(true);
  };

  const cancelDrinkEdit = () => {
    setDrinkEditing(false);
    setDrinkError(null);
  };

  const startDrinkAdd = () => {
    setDrinkEditing(false);
    setDrinkError(null);
    setDrinkAdding(true);
    setNewDrinkValue('');
    setNewDrinkError(null);
  };

  const cancelDrinkAdd = () => {
    setDrinkAdding(false);
    setNewDrinkValue('');
    setNewDrinkError(null);
  };

  const saveDrink = () => {
    if (!drinkValue.trim()) {
      setDrinkEditing(false);
      return;
    }
    const price = parseMinorUnits(drinkValue, countryCurrency);
    if (price === null) {
      setDrinkError(`Enter a valid drink price in ${countryCurrency}.`);
      return;
    }
    try {
      const repo = createVenueRepo(getDb());
      if (defaultDrink) {
        repo.updateDrinkPrice(defaultDrink.id, { currency: countryCurrency, price });
      } else {
        repo.createDrinkPrice({ venueId: venue.id, label: null, currency: countryCurrency, price, isDefault: true });
      }
      bumpDataVersion();
      setDrinkEditing(false);
      setDrinkError(null);
    } catch (error) {
      setDrinkError(error instanceof Error ? error.message : 'Could not save the drink price.');
    }
  };

  const saveNewDrink = () => {
    const price = parseMinorUnits(newDrinkValue, countryCurrency);
    if (price === null) {
      setNewDrinkError(`Enter a valid drink price in ${countryCurrency}.`);
      return;
    }
    try {
      createVenueRepo(getDb()).createDrinkPrice({ venueId: venue.id, label: null, currency: countryCurrency, price });
      bumpDataVersion();
      cancelDrinkAdd();
    } catch (error) {
      setNewDrinkError(error instanceof Error ? error.message : 'Could not add the drink price.');
    }
  };

  const openDeleteModal = () => {
    setMenuOpen(false);
    setMigrationTargetId(null);
    setDeleteError(null);
    setDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setDeleteModal(false);
    setMigrationTargetId(null);
    setDeleteError(null);
  };

  const deleteWithoutMigration = () => {
    try {
      createVenueRepo(getDb()).deleteVenue(venue.id);
      closeDeleteModal();
      router.replace(VENUE_LIST_ROUTE);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete the venue.');
    }
  };

  const migrateAndDelete = () => {
    if (!migrationTargetId) return;
    try {
      createVenueRepo(getDb()).migrateVenue(venue.id, migrationTargetId);
      closeDeleteModal();
      router.replace(VENUE_LIST_ROUTE);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not migrate this venue.');
    }
  };

  const createTargetAndMigrate = (values: VenueFormValues) => {
    createVenueAndMigrate(values, venue.id);
    setNewTargetSheet(false);
    router.replace(VENUE_LIST_ROUTE);
  };

  const deleteDrinkPrice = (priceId: string) => {
    try {
      createVenueRepo(getDb()).deleteDrinkPrice(priceId);
      setDrinkError(null);
      bumpDataVersion();
    } catch (error) {
      setDrinkError(error instanceof Error ? error.message : 'Could not delete the drink price.');
    }
  };

  const closeDrinkManager = () => {
    setDrinkManagerVisible(false);
    cancelDrinkAdd();
    cancelDrinkEdit();
  };

  return (
      <Screen testID="venue-detail-screen-content" contentStyle={styles.screenContent}>
      {menuOpen ? (
        <Pressable
          accessibilityLabel="Close venue menu"
          onPress={() => setMenuOpen(false)}
          style={styles.menuDismiss}
        />
      ) : null}
      <View style={styles.headerLayer}>
        <Header
          variant="detail"
          testID="venue-detail-header"
          title="Venue Details"
          titleContent={renameMode ? (
              <TextInput
                accessibilityLabel="Venue name"
                autoFocus
                value={renameValue}
                onChangeText={setRenameValue}
                onSubmitEditing={saveRename}
                returnKeyType="done"
                style={[styles.renameInput, { color: theme.color.text }]}
              />
            ) : (
              <AppText weight="semibold" size="h3" numberOfLines={1}>Venue Details</AppText>
            )}
          right={renameMode ? (
            <View style={styles.headerActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Save venue name" onPress={saveRename} hitSlop={10} style={styles.headerIconButton}>
                <Ionicons name="checkmark" size={22} color={theme.color.accent} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel venue name edit" onPress={cancelRename} hitSlop={10} style={styles.headerIconButton}>
                <Ionicons name="close" size={22} color={theme.color.textMuted} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.menuAnchor}>
              <Pressable accessibilityRole="button" accessibilityLabel="Venue actions" onPress={() => setMenuOpen((open) => !open)} hitSlop={10} style={styles.headerIconButton}>
                <Icon name="edit" size={24} color={theme.color.text} strokeWidth={2} viewBoxPadding={1} />
              </Pressable>
              {menuOpen ? (
                <View
                  style={[
                    styles.menuPopover,
                    {
                      backgroundColor: theme.color.surface,
                      borderColor: theme.surface.borderColor,
                      borderWidth: theme.surface.borderWidth,
                      shadowColor: theme.surface.shadowColor,
                      shadowOpacity: theme.surface.style === 'soft-shadow' ? theme.surface.shadowOpacity : 0,
                      shadowRadius: theme.surface.shadowRadius,
                      elevation: theme.surface.style === 'soft-shadow' ? theme.surface.elevation : 0,
                    },
                  ]}
                >
                  <Pressable accessibilityRole="button" accessibilityLabel="Edit venue name" onPress={startRename} style={styles.menuItem}>
                    <Icon name="edit" size={18} color={theme.color.text} />
                    <AppText size="small">Edit name</AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Manage drink prices" onPress={() => { setMenuOpen(false); setDrinkManagerVisible(true); }} style={styles.menuItem}>
                    <Icon name="bottle" size={18} color={theme.color.text} />
                    <AppText size="small">Manage drinks</AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete venue" onPress={openDeleteModal} style={styles.menuItem}>
                    <Ionicons name="trash-outline" size={18} color={theme.color.danger} />
                    <AppText size="small" color={theme.color.danger}>Delete venue</AppText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        />
      </View>
      {renameError ? <AppText size="xs" color={theme.color.danger} style={styles.headerError}>{renameError}</AppText> : null}

      <View testID="venue-detail-viewport" style={styles.venueViewport}>
        <ScrollView
          testID="venue-detail-scroll"
          nestedScrollEnabled
          scrollsChildToFocus
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          style={styles.venueScroll}
          contentContainerStyle={styles.venueScrollContent}
        >
          <VenueSummaryCard
            testID="venue-summary-card"
            name={venue.name}
            country={venue.country}
            region={venue.region}
            eventCount={stats.visitCount}
          />

          {venue.address ? (
            <View style={styles.addressBlock}>
              <AppText size="small" muted>{venue.address}</AppText>
              <LocationDataAttribution style={styles.addressAttribution} />
            </View>
          ) : null}

          {drinkTableRows.length > 0 ? (
            <VenueDrinkCard
              rows={drinkTableRows}
              totalLabel={`Total ${formatMoneyTotals(stats.drinkSpendTotals) ?? '—'}`}
            />
          ) : null}

          <VenueVisitHistoryCard
            events={events}
            onOpenEvent={(eventId) => router.push(`/event/${eventId}`)}
          />
        </ScrollView>
      </View>

      <Modal visible={drinkManagerVisible} onClose={closeDrinkManager} title="Drink Prices">
        <DrinkPriceManager
          countryCurrency={countryCurrency}
          defaultDrink={defaultDrink}
          drinkRows={drinkRows}
          usedDrinkPriceIds={usedDrinkPriceIds}
          drinkEditing={drinkEditing}
          drinkValue={drinkValue}
          drinkError={drinkError}
          drinkAdding={drinkAdding}
          newDrinkValue={newDrinkValue}
          newDrinkError={newDrinkError}
          onAdd={startDrinkAdd}
          onStartEdit={startDrinkEdit}
          onChangeValue={setDrinkValue}
          onSave={saveDrink}
          onCancelEdit={cancelDrinkEdit}
          onChangeNewValue={setNewDrinkValue}
          onSaveNew={saveNewDrink}
          onCancelAdd={cancelDrinkAdd}
          onSetDefault={(priceId) => {
            try {
              createVenueRepo(getDb()).setDefaultDrinkPrice(priceId);
              setDrinkError(null);
              bumpDataVersion();
            } catch (error) {
              setDrinkError(error instanceof Error ? error.message : 'Could not set the default drink.');
            }
          }}
          onDelete={deleteDrinkPrice}
          onToggleArchive={(priceId, isArchived) => {
            createVenueRepo(getDb()).updateDrinkPrice(priceId, { isArchived });
            bumpDataVersion();
          }}
        />
      </Modal>

      <Modal visible={deleteModal} onClose={closeDeleteModal} title={events.length > 0 ? 'Move Venue Data' : 'Delete Venue'}>
        {events.length > 0 ? (
          <>
            <AppText size="small" muted style={{ marginBottom: 12 }}>
              Move {events.length} active event{events.length === 1 ? '' : 's'} before deleting {venue.name}.
            </AppText>
            {migrationTargets.map((target) => (
              <Pressable
                key={target.id}
                accessibilityRole="button"
                accessibilityLabel={`Migrate venue to ${target.name}`}
                accessibilityState={{ selected: migrationTargetId === target.id }}
                onPress={() => setMigrationTargetId(target.id)}
                style={({ pressed }) => [
                  styles.targetRow,
                  {
                    borderColor: migrationTargetId === target.id ? theme.color.accent : theme.surface.borderColor,
                    borderWidth: theme.surface.borderWidth,
                    borderRadius: theme.radius.sm,
                    backgroundColor: migrationTargetId === target.id ? theme.color.accentSurface : theme.color.surface,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <AppText weight="semibold" size="body">{target.name}</AppText>
                  <AppText size="xs" muted>{target.country}{target.region ? ` · ${target.region}` : ''}</AppText>
                </View>
                {migrationTargetId === target.id ? <Ionicons name="checkmark" size={20} color={theme.color.accent} /> : null}
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" accessibilityLabel="Add new venue for migration" onPress={() => { closeDeleteModal(); setNewTargetSheet(true); }} style={styles.addTargetButton}>
              <AppText weight="semibold" size="small" color={theme.color.accent}>+ Add new venue</AppText>
            </Pressable>
            {deleteError ? <AppText size="small" color={theme.color.danger} style={{ marginTop: 8 }}>{deleteError}</AppText> : null}
            <Button
              label="Migrate & Delete"
              onPress={migrateAndDelete}
              disabled={!migrationTargetId}
              variant="danger"
              style={{ marginTop: 16 }}
            />
          </>
        ) : (
          <>
            <AppText size="small" muted>
              Delete {venue.name}? This cannot be undone from the app.
            </AppText>
            {deleteError ? <AppText size="small" color={theme.color.danger} style={{ marginTop: 8 }}>{deleteError}</AppText> : null}
            <Button label="Delete Venue" variant="danger" onPress={deleteWithoutMigration} style={{ marginTop: 16 }} />
          </>
        )}
      </Modal>

      <VenueFormBottomSheet
        visible={newTargetSheet}
        onClose={() => setNewTargetSheet(false)}
        onSubmit={createTargetAndMigrate}
      />
    </Screen>
  );
}

function VenueDrinkCard({ rows, totalLabel }: { rows: VenueDrinkSummaryRow[]; totalLabel: string }) {
  const theme = useTheme();
  return (
    <View testID="venue-drink-card">
      <Card style={styles.drinkCard}>
        <View style={[styles.drinkCardHeader, { borderBottomColor: BLACK_SCALE.B60 }]}>
          <AppText weight="semibold" size="large">Drink:</AppText>
        </View>
        <View style={styles.drinkRows}>
          {rows.map((row) => (
            <View
              key={`${row.currency}:${row.price}`}
              style={styles.drinkRow}
            >
              <AppText size="small" weight="light" style={styles.drinkRowPrice}>
                <Text style={{ color: theme.color.text }}>{formatMoney(row.price, row.currency)}</Text>
                <Text style={{ color: theme.color.accent }}>{' (x'}</Text>
                <Text style={{ color: theme.color.text }}>{row.count}</Text>
                <Text style={{ color: theme.color.accent }}>{')'}</Text>
              </AppText>
              <AppText size="small" weight="regular" align="right" style={styles.drinkRowTotal}>
                {formatMoney(row.total, row.currency)}
              </AppText>
            </View>
          ))}
        </View>
        <View style={styles.drinkTotal}>
          <Divider color={theme.color.accent} style={styles.drinkTotalDivider} />
          <AppText weight="semibold" size="body" color={theme.color.accent} align="right">
            {totalLabel}
          </AppText>
        </View>
      </Card>
    </View>
  );
}

function VenueVisitHistoryCard({
  events,
  onOpenEvent,
}: {
  events: EventListRow[];
  onOpenEvent: (eventId: string) => void;
}) {
  const theme = useTheme();
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  const [order, setOrder] = useState<VenueHistorySortOrder>('newest');
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
      testID="venue-visit-history-container"
      style={[
        styles.historyContainer,
        {
          flex: 1,
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
      <View testID="venue-visit-history-header" style={styles.historyToolbar}>
        <AppText weight="semibold" size="large" style={styles.flexOne}>Visit History</AppText>
        <VenueDateFilterButton
          label="Month"
          value={month}
          options={MONTH_OPTIONS}
          displayValue={month === 'all' ? 'All' : MONTH_OPTIONS.find((option) => option.value === month)?.label.slice(0, 3) ?? 'All'}
          onChange={setMonth}
        />
        <VenueDateFilterButton
          label="Year"
          value={year}
          options={[{ value: 'all', label: 'All Years' }, ...years.map((value) => ({ value, label: value }))]}
          displayValue={year === 'all' ? 'All' : year}
          onChange={setYear}
        />
        <VenueSortButton order={order} onChange={setOrder} />
      </View>
      <Divider testID="venue-visit-history-divider" />
      <ScrollView
        testID="venue-visit-history-list"
        nestedScrollEnabled
        scrollsChildToFocus
        showsVerticalScrollIndicator={false}
        style={styles.historyList}
        contentContainerStyle={styles.historyListContent}
      >
        {filtered.length === 0 ? (
          <AppText size="small" muted style={styles.emptyCopy}>No Visit history</AppText>
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

type VenueHistorySortOrder = 'newest' | 'oldest';

const MONTH_OPTIONS = [
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

function VenueDateFilterButton({
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
        <AppText size="xs" color={theme.color.accent} align="center" style={styles.filterLabel}>{label}</AppText>
        <AppText weight="light" size="small" align="center" style={styles.historyFilterValue}>{displayValue}</AppText>
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

function VenueSortButton({ order, onChange }: { order: VenueHistorySortOrder; onChange: (order: VenueHistorySortOrder) => void }) {
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

function DrinkPriceManager({
  countryCurrency,
  defaultDrink,
  drinkRows,
  usedDrinkPriceIds,
  drinkEditing,
  drinkValue,
  drinkError,
  drinkAdding,
  newDrinkValue,
  newDrinkError,
  onAdd,
  onStartEdit,
  onChangeValue,
  onSave,
  onCancelEdit,
  onChangeNewValue,
  onSaveNew,
  onCancelAdd,
  onSetDefault,
  onDelete,
  onToggleArchive,
}: {
  countryCurrency: CurrencyCode;
  defaultDrink: VenueDrinkPrice | null;
  drinkRows: VenueDrinkPrice[];
  usedDrinkPriceIds: ReadonlySet<string>;
  drinkEditing: boolean;
  drinkValue: string;
  drinkError: string | null;
  drinkAdding: boolean;
  newDrinkValue: string;
  newDrinkError: string | null;
  onAdd: () => void;
  onStartEdit: () => void;
  onChangeValue: (value: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onChangeNewValue: (value: string) => void;
  onSaveNew: () => void;
  onCancelAdd: () => void;
  onSetDefault: (priceId: string) => void;
  onDelete: (priceId: string) => void;
  onToggleArchive: (priceId: string, isArchived: boolean) => void;
}) {
  const theme = useTheme();
  const priceAccessibilityLabel = (price: VenueDrinkPrice) => `${price.currency} ${formatMinorUnits(price.price, price.currency)}`;
  return (
    <>
      <View style={styles.sectionHeader}>
        <AppText weight="bold" size="large">Drink Prices</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={drinkAdding ? 'Cancel add drink price' : 'Add drink price'}
          onPress={drinkAdding ? onCancelAdd : onAdd}
          hitSlop={10}
        >
          <Ionicons name={drinkAdding ? 'close' : 'add-circle-outline'} size={22} color={drinkAdding ? theme.color.textMuted : theme.color.accent} />
        </Pressable>
      </View>
      {drinkError && !drinkEditing ? <AppText size="xs" color={theme.color.danger}>{drinkError}</AppText> : null}
      {drinkAdding ? (
        <View style={styles.inlinePriceEditor}>
          <AppText size="xs" muted style={styles.inlineCurrency}>Currency: {countryCurrency}</AppText>
          <Field
            label={`Price (${countryCurrency})`}
            accessibilityLabel="New drink price"
            value={newDrinkValue}
            onChangeText={(value) => onChangeNewValue(formatMoneyInput(value, countryCurrency))}
            keyboardType="numeric"
            placeholder={countryCurrency === 'JPY' || countryCurrency === 'IDR' || countryCurrency === 'KRW' ? '600' : '15.00'}
            error={newDrinkError}
          />
          <View style={styles.inlinePriceActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Save new drink price" onPress={onSaveNew} hitSlop={10}>
              <Ionicons name="checkmark" size={20} color={theme.color.accent} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel new drink price" onPress={onCancelAdd} hitSlop={10}>
              <Ionicons name="close" size={20} color={theme.color.textMuted} />
            </Pressable>
          </View>
        </View>
      ) : null}
      {drinkEditing ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Field
            icon="bottle"
            label={`Price (${countryCurrency})`}
            accessibilityLabel="Drink Price"
            value={drinkValue}
            onChangeText={(value) => onChangeValue(formatMoneyInput(value, countryCurrency))}
            keyboardType="numeric"
            placeholder="e.g. 600"
            error={drinkError || null}
          />
          <View style={styles.inlinePriceActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Save Drink Price" onPress={onSave} hitSlop={10}>
              <Ionicons name="checkmark" size={20} color={theme.color.accent} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel Drink Price edit" onPress={onCancelEdit} hitSlop={10}>
              <Ionicons name="close" size={20} color={theme.color.textMuted} />
            </Pressable>
          </View>
        </View>
      ) : defaultDrink ? (
        <View style={styles.priceRow}>
          <View style={styles.flexOne}>
            <AppText weight="semibold" size="body">{formatMoney(defaultDrink.price, defaultDrink.currency)}</AppText>
          </View>
          <View style={styles.priceActions}>
            <AppText size="xs" color={theme.color.accent}>Default</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit default drink price" onPress={onStartEdit} hitSlop={10}>
              <Ionicons name="create-outline" size={18} color={theme.color.accent} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Archive drink price ${priceAccessibilityLabel(defaultDrink)}`} onPress={() => onToggleArchive(defaultDrink.id, true)} hitSlop={10}>
              <Ionicons name="archive-outline" size={18} color={theme.color.textMuted} />
            </Pressable>
            {!usedDrinkPriceIds.has(defaultDrink.id) ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete drink price ${priceAccessibilityLabel(defaultDrink)}`} onPress={() => onDelete(defaultDrink.id)} hitSlop={10}>
                <Ionicons name="close" size={20} color={theme.color.danger} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Add default drink price" onPress={onStartEdit} style={styles.emptyPriceRow}>
          <Icon name="bottle" size={20} color={theme.color.accent} />
          <AppText size="small" muted style={styles.flexOne}>No default drink price</AppText>
          <Ionicons name="create-outline" size={18} color={theme.color.accent} />
        </Pressable>
      )}
      {drinkRows.map((price) => (
        <View key={price.id} style={[styles.priceRow, { borderBottomColor: theme.color.borderLight }]}>
          <View style={styles.flexOne}>
            <AppText weight="semibold" size="body">
              {formatMoney(price.price, price.currency)} {price.isArchived ? '(archived)' : ''}
            </AppText>
          </View>
          {!price.isArchived ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Set drink price ${priceAccessibilityLabel(price)} as default`}
              onPress={() => onSetDefault(price.id)}
              style={({ pressed }) => [styles.setDefaultButton, { borderColor: theme.color.accent, borderRadius: theme.radius.pill, borderWidth: theme.surface.borderWidth, backgroundColor: theme.color.accentSurface }, pressed && styles.pressed]}
            >
              <AppText size="xs" weight="semibold" color={theme.color.accent}>Set default</AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={price.isArchived ? `Restore drink price ${priceAccessibilityLabel(price)}` : `Archive drink price ${priceAccessibilityLabel(price)}`}
            onPress={() => onToggleArchive(price.id, !price.isArchived)}
            hitSlop={10}
          >
            <Ionicons name={price.isArchived ? 'refresh-outline' : 'archive-outline'} size={18} color={theme.color.textMuted} />
          </Pressable>
          {!usedDrinkPriceIds.has(price.id) ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete drink price ${priceAccessibilityLabel(price)}`} onPress={() => onDelete(price.id)} hitSlop={10}>
              <Ionicons name="close" size={20} color={theme.color.danger} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    padding: 0,
    paddingBottom: 0,
  },
  headerLayer: {
    zIndex: 2,
  },
  venueViewport: {
    flex: 1,
  },
  venueScroll: {
    flex: 1,
  },
  venueScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconButton: {
    padding: 4,
  },
  renameInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: 'Nunito-SemiBold',
    fontSize: 24,
    lineHeight: 30,
  },
  headerError: {
    marginHorizontal: 16,
    marginTop: -8,
    marginBottom: 8,
  },
  menuDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  menuAnchor: {
    position: 'relative',
  },
  menuPopover: {
    position: 'absolute',
    top: 36,
    right: 0,
    width: 184,
    borderRadius: 8,
    paddingVertical: 4,
    shadowOffset: { width: 0, height: 3 },
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addressBlock: {
    gap: 4,
  },
  addressAttribution: {
    marginTop: 0,
  },
  drinkCard: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  drinkCardHeader: {
    width: '100%',
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  drinkRows: {
    width: '100%',
    gap: 4,
  },
  drinkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  drinkRowPrice: {
    flex: 1,
    minWidth: 0,
  },
  drinkRowTotal: {
    flexShrink: 0,
  },
  drinkTotal: {
    width: '36%',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    gap: 4,
  },
  drinkTotalDivider: {
    width: '100%',
    borderRadius: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  priceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setDefaultButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  emptyPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  inlinePriceActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  inlinePriceEditor: {
    gap: 8,
    paddingVertical: 8,
  },
  inlineCurrency: {
    marginBottom: -4,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  addTargetButton: {
    paddingVertical: 8,
  },
  currencyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  historyContainer: {
    width: '100%',
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
  historyDivider: {
    width: '100%',
    height: 1,
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

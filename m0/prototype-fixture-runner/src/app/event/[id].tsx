import { useMemo } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Divider } from '@/components/ui/Divider';
import { EventDetailCard } from '@/components/ui/EventDetailCard';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { useTheme } from '@/hooks/useTheme';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { getDb } from '@/db';
import { createEventRepo, type ChekiEntryJoined } from '@/repositories/event';
import { resolveIdolPhotoUris } from '@/services/dashboard';
import { type CurrencyCode, type MediaAsset } from '@/types/domain';
import { addAmounts, formatMoney, formatMoneyTotals } from '@/utils/money';
import { CARD_STACK_GAP } from '@/design-system/theme';

interface IdolEntryGroup {
  idolId: string;
  idolName: string;
  groupName: string | null;
  photoMediaId: string | null;
  totalCount: number;
  totals: Record<CurrencyCode, number>;
  entries: ChekiEntryJoined[];
  photos: (MediaAsset & { position: number })[];
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const dataVersion = useUiStore((s) => s.dataVersion);

  const event = useMemo(
    () => readDataAtVersion(dataVersion, () => createEventRepo(getDb()).getEventJoined(id)),
    [id, dataVersion],
  );
  const entries = useMemo(
    () => readDataAtVersion(dataVersion, () => createEventRepo(getDb()).listEntries(id)),
    [id, dataVersion],
  );

  const photosByEntry = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      const db = getDb();
      const repo = createEventRepo(db);
      const map = new Map<string, (MediaAsset & { position: number })[]>();
      for (const entry of entries) {
        map.set(entry.id, repo.listEntryPhotos(entry.id));
      }
      return map;
    });
  }, [entries, dataVersion]);

  const idolPhotos = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      const db = getDb();
      const mediaIds = entries.map((e) => e.idolPhotoMediaId);
      return resolveIdolPhotoUris(db, mediaIds);
    });
  }, [entries, dataVersion]);

  const groupedIdolEntries = useMemo(() => {
    const groups: IdolEntryGroup[] = [];
    const map = new Map<string, IdolEntryGroup>();

    for (const entry of entries) {
      let g = map.get(entry.idolId);
      if (!g) {
        g = {
          idolId: entry.idolId,
          idolName: entry.idolName,
          groupName: entry.groupName,
          photoMediaId: entry.idolPhotoMediaId,
          totalCount: 0,
          totals: { JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 },
          entries: [],
          photos: [],
        };
        map.set(entry.idolId, g);
        groups.push(g);
      }
      g.totalCount += entry.quantity;
      g.totals[entry.currency] = (g.totals[entry.currency] ?? 0) + entry.subtotal;
      g.entries.push(entry);
      const entryPhotos = photosByEntry.get(entry.id) ?? [];
      g.photos.push(...entryPhotos);
    }

    return groups;
  }, [entries, photosByEntry]);

  if (!event) return <EntityNotFound entity="Event" onBack={() => router.replace('/(tabs)/events')} />;

  const totalChekiQuantity = entries.reduce((acc, e) => acc + e.quantity, 0);
  const chekiTotals = addAmounts(entries.map((entry) => ({ amount: entry.subtotal, currency: entry.currency })));
  const totalAmounts = entries.map((entry) => ({ amount: entry.subtotal, currency: entry.currency }));
  if (event.ticketCurrency && event.ticketAmount != null) {
    totalAmounts.push({ amount: event.ticketAmount, currency: event.ticketCurrency });
  }
  if (event.drinkCurrency && event.drinkAmount != null) {
    totalAmounts.push({ amount: event.drinkAmount, currency: event.drinkCurrency });
  }
  const totals = addAmounts(totalAmounts);

  return (
    <Screen
      testID="event-detail-screen-content"
      scroll={false}
      contentStyle={styles.screenContent}
    >
      <View style={styles.headerLayer}>
        <Header
          variant="detail"
          testID="event-detail-header"
          title="Event Detail"
          right={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit event"
            hitSlop={10}
            onPress={() => router.push(`/event/edit?id=${event.id}`)}
          >
            <Icon name="edit" size={24} color={theme.color.text} strokeWidth={2} viewBoxPadding={1} />
          </Pressable>
          )}
        />
      </View>

      <ScrollView
        testID="event-detail-content"
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <EventDetailCard
          title={event.title}
          eventDate={event.eventDate}
          locationLabel={[event.venueName, event.country, event.venueRegion].filter(Boolean).join(' | ')}
          onPressLocation={
            event.venueId
              ? () => router.push(`/venue/${event.venueId}`)
              : event.tripId
                ? () => router.push(`/trip/${event.tripId}`)
                : undefined
          }
          ticketCurrency={event.ticketCurrency}
          ticketAmount={event.ticketAmount}
          drinkCurrency={event.drinkCurrency}
          drinkAmount={event.drinkAmount}
          chekiTotals={chekiTotals}
          totals={totals}
        />

        {/* Cheki Entries Card */}
        <Card style={styles.chekiEntriesCard}>
          <View style={styles.chekiEntriesHeader}>
            <View style={styles.chekiEntriesIcon}>
              <Icon name="camera" size={18} color={theme.color.accent} />
            </View>
            <AppText weight="semibold" size="large" color={theme.color.text} style={styles.flexOne}>
              Cheki Enties
            </AppText>
            <AppText weight="semibold" size="large" color={theme.color.accent}>
              x{totalChekiQuantity}
            </AppText>
          </View>
        </Card>
        <View style={styles.entryCardsList}>
          {groupedIdolEntries.length === 0 ? (
            <AppText weight="light" size="small" color={theme.color.textMuted} style={styles.emptyEntryText}>
              No cheki purchased at this event.
            </AppText>
          ) : (
            groupedIdolEntries.map((group) => (
              <EventIdolChekiCard
                key={group.idolId}
                group={group}
                idolPhotoUri={idolPhotos.get(group.photoMediaId ?? '') ?? null}
                onPressIdol={() => router.push(`/idol/${group.idolId}`)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function EventIdolChekiCard({
  group,
  idolPhotoUri,
  onPressIdol,
}: {
  group: IdolEntryGroup;
  idolPhotoUri: string | null;
  onPressIdol: () => void;
}) {
  const theme = useTheme();
  const photos = group.photos.filter((photo) => photo.thumbnailPath ?? photo.localPath);
  return (
    <View
      style={[
        styles.idolChekiCard,
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
      <View style={styles.idolCardTop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Idol: ${group.idolName}`}
          onPress={onPressIdol}
          style={({ pressed }) => [styles.idolCardHeader, pressed && styles.pressed]}
        >
          <View
            style={[
              styles.idolAvatar,
              {
                borderColor: theme.surface.borderColor,
                borderWidth: theme.surface.borderWidth,
                backgroundColor: theme.color.surfaceMuted,
              },
            ]}
          >
            {idolPhotoUri ? (
              <Image source={{ uri: idolPhotoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={20} color={theme.color.textMuted} />
            )}
          </View>
          <View style={styles.flexOne}>
            <AppText weight="regular" size="body" numberOfLines={1} color={theme.color.text}>
              {group.idolName}
            </AppText>
            <AppText weight="light" size="small" numberOfLines={1} color={theme.color.accent}>
              {group.groupName ?? 'Solo'}
            </AppText>
          </View>
          <AppText weight="regular" size="body" color={theme.color.accent} style={styles.chekiCount}>
            ×{group.totalCount}
          </AppText>
        </Pressable>
        <Divider />
      </View>

      <View style={styles.entryDetails}>
        {group.entries.map((entry, index) => (
          <View key={entry.id} style={styles.entryDetailGroup}>
            <View style={styles.entryTypeRow}>
              <AppText weight="light" size="small" color={theme.color.accent} style={styles.entryTypeQty}>
                {entry.quantity}×
              </AppText>
              <AppText weight="light" size="small" color={theme.color.text} style={styles.entryTypeLabel} numberOfLines={1}>
                {entry.chekiTypeLabel}
              </AppText>
              <AppText weight="light" size="small" align="right" color={theme.color.text} style={styles.entryTypeSubtotal}>
                {formatMoney(entry.subtotal, entry.currency)}
              </AppText>
            </View>
            {index < group.entries.length - 1 ? (
              <Divider variant="inner" />
            ) : null}
          </View>
        ))}

        <View style={styles.subtotalContainer}>
          <Divider color={theme.color.accent} length={94} style={{ alignSelf: 'flex-end', marginBottom: 4 }} />
          <AppText
            weight="regular"
            size="small"
            align="right"
            color={theme.color.accent}
            numberOfLines={1}
            style={styles.subtotalText}
          >
            Sub total {formatMoneyTotals(group.totals, { separator: ' · ' }) ?? '—'}
          </AppText>
        </View>
      </View>

      {photos.length > 0 ? (
        <>
          <Divider />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photosScroll}
            contentContainerStyle={styles.photosRow}
          >
            {photos.map((photo) => {
              const uri = photo.thumbnailPath ?? photo.localPath;
              return (
                <View
                  key={photo.id}
                  style={[
                    styles.photoTile,
                    {
                      borderColor: theme.surface.borderColor,
                      borderWidth: theme.surface.borderWidth,
                      backgroundColor: theme.color.surfaceMuted,
                    },
                  ]}
                >
                  <Image source={{ uri: uri ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
                </View>
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    padding: 0,
    paddingBottom: 0,
  },
  scrollView: {
    flex: 1,
  },
  headerLayer: {
    zIndex: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 16,
  },
  flexOne: {
    flex: 1,
  },
  chekiEntriesCard: {
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  chekiEntriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  chekiEntriesIcon: {
    width: 24,
    height: 24,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEntryText: {
    textAlign: 'center',
    paddingVertical: 12,
  },
  entryCardsList: {
    width: '100%',
    gap: CARD_STACK_GAP,
  },
  idolChekiCard: {
    borderRadius: 16,
    padding: 7,
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  idolCardTop: {
    gap: 8,
    width: '100%',
  },
  idolCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chekiCount: {
    width: 20,
    textAlign: 'right',
    alignSelf: 'stretch',
    textAlignVertical: 'bottom',
  },
  idolAvatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 14,
  },
  entryDetails: {
    width: '100%',
    gap: 4,
  },
  entryDetailGroup: {
    gap: 4,
  },
  entryTypeQty: {
    width: 15,
  },
  entryTypeLabel: {
    flexShrink: 1,
  },
  entryTypeSubtotal: {
    flex: 1,
    textAlign: 'right',
  },
  subtotalContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    gap: 4,
  },
  subtotalDivider: {
    width: '100%',
  },
  subtotalText: {
    flexShrink: 0,
  },
  photosRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    height: 75,
    overflow: 'hidden',
  },
  photosScroll: {
    height: 75,
  },
  photoTile: {
    height: 75,
    width: 50,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

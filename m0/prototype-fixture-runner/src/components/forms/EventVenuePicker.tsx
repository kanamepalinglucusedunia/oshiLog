import { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AddNewRow } from '@/components/ui/AddNewRow';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SearchBar } from '@/components/ui/SearchBar';
import { useTheme } from '@/hooks/useTheme';
import { filterEventVenues } from '@/services/eventForm';
import type { CountryCode, Venue } from '@/types/domain';

export interface EventVenuePickerProps {
  visible: boolean;
  venues: Venue[];
  country: CountryCode | null;
  region: string;
  /** Venue id of the form's current selection, highlighted per Figma "Card List Selected". */
  selectedKey?: string | null;
  onClose: () => void;
  onSelect: (venue: Venue) => void;
  onNewVenue: () => void;
}

export function EventVenuePicker({
  visible,
  venues,
  country,
  region,
  selectedKey,
  onClose,
  onSelect,
  onNewVenue,
}: EventVenuePickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filteredVenues = useMemo(() => {
    const scoped = filterEventVenues(venues, country, region);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return scoped;
    return scoped.filter((venue) => [venue.name, venue.address ?? '', venue.region ?? '']
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }, [venues, country, region, query]);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.82}>
      <View testID="event-venue-picker-layout" style={styles.container}>
        <SearchBar compact value={query} onChangeText={setQuery} placeholder="Search" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
        >
          {filteredVenues.map((venue) => {
            const isSelected = venue.id === selectedKey;
            return (
              <Pressable
                key={venue.id}
                accessibilityRole="button"
                accessibilityLabel={`Select venue ${venue.name}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  Keyboard.dismiss();
                  onSelect(venue);
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderRadius: theme.radius.md,
                    borderWidth: theme.surface.borderWidth,
                    borderColor: isSelected ? theme.color.accent : 'transparent',
                    backgroundColor: isSelected ? theme.color.accentSurface : 'transparent',
                  },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <AppText size="large" weight="regular" numberOfLines={1}>{venue.name}</AppText>
                <View style={styles.metaRow}>
                  <AppText size="small" weight="light">{venue.country}</AppText>
                  {venue.region ? (
                    <>
                      <View style={[styles.metaDivider, { backgroundColor: theme.color.text }]} />
                      <AppText size="small" weight="light">{venue.region}</AppText>
                    </>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          {filteredVenues.length === 0 ? (
            <AppText size="small" muted style={styles.empty}>No venues match these filters.</AppText>
          ) : null}
        </ScrollView>
        <AddNewRow label="New Venue" onPress={() => onNewVenue()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 8,
    paddingBottom: 16,
    gap: 8,
  },
  list: {
    paddingBottom: 8,
  },
  row: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaDivider: {
    width: StyleSheet.hairlineWidth,
    height: 10,
  },
  empty: {
    paddingVertical: 16,
    textAlign: 'center',
  },
});

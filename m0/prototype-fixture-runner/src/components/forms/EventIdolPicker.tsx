import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AddNewRow } from '@/components/ui/AddNewRow';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { SearchBar } from '@/components/ui/SearchBar';
import { useTheme } from '@/hooks/useTheme';
import type { MembershipPickerOption } from '@/services/membership';

export interface EventIdolPickerProps {
  visible: boolean;
  options: MembershipPickerOption[];
  /** Picker option key of the entry's current selection, highlighted per Figma "Selected List". */
  selectedKey?: string | null;
  /** Idol photo URI by idol id for the list avatars. */
  photoUriByIdolId?: Map<string, string>;
  onClose: () => void;
  onSelect: (option: MembershipPickerOption) => void;
  onNewIdol: () => void;
}

/**
 * Splits a picker label into the two Figma lines: idol name (Body Regular)
 * and group subtitle (Light small accent). Solo options render a "Solo" subtitle.
 */
export function splitPickerLabel(label: string, groupName: string | null): { name: string; group: string } {
  const soloSuffix = ' (Solo)';
  if (!groupName) {
    return label.endsWith(soloSuffix)
      ? { name: label.slice(0, label.length - soloSuffix.length), group: 'Solo' }
      : { name: label, group: 'Solo' };
  }
  const separator = ` · ${groupName}`;
  return {
    name: label.endsWith(separator) ? label.slice(0, label.length - separator.length) : label,
    group: groupName,
  };
}

export function EventIdolPicker({
  visible,
  options,
  selectedKey,
  photoUriByIdolId,
  onClose,
  onSelect,
  onNewIdol,
}: EventIdolPickerProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
  }, [options, query]);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.82}>
      <View testID="event-idol-picker-layout" style={styles.container}>
        <SearchBar compact value={query} onChangeText={setQuery} placeholder="Search" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
        >
          {filteredOptions.map((option) => {
            const isSelected = option.key === selectedKey;
            const { name, group } = splitPickerLabel(option.label, option.groupName);
            const photoUri = photoUriByIdolId?.get(option.idolId) ?? null;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={`Select idol ${option.label}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  Keyboard.dismiss();
                  onSelect(option);
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
                <View
                  style={[
                    styles.avatar,
                    {
                      borderRadius: theme.radius.sm,
                      borderWidth: theme.surface.borderWidth,
                      borderColor: theme.surface.borderColor,
                      backgroundColor: theme.color.surfaceMuted,
                    },
                  ]}
                >
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Icon name="user" size={20} color={theme.color.textMuted} />
                  )}
                </View>
                <View style={styles.rowCopy}>
                  <AppText size="body" weight="regular" numberOfLines={1}>
                    {name}
                  </AppText>
                  <AppText size="small" weight="light" color={theme.color.accent} numberOfLines={1}>
                    {group}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
          {filteredOptions.length === 0 ? <AppText size="small" muted style={styles.empty}>No idols match your search.</AppText> : null}
        </ScrollView>
        <AddNewRow label="New Idol" onPress={onNewIdol} />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  empty: {
    paddingVertical: 16,
    textAlign: 'center',
  },
});

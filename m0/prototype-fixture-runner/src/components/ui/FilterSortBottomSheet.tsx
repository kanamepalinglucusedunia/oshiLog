import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon } from './Icon';
import { Dropdown } from './Dropdown';
import { useTheme } from '@/hooks/useTheme';

export interface FilterSortOption<T extends string> {
  label: string;
  ascendingValue: T;
  descendingValue: T;
}

export interface FilterSortBottomSheetProps<T extends string> {
  visible: boolean;
  title: string;
  sortOptions: readonly FilterSortOption<T>[];
  selectedSort: T;
  onSortChange: (value: T) => void;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
  resultCount: number;
  children?: React.ReactNode;
}

export function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText size="large" weight="semibold">
        {title}
      </AppText>
      <View style={styles.choiceWrap}>{children}</View>
    </View>
  );
}

export function FilterChoiceChip({
  label,
  selected,
  onPress,
  multiple = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multiple?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={multiple ? { checked: selected } : { selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: theme.radius.pill,
          borderColor: selected ? theme.color.accent : theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          backgroundColor: selected ? theme.color.accentSurface : theme.color.surface,
        },
        pressed && styles.pressed,
      ]}
    >
      <AppText size="small" weight={selected ? 'semibold' : 'regular'} color={selected ? theme.color.accent : theme.color.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function FilterSortBottomSheet<T extends string>({
  visible,
  title,
  sortOptions,
  selectedSort,
  onSortChange,
  onReset,
  onApply,
  onClose,
  resultCount,
  children,
}: FilterSortBottomSheetProps<T>) {
  const theme = useTheme();
  const [sortOpen, setSortOpen] = useState(false);
  const selectedSortOption = useMemo(
    () => sortOptions.find((option) => option.ascendingValue === selectedSort || option.descendingValue === selectedSort) ?? sortOptions[0],
    [selectedSort, sortOptions],
  );
  const selectedDirection = selectedSortOption?.ascendingValue === selectedSort ? 'asc' : 'desc';
  const resultLabel = `Show ${resultCount} ${resultCount === 1 ? 'result' : 'results'}`;

  const handleClose = () => {
    setSortOpen(false);
    onClose();
  };

  const footer = (
    <View style={styles.footerRow}>
      <Button label="Reset" variant="ghost" labelSize="body" onPress={onReset} style={styles.resetButton} />
      <Button
        label={resultLabel}
        labelSize="body"
        onPress={() => {
          setSortOpen(false);
          onApply();
        }}
        style={styles.applyButton}
      />
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={handleClose} footer={footer} maxHeightRatio={0.84}>
      <View style={styles.header}>
        <AppText size="h3" weight="bold" style={styles.title}>
          {title}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close filter and sort"
          onPress={handleClose}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Icon name="x" size={24} color={theme.color.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <FilterSection title="Sort by">
          <View style={styles.sortControlRow}>
            <Dropdown
              value={selectedSortOption?.label ?? null}
              placeholder="Choose sort order"
              open={sortOpen}
              onToggle={() => setSortOpen((current) => !current)}
              accessibilityLabel="Sort by"
              style={styles.sortDropdown}
            >
              {sortOptions.map((option) => {
                const selected = option === selectedSortOption;
                return (
                  <Pressable
                    key={option.label}
                    accessibilityRole="menuitem"
                    accessibilityLabel={`Sort by ${option.label}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onSortChange(selectedDirection === 'asc' ? option.ascendingValue : option.descendingValue);
                      setSortOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.dropdownOption,
                      {
                        borderBottomColor: theme.color.borderLight,
                        backgroundColor: selected ? theme.color.accentSurface : theme.color.surface,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText size="body" weight={selected ? 'semibold' : 'regular'} style={styles.dropdownOptionLabel}>
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </Dropdown>
            {selectedSortOption ? (
              <Pressable
                testID={`sort-direction-${selectedDirection === 'asc' ? 'ascending' : 'descending'}`}
                accessibilityRole="button"
                accessibilityLabel={`Sort ${selectedDirection === 'asc' ? 'ascending' : 'descending'}`}
                onPress={() => onSortChange(selectedDirection === 'asc' ? selectedSortOption.descendingValue : selectedSortOption.ascendingValue)}
                style={({ pressed }) => [
                  styles.directionIcon,
                  {
                    borderColor: theme.surface.borderColor,
                    borderWidth: theme.surface.borderWidth,
                    borderRadius: theme.radius.sm,
                    backgroundColor: theme.color.surface,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Icon
                  name={selectedDirection === 'asc' ? 'arrowUp' : 'arrowDown'}
                  size={20}
                  color={theme.color.accent}
                />
              </Pressable>
            ) : null}
          </View>
        </FilterSection>
        {children}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sortControlRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    zIndex: 20,
  },
  sortDropdown: {
    flex: 1,
  },
  directionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownOption: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownOptionLabel: {
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  resetButton: {
    flex: 0,
  },
  applyButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});

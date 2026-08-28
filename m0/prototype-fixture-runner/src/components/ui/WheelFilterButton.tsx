import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';
import { Modal } from './Modal';
import { useTheme } from '@/hooks/useTheme';

export interface WheelFilterOption {
  value: string;
  label: string;
}

export const MONTH_FILTER_OPTIONS: readonly WheelFilterOption[] = [
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

export function WheelFilterButton({
  label,
  value,
  displayValue,
  options,
  onChange,
  compact = false,
  style,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: readonly WheelFilterOption[];
  onChange: (value: string) => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
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
          styles.control,
          compact ? styles.compactControl : styles.defaultControl,
          {
            borderColor: theme.surface.borderColor,
            backgroundColor: theme.color.surface,
            borderWidth: theme.surface.borderWidth,
            borderRadius: theme.radius.sm,
          },
          style,
          pressed && styles.pressed,
        ]}
      >
        <AppText size="xs" color={theme.color.accent} align="center" style={styles.label}>{label}</AppText>
        <AppText weight="light" size={compact ? 'small' : 'body'} align="center" style={[styles.value, compact && styles.compactValue]}>
          {displayValue}
        </AppText>
      </Pressable>
      <Modal visible={open} onClose={() => setOpen(false)} title={`Select ${label}`}>
        <View style={styles.wheelViewport}>
          <View
            pointerEvents="none"
            style={[
              styles.wheelSelection,
              {
                borderColor: theme.color.accent,
                backgroundColor: theme.color.accentSoft,
                borderRadius: theme.radius.sm,
              },
            ]}
          />
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
                <AppText
                  size="body"
                  weight={draft === option.value ? 'semibold' : 'light'}
                  color={draft === option.value ? theme.color.accent : theme.color.text}
                >
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

const styles = StyleSheet.create({
  control: {
    height: 36,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultControl: { width: 75, paddingHorizontal: 16, paddingVertical: 2 },
  compactControl: { width: 75, height: 28, paddingHorizontal: 12, paddingVertical: 2 },
  label: { lineHeight: 12, marginBottom: -2 },
  value: { lineHeight: 20 },
  compactValue: { lineHeight: 14 },
  wheelViewport: { height: 220, overflow: 'hidden' },
  wheelSelection: { position: 'absolute', top: 88, left: 0, right: 0, height: 44, borderWidth: 1 },
  wheelContent: { paddingVertical: 88 },
  wheelItem: { height: 44, alignItems: 'center', justifyContent: 'center' },
  modalAction: { marginTop: 16 },
  pressed: { opacity: 0.7 },
});

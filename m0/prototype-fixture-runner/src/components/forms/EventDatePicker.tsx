import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Calendar } from '@/components/ui/Calendar';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { PrimaryButton2 } from '@/components/ui/PrimaryButton2';
import { useTheme } from '@/hooks/useTheme';
import { isValidISODate, todayISO } from '@/utils/date';

export interface EventDatePickerProps {
  value: string;
  onChange: (value: string) => void;
}

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function dateParts(value: string) {
  if (!isValidISODate(value)) return { day: '--', weekday: 'Pick a date', month: '' };
  const [year, month, day] = value.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);
  return {
    day: String(day),
    weekday: localDate.toLocaleDateString('en-US', { weekday: 'long' }),
    month: `${FULL_MONTHS[month - 1]} ${year}`,
  };
}

/** Event-only date card matching Figma node 45:3412. */
export function EventDatePicker({ value, onChange }: EventDatePickerProps) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(value || todayISO());
  const parts = useMemo(() => dateParts(value), [value]);
  const parsed = isValidISODate(draftDate)
    ? draftDate.split('-').map(Number)
    : isValidISODate(value)
    ? value.split('-').map(Number)
    : todayISO().split('-').map(Number);
  const [calView, setCalView] = useState({ year: parsed[0], month: parsed[1] });

  const handleOpen = () => {
    const initialDate = value || todayISO();
    setDraftDate(initialDate);
    if (isValidISODate(initialDate)) {
      const [y, m] = initialDate.split('-').map(Number);
      setCalView({ year: y, month: m });
    }
    setVisible(true);
  };

  const handleSelectDate = (next: string) => {
    setDraftDate(next);
  };

  const handleReset = () => {
    const today = todayISO();
    setDraftDate(today);
    const [y, m] = today.split('-').map(Number);
    setCalView({ year: y, month: m });
  };

  const handleSave = () => {
    onChange(draftDate);
    setVisible(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Event date"
        onPress={handleOpen}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: theme.color.surface,
            borderColor: theme.surface.borderColor,
            borderWidth: theme.surface.borderWidth,
            borderRadius: theme.radius.lg,
            shadowColor: theme.surface.shadowColor,
            shadowOpacity: theme.surface.style === 'soft-shadow' ? theme.surface.shadowOpacity : 0,
            shadowRadius: theme.surface.shadowRadius,
            shadowOffset: { width: 0, height: 1 },
            elevation: theme.surface.style === 'soft-shadow' ? theme.surface.elevation : 0,
          },
          pressed && { opacity: 0.72 },
        ]}
      >
        <AppText size="h3" weight="regular" color={theme.color.accent} align="center" style={styles.day}>
          {parts.day}
        </AppText>
        <View style={[styles.divider, { backgroundColor: theme.surface.borderColor }]} />
        <View style={styles.copy}>
          <AppText size="large" weight="semibold" numberOfLines={1}>
            {parts.weekday}
          </AppText>
          <AppText size="small" weight="light" color={theme.color.accent} numberOfLines={1}>
            {parts.month}
          </AppText>
        </View>
        <Icon name="calendar" size={24} color={theme.color.accent} strokeWidth={1} />
      </Pressable>
      <Modal visible={visible} onClose={() => setVisible(false)} variant="datePicker">
        <Calendar
          bordered={false}
          year={calView.year}
          month={calView.month}
          today={todayISO()}
          selectedDate={draftDate}
          onSelectDate={handleSelectDate}
          onChangeMonth={(year, month) => setCalView({ year, month })}
        />
        <PrimaryButton2 onReset={handleReset} onSave={handleSave} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
  },
  day: {
    minWidth: 32,
  },
  divider: {
    width: 1,
    height: 36,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
});



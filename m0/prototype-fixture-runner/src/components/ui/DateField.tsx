import { useState } from 'react';
import { Keyboard, View, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Modal } from './Modal';
import { Calendar } from './Calendar';
import { PrimaryButton2 } from './PrimaryButton2';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';
import { formatISODate, todayISO } from '@/utils/date';
import { TYPOGRAPHY } from '@/design-system/typography';

export interface DateFieldProps {
  label?: string;
  value: string; // '' or YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shows a Clear button so an optional date can be emptied. */
  allowClear?: boolean;
  error?: string | null;
  hint?: string | null;
  disabled?: boolean;
  variant?: 'regular' | 'block';
  style?: ViewStyle;
}

function monthOf(value: string): { year: number; month: number } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m] = value.split('-').map(Number);
    return { year: y, month: m };
  }
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/**
 * Date picker field: shows the formatted date (or placeholder) and opens the
 * shared Calendar in a modal. Matches Figma Field Regular when variant="regular".
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Pick a date',
  allowClear,
  error,
  hint,
  disabled = false,
  variant = 'regular',
  style,
}: DateFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(value);
  const [view, setView] = useState(() => monthOf(value));

  const openPicker = () => {
    if (disabled) return;
    Keyboard.dismiss();
    setDraftDate(value);
    setView(monthOf(value));
    setOpen(true);
  };

  const handleReset = () => {
    setDraftDate('');
  };

  const handleSave = () => {
    Keyboard.dismiss();
    onChange(draftDate);
    setOpen(false);
  };

  return (
    <View style={style}>
      {label ? (
        <AppText
          weight="semibold"
          size="small"
          color={disabled ? theme.color.textMuted : theme.color.text}
          style={{ marginBottom: variant === 'regular' ? theme.spacing.xs : theme.spacing.xs }}
        >
          {label}
        </AppText>
      ) : null}

      {variant === 'regular' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label ?? placeholder}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={disabled ? undefined : openPicker}
          style={[
            styles.regularField,
            {
              backgroundColor: theme.color.surface,
              borderWidth: theme.surface.borderWidth,
              borderColor: error
                ? theme.color.danger
                : disabled
                ? theme.color.borderLight
                : open
                ? theme.color.accent
                : theme.surface.borderColor,
              shadowColor: theme.surface.shadowColor,
              shadowOpacity: theme.surface.style === 'soft-shadow' ? theme.surface.shadowOpacity : 0,
              shadowRadius: theme.surface.shadowRadius,
              shadowOffset: { width: 0, height: 1 },
              elevation: theme.surface.style === 'soft-shadow' ? theme.surface.elevation : 0,
            },
          ]}
        >
          <Icon name="calendar" size={18} color={disabled ? theme.color.textMuted : theme.color.accent} strokeWidth={1} />
          <AppText
            size="body"
            color={disabled ? theme.color.textMuted : value ? theme.color.text : open ? theme.color.accent : theme.color.textMuted}
            style={[TYPOGRAPHY.light.body, styles.regularText]}
            numberOfLines={1}
          >
            {value ? formatISODate(value) : placeholder}
          </AppText>
          <Icon name="chevronRight" size={16} color={disabled ? theme.color.textMuted : theme.color.accent} strokeWidth={1.5} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label ?? placeholder}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={disabled ? undefined : openPicker}
          style={[
            styles.blockField,
            {
              backgroundColor: theme.color.surface,
              borderRadius: theme.radius.md,
              borderWidth: theme.surface.borderWidth,
              borderColor: error
                ? theme.color.danger
                : disabled
                ? theme.color.borderLight
                : open
                ? theme.color.accent
                : theme.surface.borderColor,
            },
          ]}
        >
          <Icon name="calendar" size={16} color={disabled ? theme.color.textMuted : theme.color.accent} strokeWidth={1} />
          <AppText size="body" color={disabled ? theme.color.textMuted : value ? theme.color.text : theme.color.textMuted} style={{ flex: 1 }}>
            {value ? formatISODate(value) : placeholder}
          </AppText>
          <Icon name="chevronRight" size={14} color={disabled ? theme.color.textMuted : theme.color.accent} strokeWidth={1.5} />
        </Pressable>
      )}

      {error ? (
        <AppText size="xs" color={theme.color.danger} style={{ marginTop: 2 }}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText size="xs" muted style={{ marginTop: 2 }}>
          {hint}
        </AppText>
      ) : null}

      <Modal visible={open} onClose={() => setOpen(false)} variant="datePicker">
        <Calendar
          key={open ? 'open' : 'closed'}
          bordered={false}
          year={view.year}
          month={view.month}
          selectedDate={draftDate || null}
          today={todayISO()}
          onSelectDate={(d) => setDraftDate(d)}
          onChangeMonth={(year, month) => setView({ year, month })}
        />
        <PrimaryButton2 onReset={handleReset} onSave={handleSave} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  regularField: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingLeft: 8,
    paddingRight: 8,
    gap: 8,
  },
  regularText: {
    flex: 1,
  },
  blockField: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
});

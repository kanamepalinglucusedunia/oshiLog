import { Keyboard, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/hooks/useTheme';

export interface ChipProps {
  label: string;
  leading?: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
}

export function Chip({ label, leading, selected, onPress, disabled, style, color }: ChipProps) {
  const theme = useTheme();
  const fill = color ?? theme.color.accent;
  const handlePress = onPress
    ? () => {
        Keyboard.dismiss();
        onPress();
      }
    : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: theme.radius.pill,
          borderWidth: theme.surface.style === 'outline' ? 2 : 1,
          borderColor: selected ? fill : theme.color.borderLight,
          backgroundColor: selected ? theme.color.accentSurface : theme.color.surface,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs + 2,
        },
        pressed ? { opacity: 0.7 } : null,
        disabled ? { opacity: 0.4 } : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <AppText size="small" weight={selected ? 'semibold' : 'regular'} color={selected ? fill : theme.color.text}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: {
    marginRight: 6,
  },
});

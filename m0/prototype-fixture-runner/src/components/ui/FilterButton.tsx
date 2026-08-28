import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { AppText } from './AppText';
import { useTheme } from '@/hooks/useTheme';

export interface FilterButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
  activeCount?: number;
  style?: StyleProp<ViewStyle>;
}

export function FilterButton({ onPress, accessibilityLabel = 'Filter', activeCount = 0, style }: FilterButtonProps) {
  const theme = useTheme();
  const hasActiveFilters = activeCount > 0;
  const resolvedAccessibilityLabel = hasActiveFilters ? `${accessibilityLabel}, ${activeCount} active` : accessibilityLabel;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resolvedAccessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: hasActiveFilters ? theme.color.accentSurface : theme.color.surface,
          borderColor: hasActiveFilters ? theme.color.accent : theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          borderRadius: theme.radius.lg,
        },
        pressed ? { opacity: 0.7 } : null,
        style,
      ]}
    >
      <Icon name="filter" size={16} color={hasActiveFilters ? theme.color.accent : theme.color.text} strokeWidth={1} />
      {hasActiveFilters ? (
        <View style={[styles.badge, { backgroundColor: theme.color.accent, borderRadius: theme.radius.pill }]}>
          <AppText size="xs" weight="bold" color={theme.color.onAccent}>
            {activeCount > 99 ? '99+' : activeCount}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

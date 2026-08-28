import { View, TextInput, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Figma "Search Bar / Property 1=Compact": tighter padding, gap and radius sm. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SearchBar({ value, onChangeText, placeholder = 'Search', compact = false, style }: SearchBarProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.container,
        compact && styles.compact,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          borderRadius: compact ? theme.radius.sm : theme.radius.lg,
        },
        style,
      ]}
    >
      <Icon name="search" size={16} color={theme.color.textMuted} strokeWidth={1} />
      <TextInput
        accessibilityLabel="Search"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.color.textMuted}
        style={[styles.input, { color: theme.color.text, fontFamily: 'Nunito-Regular' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  compact: {
    flex: 0,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 36,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    paddingVertical: 0,
  },
});

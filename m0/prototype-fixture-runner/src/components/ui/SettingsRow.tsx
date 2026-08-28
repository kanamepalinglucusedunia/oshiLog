import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/hooks/useTheme';

export interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
  danger?: boolean;
}

export function SettingsRow({ icon, label, value, onPress, danger = false }: SettingsRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.color.borderLight }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={20} color={danger ? theme.color.danger : theme.color.textMuted} />
      <View style={styles.rowText}>
        <AppText weight="semibold" size="body">
          {label}
        </AppText>
        <AppText size="small" muted numberOfLines={1}>
          {value}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.color.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
  },
});

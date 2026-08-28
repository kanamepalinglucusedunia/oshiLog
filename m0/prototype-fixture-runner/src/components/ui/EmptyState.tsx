import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/hooks/useTheme';

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = 'sparkles-outline', title, description, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: theme.color.accentSurface,
            borderColor: theme.color.accent,
            borderWidth: theme.surface.style === 'outline' ? 2 : 1,
          },
        ]}
      >
        <Ionicons name={icon} size={32} color={theme.color.accent} />
      </View>
      <AppText weight="bold" size="large" align="center" style={{ marginTop: theme.spacing.md }}>
        {title}
      </AppText>
      {description ? (
        <AppText muted align="center" size="small" style={{ marginTop: theme.spacing.xs }}>
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [{ marginTop: theme.spacing.lg }, pressed && { opacity: 0.6 }]}
        >
          <AppText weight="bold" color={theme.color.accent}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

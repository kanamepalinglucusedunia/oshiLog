import { View, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';
import type { IdolStatus } from '@/types/domain';

export interface CardListProps {
  name: string;
  /** Secondary line, e.g. group name or a membership range ("15 Jan 2025 - Now"). */
  subtitle?: string | null;
  status?: IdolStatus;
  eventCount: number;
  chekiCount: number;
  spendLabel: string | null;
  photoUri?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const STATUS_COLORS: Record<IdolStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  hiatus: 'warning',
  inactive: 'danger',
};

/**
 * Figma "Idol - Idol Card" (Card List): a horizontal row — 50×50 thumbnail,
 * name + subtitle, accent-colored stats, chevron on the right.
 */
export function CardList({
  name,
  subtitle,
  status = 'active',
  eventCount,
  chekiCount,
  spendLabel,
  photoUri,
  onPress,
  style,
}: CardListProps) {
  const theme = useTheme();
  const statusColor = theme.color[STATUS_COLORS[status]];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name} ${subtitle ?? ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          borderRadius: theme.radius.lg,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.shadowOpacity,
          shadowRadius: theme.surface.shadowRadius,
          shadowOffset: { width: 0, height: 2 },
          elevation: theme.surface.elevation,
        },
        pressed ? { opacity: 0.8 } : null,
        style,
      ]}
    >
      <View
        style={[
          styles.thumbnail,
          {
            backgroundColor: theme.color.surfaceMuted,
            borderRadius: theme.radius.sm,
            borderColor: theme.surface.borderColor,
            borderWidth: theme.surface.borderWidth,
          },
        ]}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.thumbnailFill} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.thumbnailFill, styles.thumbnailPlaceholder]}>
            <Icon name="user" size={22} color={theme.color.accent} strokeWidth={1} />
          </View>
        )}
      </View>

      <View style={styles.text}>
        <AppText weight="regular" size="body" numberOfLines={1}>
          {name}
        </AppText>
        {subtitle ? (
          <AppText size="small" weight="light" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
        <View style={styles.statsRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <View style={styles.statItem}>
            <Icon name="calendar" size={11} color={theme.color.accent} strokeWidth={0.7} />
            <AppText size="xs" weight="light" color={theme.color.accent}>
              {eventCount}
            </AppText>
          </View>
          <View style={[styles.miniDivider, { backgroundColor: theme.color.accent }]} />
          <View style={styles.statItem}>
            <Icon name="camera" size={11} color={theme.color.accent} strokeWidth={1} />
            <AppText size="xs" weight="light" color={theme.color.accent}>
              {chekiCount}
            </AppText>
          </View>
          {spendLabel ? (
            <>
              <View style={[styles.miniDivider, { backgroundColor: theme.color.accent }]} />
              <AppText size="xs" weight="light" color={theme.color.accent} style={styles.spend}>
                {spendLabel}
              </AppText>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.chevron}>
        <Icon name="chevronRight" size={20} color={theme.color.text} strokeWidth={1} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  thumbnail: {
    width: 50,
    height: 50,
  },
  thumbnailFill: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniDivider: {
    width: 1,
    height: 10,
    opacity: 0.5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  spend: {
    flexShrink: 1,
  },
  chevron: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

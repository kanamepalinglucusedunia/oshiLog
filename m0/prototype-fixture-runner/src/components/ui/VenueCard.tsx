import { View, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Divider } from './Divider';
import { useTheme } from '@/hooks/useTheme';

export interface VenueCardProps {
  name: string;
  country: string;
  region?: string | null;
  eventCount: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function VenueCard({ name, country, region, eventCount, onPress, style }: VenueCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.lg,
          borderWidth: theme.surface.borderWidth,
          borderColor: theme.surface.borderColor,
        },
        pressed ? { opacity: 0.8 } : null,
        style,
      ]}
    >
      {/* Name — Nunito Regular 18px */}
      <AppText weight="regular" size="large" numberOfLines={1}>
        {name}
      </AppText>

      {/* Country | Region — Nunito Light 12px, black */}
      <View style={styles.metaRow}>
        <AppText size="small" weight="light" numberOfLines={1}>{country}</AppText>
        {region ? (
          <>
            <Divider orientation="vertical" color={theme.color.text} length={10} />
            <AppText size="small" weight="light" numberOfLines={1}>{region}</AppText>
          </>
        ) : null}
      </View>

      {/* Event count badge — absolutely positioned right-center, Nunito Light 18px accent */}
      <View style={styles.badge} pointerEvents="none">
        <View style={styles.badgeRow}>
          <AppText
            weight="light"
            size="large"
            color={theme.color.accent}
            style={{ includeFontPadding: false, lineHeight: 21 }}
          >
            x{eventCount}
          </AppText>
          <Icon name="calendar" size={21} color={theme.color.accent} strokeWidth={0.7} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 4,
    overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divider: {
    width: 1,
    height: 10,
  },
  badge: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
});

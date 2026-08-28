import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/hooks/useTheme';
import type { Trip } from '@/types/domain';
import { formatISODateCompact } from '@/utils/date';
import { CARD_STACK_GAP } from '@/design-system/theme';

export interface EventTripCardProps {
  trip: Trip | null;
  onPress: () => void;
}

/** Compact event-form trip attachment card matching Figma node 62:4643. */
export function EventTripCard({ trip, onPress }: EventTripCardProps) {
  const theme = useTheme();
  const isAttached = !!trip;
  const dateRange = trip
    ? trip.startDate === trip.endDate
      ? formatISODateCompact(trip.startDate)
      : `${formatISODateCompact(trip.startDate)} - ${formatISODateCompact(trip.endDate)}`
    : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isAttached ? `Detach trip ${trip.title}` : 'Attach Trip'}
      accessibilityHint={isAttached ? 'Tap to detach this trip' : 'Tap to attach a trip for the event date'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        !isAttached && styles.cardEmpty,
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
      {trip ? (
        <View style={styles.filledCopy}>
          <AppText size="large" weight="semibold" numberOfLines={1}>{trip.title}</AppText>
          <AppText size="small" weight="light" numberOfLines={1}>
            {dateRange}
          </AppText>
        </View>
      ) : (
        <View style={styles.emptyCopy}>
          <AppText size="large" weight="semibold">Attach Trip</AppText>
          <AppText size="xs" weight="light" color={theme.color.text}>Optional.</AppText>
        </View>
      )}
      <Icon name={trip ? 'minus' : 'plus'} size={28} color={theme.color.text} strokeWidth={1} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    height: 54,
    marginTop: CARD_STACK_GAP,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardEmpty: {
    gap: 8,
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  filledCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
});

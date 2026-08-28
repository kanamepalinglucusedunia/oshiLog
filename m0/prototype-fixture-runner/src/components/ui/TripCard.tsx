import { useMemo } from 'react';
import { View, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Divider } from './Divider';
import { useTheme } from '@/hooks/useTheme';
import { formatISODateCompact } from '@/utils/date';
import { getTripStatus, getTripProgress, TRIP_STATUS_LABEL } from '@/utils/tripStatus';
import { generatePrimaryScale } from '@/design-system/colors';

export interface TripCardProps {
  title: string;
  startDate: string;
  endDate: string;
  today?: string;
  eventCount?: number;
  spendLabel?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function TripCard({
  title,
  startDate,
  endDate,
  today,
  eventCount = 0,
  spendLabel,
  onPress,
  style,
}: TripCardProps) {
  const theme = useTheme();
  const status = getTripStatus({ startDate, endDate }, today);
  const progress = getTripProgress({ startDate, endDate }, today);
  const isCompleted = status === 'passed';
  const primaryScale = useMemo(() => generatePrimaryScale(theme.color.accent), [theme.color.accent]);

  return (
    <Pressable
      testID="trip-card"
      accessibilityRole="button"
      accessibilityLabel={`${title} ${TRIP_STATUS_LABEL[status]}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.lg,
          borderWidth: theme.surface.borderWidth,
          borderColor: theme.surface.borderColor,
          paddingRight: isCompleted ? 46 : 16,
        },
        pressed ? { opacity: 0.8 } : null,
        style,
      ]}
    >
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <AppText
            weight="regular"
            size="large"
            numberOfLines={1}
            style={[styles.title, isCompleted ? styles.completedTitle : null]}
          >
            {title}
          </AppText>
          {!isCompleted ? (
            <View
              testID="trip-card-status"
              style={[
                styles.statusPill,
                {
                  backgroundColor: primaryScale.P50,
                  borderColor: theme.color.accent,
                  borderRadius: theme.radius.pill,
                },
              ]}
            >
              <AppText weight="regular" size="small" color={theme.color.accent}>
                {TRIP_STATUS_LABEL[status]}
              </AppText>
            </View>
          ) : null}
        </View>

        <AppText weight="light" size="small" color={theme.color.text}>
          {formatISODateCompact(startDate)} - {formatISODateCompact(endDate)}
        </AppText>

        {!isCompleted ? (
          <View testID="trip-card-progress" style={[styles.progressTrack, { backgroundColor: theme.color.accentSurface }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.color.accent, width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <View style={styles.iconWrap}>
              <Icon name="calendar" size={12} color={theme.color.accent} strokeWidth={0.7} />
            </View>
            <AppText weight="light" size="small" color={theme.color.accent}>
              {eventCount}
            </AppText>
          </View>
          {spendLabel ? (
            <>
              <Divider orientation="vertical" color={theme.color.accent} length={14} />
              <AppText weight="light" size="small" color={theme.color.accent}>
                {spendLabel} Total
              </AppText>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingLeft: 16,
    gap: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },
  title: {
    flexShrink: 1,
  },
  completedTitle: {
    flex: 1,
  },
  statusPill: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 100,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 100,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 14,
    overflow: 'hidden',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 18,
    height: 18,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniDivider: {
    width: 1,
    height: 12,
    opacity: 0.5,
  },
});

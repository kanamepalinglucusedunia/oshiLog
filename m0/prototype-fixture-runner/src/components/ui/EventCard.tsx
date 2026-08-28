import { useTheme } from '@/hooks/useTheme';
import { isValidISODate } from '@/utils/date';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Divider } from './Divider';
import { Icon } from './Icon';

export interface EventCardProps {
  title: string;
  eventDate: string;
  chekiCount: number;
  spendLabel?: string | null;
  locationLabel?: string | null;
  region?: string | null;
  venue?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function splitDate(date: string): { day: string; month: string; year: string } | null {
  if (!isValidISODate(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  return { day: String(d), month: MONTH_NAMES[m - 1], year: String(y) };
}

export function EventCard({
  title,
  eventDate,
  chekiCount,
  spendLabel,
  locationLabel,
  region,
  venue,
  onPress,
  style,
}: EventCardProps) {
  const theme = useTheme();
  const parts = splitDate(eventDate);
  const subLocation = locationLabel ?? [region, venue].filter(Boolean).join(' | ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
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
      {parts ? (
        <View style={styles.dateCol}>
          <AppText weight="regular" size="large" color={theme.color.accent} style={styles.dateDay}>
            {parts.day}
          </AppText>
          <AppText weight="light" size="small" color={theme.color.text}>
            {parts.month}
          </AppText>
          <AppText weight="light" size="small" color={theme.color.text}>
            {parts.year}
          </AppText>
        </View>
      ) : null}
      <Divider orientation="vertical" thickness={1} color={theme.color.text} style={styles.divider} />
      <View style={styles.info}>
        <AppText weight="regular" size="large" numberOfLines={1}>
          {title}
        </AppText>
        {subLocation ? (
          <AppText weight="regular" size="small" color={theme.color.text} numberOfLines={1}>
            {subLocation}
          </AppText>
        ) : null}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Icon name="camera" size={9} color={theme.color.accent} strokeWidth={1} />
            <AppText weight="light" size="small" color={theme.color.accent}>
              {chekiCount}
            </AppText>
          </View>
          {spendLabel ? (
            <>
              <Divider orientation="vertical" thickness={1} color={theme.color.accent} length={14} />
              <AppText weight="light" size="small" color={theme.color.accent} style={styles.spendText}>
                {spendLabel}
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
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 16,
  },
  dateCol: {
    width: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    lineHeight: 22,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 14,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniDivider: {
    width: 1,
    height: 10,
    opacity: 0.5,
  },
  spendText: {
    textAlign: 'right',
  },
});


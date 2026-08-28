import { View, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { AppText } from './AppText';
import { Divider } from './Divider';
import { useTheme } from '@/hooks/useTheme';

export interface VenueSummaryCardProps {
  name: string;
  country: string;
  region?: string | null;
  eventCount: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function VenueSummaryCard({ name, country, region, eventCount, onPress, style, testID }: VenueSummaryCardProps) {
  const theme = useTheme();
  const surfaceStyle = {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: theme.surface.borderWidth,
    borderColor: theme.surface.borderColor,
    shadowColor: theme.surface.shadowColor,
    shadowOpacity: theme.surface.shadowOpacity,
    shadowRadius: theme.surface.shadowRadius,
    shadowOffset: { width: 0, height: 2 },
    elevation: theme.surface.elevation,
  };
  const content = (
    <>
      <View style={styles.visitStat}>
        <AppText weight="regular" size="h3" align="center">
          {eventCount}
        </AppText>
        <AppText weight="light" size="body" color={theme.color.accent} align="center">
          Visit
        </AppText>
      </View>

      <View style={styles.info}>
        <AppText weight="semibold" size="large" numberOfLines={1}>
          {name}
        </AppText>
        <View style={styles.metaRow}>
          <AppText size="small" weight="light" numberOfLines={1}>
            {formatCountryLabel(country)}
          </AppText>
          <Divider orientation="vertical" thickness={0.5} color={theme.color.text} length={12} />
          <AppText size="small" weight="light" numberOfLines={1} style={styles.region}>
            {region ?? '—'}
          </AppText>
        </View>
      </View>

      <TicketDivider testID="venue-summary-ticket-divider" color={theme.color.text} backgroundColor={theme.color.background} />
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={[styles.container, surfaceStyle, style]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        surfaceStyle,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

function TicketDivider({
  testID,
  color,
  backgroundColor,
}: {
  testID?: string;
  color: string;
  backgroundColor: string;
}) {
  return (
    <View testID={testID} pointerEvents="none" style={styles.ticketDivider}>
      <Svg testID="venue-summary-ticket-asset" width={10} height={76} viewBox="0 0 10 76" style={styles.ticketAsset}>
        <Path
          testID="venue-summary-ticket-top-notch"
          d="M9 4C9 6.20914 7.20914 8 5 8C2.79086 8 1 6.20914 1 4"
          stroke={color}
          strokeWidth={2}
        />
        <Line
          testID="venue-summary-ticket-dashes"
          x1={5}
          y1={11}
          x2={5}
          y2={65}
          stroke={color}
          strokeDasharray={[6, 6]}
          strokeLinecap="butt"
        />
        <Path
          testID="venue-summary-ticket-bottom-notch"
          d="M9 72C9 69.7909 7.20914 68 5 68C2.79086 68 1 69.7909 1 72"
          stroke={color}
          strokeWidth={2}
        />
        <Circle cx={5} cy={4} r={4} fill={backgroundColor} />
        <Circle testID="venue-summary-ticket-bottom-cutout" cx={5} cy={72} r={4} fill={backgroundColor} />
      </Svg>
    </View>
  );
}

function formatCountryLabel(country: string): string {
  return /^[A-Za-z]{2}$/.test(country)
    ? `${country.slice(0, 1).toUpperCase()}${country.slice(1).toLowerCase()}`
    : country;
}

const styles = StyleSheet.create({
  container: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 32,
    overflow: 'visible',
  },
  visitStat: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  region: {
    flex: 1,
  },
  ticketDivider: {
    position: 'absolute',
    left: 60,
    top: -1,
    width: 8,
    height: 65,
  },
  ticketAsset: {
    position: 'absolute',
    left: -1,
    top: -4,
  },
  pressed: {
    opacity: 0.8,
  },
});

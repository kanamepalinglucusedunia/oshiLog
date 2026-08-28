import { Fragment, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import type { CurrencyCode } from '@/types/domain';
import { isValidISODate } from '@/utils/date';
import { formatMoney, formatMoneyTotals } from '@/utils/money';
import { View, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { AppText } from './AppText';
import { Divider } from './Divider';

export interface EventDetailCardProps {
  title: string;
  eventDate: string;
  locationLabel?: string | null;
  onPressLocation?: () => void;
  ticketCurrency: CurrencyCode | null;
  ticketAmount: number | null;
  drinkCurrency: CurrencyCode | null;
  drinkAmount: number | null;
  chekiTotals: Record<CurrencyCode, number>;
  totals: Record<CurrencyCode, number>;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function splitDate(date: string): { day: string; month: string; year: string } | null {
  if (!isValidISODate(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  return { day: String(day), month: MONTH_NAMES[month - 1], year: String(year) };
}

function formatAmount(amount: number | null, currency: CurrencyCode | null): string {
  return currency && amount != null ? formatMoney(amount, currency) : '—';
}

export function EventDetailCard({
  title,
  eventDate,
  locationLabel,
  onPressLocation,
  ticketCurrency,
  ticketAmount,
  drinkCurrency,
  drinkAmount,
  chekiTotals,
  totals,
}: EventDetailCardProps) {
  const theme = useTheme();
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [dividerCenter, setDividerCenter] = useState(0);
  const date = splitDate(eventDate);
  const totalLabel = formatMoneyTotals(totals) ?? '—';
  const chekiLabel = formatMoneyTotals(chekiTotals);
  const location = locationLabel?.trim() || null;
  const spendRows = [
    ...(ticketCurrency && ticketAmount != null && ticketAmount > 0
      ? [{ key: 'ticket', label: 'Ticket Price', value: formatAmount(ticketAmount, ticketCurrency) }]
      : []),
    ...(drinkCurrency && drinkAmount != null && drinkAmount > 0
      ? [{ key: 'drink', label: 'Drink', value: formatAmount(drinkAmount, drinkCurrency) }]
      : []),
    ...(chekiLabel ? [{ key: 'cheki', label: 'Total Cheki', value: chekiLabel }] : []),
  ];

  return (
    <View
      testID="event-summary-card"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setCardSize({ width, height });
      }}
      style={[
        styles.card,
        {
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.lg,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.style === 'soft-shadow' ? theme.surface.shadowOpacity : 0,
          shadowRadius: theme.surface.shadowRadius,
          shadowOffset: { width: 0, height: 2 },
          elevation: theme.surface.style === 'soft-shadow' ? theme.surface.elevation : 0,
        },
      ]}
    >
      <TicketCardFrame
        background={theme.color.background}
        borderRadius={theme.radius.lg}
        dividerCenter={dividerCenter}
        height={cardSize.height}
        stroke={theme.surface.borderColor}
        strokeWidth={theme.surface.borderWidth}
        width={cardSize.width}
      />
      <View
        testID="event-summary-header"
        style={styles.eventHeader}
      >
        {date ? (
          <View style={styles.dateColumn}>
            <AppText weight="regular" size="large" color={theme.color.accent} style={styles.dateDay}>
              {date.day}
            </AppText>
            <AppText weight="light" size="small" color={theme.color.text}>
              {date.month}
            </AppText>
            <AppText weight="light" size="small" color={theme.color.text}>
              {date.year}
            </AppText>
          </View>
        ) : null}
        <Divider orientation="vertical" thickness={1} color={theme.surface.borderColor} style={styles.headerDivider} />
        <View style={styles.headerInfo}>
          <AppText weight="semibold" size="large" numberOfLines={1}>
            {title}
          </AppText>
          {location ? (
            onPressLocation ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Event location: ${location}`}
                onPress={onPressLocation}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <AppText weight="regular" size="small" color={theme.color.accent} numberOfLines={1}>
                  {location}
                </AppText>
              </Pressable>
            ) : (
              <AppText weight="regular" size="small" color={theme.color.accent} numberOfLines={1}>
                {location}
              </AppText>
            )
          ) : null}
        </View>
      </View>

      <View
        testID="event-summary-ticket-divider"
        style={styles.ticketDivider}
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          setDividerCenter(y + height / 2);
        }}
      />

      <View testID="event-spend-section" style={styles.spendSection}>
        <AppText weight="semibold" size="large" style={styles.spendHeading}>
          Spend
        </AppText>
        <Divider color={theme.surface.borderColor} style={styles.majorDivider} />
        {spendRows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 ? <Divider variant="inner" style={styles.innerDivider} /> : null}
            <SpendRow label={row.label} value={row.value} />
          </Fragment>
        ))}
        <View style={styles.totalBlock}>
          <Divider color={theme.color.accent} length={111} style={styles.totalDivider} />
          <AppText weight="semibold" size="body" color={theme.color.accent} align="right" numberOfLines={1}>
            Total {totalLabel}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function TicketCardFrame({
  background,
  borderRadius,
  dividerCenter,
  height,
  stroke,
  strokeWidth,
  width,
}: {
  background: string;
  borderRadius: number;
  dividerCenter: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  width: number;
}) {
  const notchRadius = 9;
  const fallbackWidth = 349;
  const fallbackHeight = 220;
  const frameWidth = width || fallbackWidth;
  const frameHeight = height || fallbackHeight;
  const centerY = dividerCenter || 84;
  const inset = strokeWidth / 2;
  const left = inset;
  const right = frameWidth - inset;
  const top = inset;
  const bottom = frameHeight - inset;
  const radius = Math.max(borderRadius - inset, 0);
  const control = notchRadius * 0.5523;
  const framePath = [
    `M${left + radius} ${top}`,
    `H${right - radius}`,
    `Q${right} ${top} ${right} ${top + radius}`,
    `V${centerY - notchRadius}`,
    `C${right - control} ${centerY - notchRadius} ${right - notchRadius} ${centerY - control} ${right - notchRadius} ${centerY}`,
    `C${right - notchRadius} ${centerY + control} ${right - control} ${centerY + notchRadius} ${right} ${centerY + notchRadius}`,
    `V${bottom - radius}`,
    `Q${right} ${bottom} ${right - radius} ${bottom}`,
    `H${left + radius}`,
    `Q${left} ${bottom} ${left} ${bottom - radius}`,
    `V${centerY + notchRadius}`,
    `C${left + control} ${centerY + notchRadius} ${left + notchRadius} ${centerY + control} ${left + notchRadius} ${centerY}`,
    `C${left + notchRadius} ${centerY - control} ${left + control} ${centerY - notchRadius} ${left} ${centerY - notchRadius}`,
    `V${top + radius}`,
    `Q${left} ${top} ${left + radius} ${top}`,
    'Z',
  ].join('');

  return (
    <Svg
      testID="event-summary-ticket-divider-svg"
      width={width || '100%'}
      height={height || '100%'}
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio="none"
      pointerEvents="none"
      style={styles.ticketDividerSvg}
    >
      <Circle cx={left} cy={centerY} r={notchRadius} fill={background} />
      <Circle cx={right} cy={centerY} r={notchRadius} fill={background} />
      <Path
        testID="event-summary-card-frame"
        d={framePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Line
        testID="event-summary-ticket-divider-dashes"
        x1={left + notchRadius}
        y1={centerY}
        x2={right - notchRadius}
        y2={centerY}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="10 10"
      />
    </Svg>
  );
}

function SpendRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.spendRow}>
      <AppText weight="light" size="small" style={styles.spendLabel}>
        {label}
      </AppText>
      <AppText weight="regular" size="small" align="right" style={styles.spendValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'visible',
    borderWidth: 0,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: '100%',
  },
  dateColumn: {
    width: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    lineHeight: 24,
  },
  headerDivider: {
    alignSelf: 'stretch',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  ticketDivider: {
    height: 16,
  },
  ticketDividerSvg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  spendSection: {
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: '100%',
  },
  spendHeading: {
    alignSelf: 'stretch',
  },
  majorDivider: {
    alignSelf: 'stretch',
  },
  innerDivider: {
    alignSelf: 'stretch',
  },
  spendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: 14,
  },
  spendLabel: {
    width: 150,
  },
  spendValue: {
    flex: 1,
  },
  totalBlock: {
    alignItems: 'flex-end',
    gap: 4,
  },
  totalDivider: {
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.72,
  },
});

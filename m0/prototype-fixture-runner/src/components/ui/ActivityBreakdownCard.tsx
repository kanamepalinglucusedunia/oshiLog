import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { CurrencyCode } from '@/types/domain';
import { CURRENCY_CODES, formatMoney } from '@/utils/money';
import type { ActivityChartSlice } from '@/services/activitySummary';
import { AppText } from './AppText';
import { Card } from './Card';
import { Chip } from './Chip';
import { useTheme } from '@/hooks/useTheme';

type BreakdownMetric = 'spending' | 'cheki';
type ChartType = 'pie' | 'bar';

export interface ActivityBreakdownCardProps {
  spendingBreakdown: Partial<Record<CurrencyCode, ActivityChartSlice[]>>;
  chekiBreakdown: ActivityChartSlice[];
}

interface ToggleProps {
  label: string;
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
}

function collapseSlices(slices: ActivityChartSlice[], maxVisible = 5): ActivityChartSlice[] {
  if (slices.length <= maxVisible) return slices;
  const visible = slices.slice(0, maxVisible);
  const otherValue = slices.slice(maxVisible).reduce((sum, slice) => sum + slice.value, 0);
  return [...visible, { key: 'other', label: 'Others', value: otherValue }];
}

function Toggle({ label, accessibilityLabel, selected, onPress }: ToggleProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggle,
        {
          backgroundColor: selected ? theme.color.accentSurface : theme.color.surface,
          borderColor: selected ? theme.color.accent : theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          borderRadius: theme.radius.pill,
        },
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      <AppText size="small" weight={selected ? 'semibold' : 'regular'} color={selected ? theme.color.accent : theme.color.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

function PieChart({ slices, formatValue }: { slices: ActivityChartSlice[]; formatValue: (value: number) => string }) {
  const theme = useTheme();
  const colors = [theme.color.accent, theme.color.accentStrong, theme.color.success, theme.color.warning, theme.color.accentMuted, theme.color.textMuted];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const center = 90;
  const radius = 58;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.pieLayout}>
      <View style={styles.pieWrap} testID="activity-chart-pie">
        <Svg width={180} height={180} viewBox="0 0 180 180">
          <Circle cx={center} cy={center} r={radius} fill="none" stroke={theme.color.surfaceMuted} strokeWidth={strokeWidth} />
          {slices.map((slice, index) => {
            const length = circumference * (slice.value / total);
            const offset = slices.slice(0, index).reduce(
              (sum, previous) => sum + circumference * (previous.value / total),
              0,
            );
            return (
              <Circle
                key={slice.key}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth={strokeWidth}
                strokeDasharray={[length, Math.max(circumference - length, 0)]}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                rotation="-90"
                origin={`${center}, ${center}`}
              />
            );
          })}
        </Svg>
        <View pointerEvents="none" style={styles.pieCenter}>
          <AppText weight="semibold" size="large" align="center">
            {formatValue(total)}
          </AppText>
        </View>
      </View>
      <View style={styles.legend}>
        {slices.map((slice, index) => (
          <View key={slice.key} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colors[index % colors.length] }]} />
            <AppText size="small" numberOfLines={1} style={styles.legendLabel}>
              {slice.label}
            </AppText>
            <AppText size="small" weight="semibold">
              {formatValue(slice.value)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function BarChart({ slices, formatValue }: { slices: ActivityChartSlice[]; formatValue: (value: number) => string }) {
  const theme = useTheme();
  const max = Math.max(...slices.map((slice) => slice.value), 1);
  return (
    <View testID="activity-chart-bar" style={styles.barList}>
      {slices.map((slice, index) => (
        <View key={slice.key} style={styles.barRow}>
          <View style={styles.barLabelRow}>
            <AppText size="small" numberOfLines={1} style={styles.barLabel}>
              {slice.label}
            </AppText>
            <AppText size="small" weight="semibold">
              {formatValue(slice.value)}
            </AppText>
          </View>
          <View style={[styles.barTrack, { backgroundColor: theme.color.accentSurface }]}>
            <View
              style={[
                styles.barFill,
                { backgroundColor: index === 0 ? theme.color.accent : theme.color.accentStrong, width: `${(slice.value / max) * 100}%` },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ActivityBreakdownCard({ spendingBreakdown, chekiBreakdown }: ActivityBreakdownCardProps) {
  const [metric, setMetric] = useState<BreakdownMetric>('spending');
  const [chartType, setChartType] = useState<ChartType>('pie');
  const availableCurrencies = useMemo(
    () => CURRENCY_CODES.filter((currency) => (spendingBreakdown[currency]?.length ?? 0) > 0),
    [spendingBreakdown],
  );
  const [currency, setCurrency] = useState<CurrencyCode | null>(null);
  const selectedCurrency = currency && availableCurrencies.includes(currency) ? currency : availableCurrencies[0] ?? null;

  const slices = useMemo(
    () => (metric === 'spending'
      ? (selectedCurrency ? spendingBreakdown[selectedCurrency] ?? [] : [])
      : chekiBreakdown),
    [chekiBreakdown, metric, selectedCurrency, spendingBreakdown],
  );
  const displaySlices = useMemo(() => collapseSlices(slices), [slices]);
  const formatValue = (value: number) => metric === 'spending' && selectedCurrency ? formatMoney(value, selectedCurrency) : value.toLocaleString();

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.titleWrap}>
          <AppText weight="semibold" size="large">
            {metric === 'spending' ? 'Spending breakdown' : 'Cheki breakdown'}
          </AppText>
          <AppText size="small" muted>
            {metric === 'spending' ? 'By spending category' : 'By idol'}
          </AppText>
        </View>
        <View style={styles.chartToggleRow}>
          <Toggle label="Pie" accessibilityLabel="Pie chart" selected={chartType === 'pie'} onPress={() => setChartType('pie')} />
          <Toggle label="Bar" accessibilityLabel="Bar chart" selected={chartType === 'bar'} onPress={() => setChartType('bar')} />
        </View>
      </View>

      <View style={styles.metricRow}>
        <Toggle label="Spending" accessibilityLabel="Spending breakdown" selected={metric === 'spending'} onPress={() => setMetric('spending')} />
        <Toggle label="Cheki" accessibilityLabel="Cheki breakdown" selected={metric === 'cheki'} onPress={() => setMetric('cheki')} />
      </View>

      {metric === 'spending' && availableCurrencies.length > 1 ? (
        <View style={styles.currencyRow}>
          {availableCurrencies.map((option) => (
            <Chip key={option} label={option} selected={selectedCurrency === option} onPress={() => setCurrency(option)} />
          ))}
        </View>
      ) : null}

      {displaySlices.length === 0 ? (
        <View style={styles.emptyChart}>
          <AppText muted align="center">
            No breakdown available for this period.
          </AppText>
        </View>
      ) : chartType === 'pie' ? (
        <PieChart slices={displaySlices} formatValue={formatValue} />
      ) : (
        <BarChart slices={displaySlices} formatValue={formatValue} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  chartToggleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggle: {
    minHeight: 32,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pieLayout: {
    alignItems: 'center',
    gap: 16,
  },
  pieWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieCenter: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  legend: {
    width: '100%',
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
  },
  barList: {
    gap: 14,
  },
  barRow: {
    gap: 6,
  },
  barLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    flex: 1,
  },
  barTrack: {
    height: 12,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 9999,
  },
  emptyChart: {
    paddingVertical: 32,
  },
});

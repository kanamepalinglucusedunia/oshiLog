import { useTheme } from '@/hooks/useTheme';
import { totalsToSortedList } from '@/services/aggregation';
import type { CurrencyCode } from '@/types/domain';
import { formatMoney, formatMoneyCompact } from '@/utils/money';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface MetricItem {
  value: number | string;
  label: string;
}

export interface CounterProps {
  /** Custom metric items to display. If omitted, uses eventCount / chekiCount. */
  metrics?: MetricItem[];
  /** Convenience: number of events (only shown if chekiOnly is false and metrics not passed). */
  eventCount?: number;
  /** Convenience: number of chekis. */
  chekiCount?: number;
  /** Spending totals by currency. */
  totals?: Record<CurrencyCode, number>;
  /** If true, format money compactly (e.g., '¥ 2k'). Defaults to true unless chekiOnly is true. */
  compactSpending?: boolean;
  /** Custom label underneath spending box. Defaults to 'Spending' or 'Total Spending' for stacked layout. */
  spendingLabel?: string;
  /** Whether the downstream spending breakdown is expanded. */
  spendingDetailsExpanded?: boolean;
  /** Toggles the downstream spending breakdown when the spending label is pressed. */
  onToggleSpendingDetails?: () => void;
  /** Fallback currency when totals are 0 or empty. Defaults to 'JPY'. */
  defaultCurrency?: CurrencyCode;
  /** Layout direction: 'row' (default) or 'stacked' (Variant 5 in Figma). */
  layout?: 'row' | 'stacked';
  /** If true, only displays cheki count and omits event count. */
  chekiOnly?: boolean;
  /** Container style overrides. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Counter({
  metrics,
  eventCount,
  chekiCount,
  totals,
  compactSpending,
  spendingLabel,
  spendingDetailsExpanded = false,
  onToggleSpendingDetails,
  defaultCurrency = 'JPY',
  layout = 'row',
  chekiOnly = false,
  style,
  testID,
}: CounterProps) {
  const theme = useTheme();

  // Resolve metric list
  const resolvedMetrics: MetricItem[] = React.useMemo(() => {
    if (metrics) return metrics;
    const items: MetricItem[] = [];
    if (!chekiOnly && eventCount !== undefined) {
      items.push({ value: eventCount, label: 'Event' });
    }
    if (chekiCount !== undefined || chekiOnly) {
      items.push({ value: chekiCount ?? 0, label: 'Cheki' });
    }
    return items;
  }, [metrics, eventCount, chekiCount, chekiOnly]);

  // Resolve spending list
  const spendingList = React.useMemo(() => {
    if (!totals) return [{ currency: defaultCurrency, amount: 0 }];
    const list = totalsToSortedList(totals);
    if (list.length === 0) {
      return [{ currency: defaultCurrency, amount: 0 }];
    }
    return list;
  }, [totals, defaultCurrency]);

  const isCompact = compactSpending ?? !chekiOnly;
  const label = spendingLabel ?? (layout === 'stacked' ? 'Total Spending' : 'Spending');

  const cardSurfaceStyle: ViewStyle = {
    backgroundColor: theme.color.surface,
    borderColor: theme.surface.borderColor,
    borderWidth: theme.surface.borderWidth,
    borderRadius: theme.radius.lg,
    shadowColor: theme.surface.shadowColor,
    shadowOpacity: theme.surface.shadowOpacity,
    shadowRadius: theme.surface.shadowRadius,
    shadowOffset: { width: 0, height: 2 },
    elevation: theme.surface.elevation,
  };

  if (layout === 'stacked') {
    return (
      <View
        testID={testID}
        style={[
          styles.stackedContainer,
          cardSurfaceStyle,
          style,
        ]}
      >
        {/* Top metrics row */}
        <View style={styles.stackedMetricsRow}>
          {resolvedMetrics.map((metric, index) => (
            <React.Fragment key={`${metric.label}-${index}`}>
              {index > 0 ? (
                <View
                  style={[
                    styles.verticalDivider,
                    { borderLeftColor: theme.surface.borderColor },
                  ]}
                />
              ) : null}
              <View style={styles.metricItemFlex}>
                <AppText weight="regular" size="h3" color={theme.color.text} align="center">
                  {metric.value}
                </AppText>
                <AppText weight="light" size="body" color={theme.color.accent} align="center">
                  {metric.label}
                </AppText>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Bottom spending box & label */}
        <View style={styles.spendingSection}>
          <View
            style={[
              styles.spendingBox,
              {
                backgroundColor: theme.color.surface,
                borderColor: theme.surface.borderColor,
                borderWidth: theme.surface.borderWidth,
                borderRadius: theme.radius.sm,
              },
            ]}
            testID={testID ? `${testID}-spending` : undefined}
          >
            {spendingList.map((item, index) => {
              const formatted = isCompact
                ? formatMoneyCompact(item.amount, item.currency)
                : formatMoney(item.amount, item.currency);
              return (
                <React.Fragment key={item.currency}>
                  {index > 0 ? (
                    <View
                      style={[
                        styles.horizontalDivider,
                        { borderTopColor: theme.surface.borderColor },
                      ]}
                    />
                  ) : null}
                  <View style={styles.currencyRow}>
                    <AppText weight="regular" size="body" color={theme.color.text}>
                      {item.currency}
                    </AppText>
                    <AppText weight="regular" size="body" color={theme.color.text} align="right">
                      {formatted}
                    </AppText>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
          {onToggleSpendingDetails ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${spendingDetailsExpanded ? 'Collapse' : 'Expand'} ${label}`}
              accessibilityState={{ expanded: spendingDetailsExpanded }}
              hitSlop={8}
              onPress={onToggleSpendingDetails}
              style={styles.spendingToggle}
              testID={testID ? `${testID}-spending-toggle` : undefined}
            >
              <AppText weight="light" size="body" color={theme.color.accent} align="center">
                {label}
              </AppText>
              <View
                accessible
                accessibilityLabel={spendingDetailsExpanded ? 'Chevron up' : 'Chevron down'}
                style={styles.spendingChevron}
                testID={testID ? `${testID}-spending-chevron` : undefined}
              >
                <Icon
                  name={spendingDetailsExpanded ? 'chevronUp' : 'chevronDown'}
                  width={14}
                  height={8}
                  color={theme.color.accent}
                  strokeWidth={1}
                />
              </View>
            </Pressable>
          ) : (
            <AppText weight="light" size="body" color={theme.color.accent} align="center">
              {label}
            </AppText>
          )}
        </View>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={[
        styles.rowContainer,
        cardSurfaceStyle,
        style,
      ]}
    >
      {/* Metric items */}
      {resolvedMetrics.map((metric, index) => (
        <React.Fragment key={`${metric.label}-${index}`}>
          {index > 0 ? (
            <View
              style={[
                styles.verticalDivider,
                { borderLeftColor: theme.surface.borderColor },
              ]}
            />
          ) : null}
          <View style={styles.metricItem}>
            <AppText weight="regular" size="h3" color={theme.color.text} align="center">
              {metric.value}
            </AppText>
            <AppText weight="light" size="body" color={theme.color.accent} align="center">
              {metric.label}
            </AppText>
          </View>
        </React.Fragment>
      ))}

      {/* Divider between metrics and spending */}
      <View
        style={[
          styles.verticalDivider,
          { borderLeftColor: theme.surface.borderColor },
        ]}
      />

      {/* Spending section */}
      <View style={styles.spendingSection}>
        <View
          style={[
            styles.spendingBox,
            {
              backgroundColor: theme.color.surface,
              borderColor: theme.surface.borderColor,
              borderWidth: theme.surface.borderWidth,
              borderRadius: theme.radius.sm,
            },
          ]}
          testID={testID ? `${testID}-spending` : undefined}
        >
          {spendingList.map((item, index) => {
            const formatted = isCompact
              ? formatMoneyCompact(item.amount, item.currency)
              : formatMoney(item.amount, item.currency);
            return (
              <React.Fragment key={item.currency}>
                {index > 0 ? (
                  <View
                    style={[
                      styles.horizontalDivider,
                      { borderTopColor: theme.surface.borderColor },
                    ]}
                  />
                ) : null}
                <View style={styles.currencyRow}>
                  <AppText weight="regular" size="body" color={theme.color.text}>
                    {item.currency}
                  </AppText>
                  <AppText weight="regular" size="body" color={theme.color.text} align="right">
                    {formatted}
                  </AppText>
                </View>
              </React.Fragment>
            );
          })}
        </View>
        <AppText weight="light" size="body" color={theme.color.accent} align="center">
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 8,
    gap: 16,
  },
  stackedContainer: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  stackedMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  metricItem: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metricItemFlex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalDivider: {
    width: 0,
    height: 38,
    borderLeftWidth: 1,
    flexShrink: 0,
  },
  horizontalDivider: {
    width: '100%',
    height: 0,
    borderTopWidth: 1,
    marginVertical: 4,
    flexShrink: 0,
  },
  spendingSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  spendingToggle: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  spendingChevron: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spendingBox: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
  },
});

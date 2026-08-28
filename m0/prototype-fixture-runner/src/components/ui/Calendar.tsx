import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';
import { BLACK_SCALE, generatePrimaryScale } from '@/design-system/colors';
import { toISODate } from '@/utils/date';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEAR_PAGE_SIZE = 12;
const YEAR_PAGE_ALIGNMENT = 10;

function getYearPageStart(year: number): number {
  return Math.floor(year / YEAR_PAGE_ALIGNMENT) * YEAR_PAGE_ALIGNMENT;
}

export interface CalendarProps {
  year: number;
  month: number; // 1-12
  markedDates?: string[];
  today?: string;
  selectedDate?: string | null;
  bordered?: boolean;
  onChangeMonth?: (year: number, month: number) => void;
  onSelectDate?: (date: string) => void;
}

/**
 * Shared calendar, usable both as an event calendar (markedDates) and as a
 * plain datepicker (no markers). Follows the Figma "DatePicker" design:
 * month header with chevrons, P200 weekday row, 40px day cells with
 * today/selected states, and the floating Event Marker on event days.
 */
export function Calendar({
  year,
  month,
  markedDates = [],
  today,
  selectedDate,
  bordered = true,
  onChangeMonth,
  onSelectDate,
}: CalendarProps) {
  const theme = useTheme();
  const accentP50 = useMemo(() => generatePrimaryScale(theme.color.accent).P50, [theme.color.accent]);
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [yearPageStart, setYearPageStart] = useState(() => getYearPageStart(year));

  const marked = useMemo(() => new Set(markedDates), [markedDates]);
  const yearOptions = useMemo(
    () => Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => yearPageStart + index),
    [yearPageStart],
  );

  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const offset = firstDay.getDay(); // Sunday-first
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: { day: number | null; iso: string | null }[] = [];
    for (let i = 0; i < offset; i++) cells.push({ day: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: toISODate(new Date(viewYear, viewMonth - 1, d)) });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
    return cells;
  }, [viewYear, viewMonth]);

  const shift = (delta: number) => {
    const next = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth() + 1);
    setMonthPickerOpen(false);
    setYearPickerOpen(false);
    onChangeMonth?.(next.getFullYear(), next.getMonth() + 1);
  };

  const handleMonthHeaderPress = () => {
    if (monthPickerOpen) {
      setMonthPickerOpen(false);
      setYearPickerOpen(false);
      return;
    }

    setYearPageStart(getYearPageStart(viewYear));
    setYearPickerOpen(false);
    setMonthPickerOpen(true);
  };

  const handleYearPress = (nextYear: number) => {
    setViewYear(nextYear);
    setYearPageStart(getYearPageStart(nextYear));
    setYearPickerOpen(false);
  };

  const handleMonthPress = (nextMonth: number) => {
    setViewMonth(nextMonth);
    setMonthPickerOpen(false);
    setYearPickerOpen(false);
    onChangeMonth?.(viewYear, nextMonth);
  };

  return (
    <View
      style={[
        styles.container,
        bordered
          ? {
              backgroundColor: theme.color.surface,
              borderRadius: theme.radius.lg,
              borderWidth: theme.surface.borderWidth,
              borderColor: theme.surface.borderColor,
            }
          : styles.unborderedContainer,
      ]}
    >
      {/* Month Picker */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose month and year, ${MONTH_NAMES[viewMonth - 1]} ${viewYear}`}
          accessibilityState={{ expanded: monthPickerOpen }}
          onPress={handleMonthHeaderPress}
          style={styles.monthButton}
        >
          <AppText weight="semibold" size="large">
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </AppText>
          <Icon name={monthPickerOpen ? 'chevronDown' : 'chevronRight'} size={14} color={theme.color.accent} strokeWidth={1.5} />
        </Pressable>
        <View style={styles.arrows}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => shift(-1)} hitSlop={10} style={styles.arrowButton}>
            <Icon name="chevronLeft" size={20} color={theme.color.accent} strokeWidth={1.5} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shift(1)} hitSlop={10} style={styles.arrowButton}>
            <Icon name="chevronRight" size={20} color={theme.color.accent} strokeWidth={1.5} />
          </Pressable>
        </View>
      </View>

      {monthPickerOpen ? (
        <View style={styles.picker}>
          <View style={styles.pickerHeader}>
            {yearPickerOpen ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous year range"
                onPress={() => setYearPageStart((current) => current - YEAR_PAGE_SIZE)}
                style={styles.pickerNavButton}
              >
                <Icon name="chevronLeft" size={18} color={theme.color.accent} strokeWidth={1.5} />
              </Pressable>
            ) : (
              <View style={styles.pickerNavPlaceholder} />
            )}

            {yearPickerOpen ? (
              <AppText weight="semibold" size="body">
                {yearPageStart}–{yearPageStart + YEAR_PAGE_SIZE - 1}
              </AppText>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose year ${viewYear}`}
                onPress={() => {
                  setYearPageStart(getYearPageStart(viewYear));
                  setYearPickerOpen(true);
                }}
                style={[styles.pickerYearButton, { borderRadius: theme.radius.md }]}
              >
                <AppText weight="semibold" size="body" color={theme.color.accent}>
                  {viewYear}
                </AppText>
                <Icon name="chevronDown" size={12} color={theme.color.accent} strokeWidth={1.5} />
              </Pressable>
            )}

            {yearPickerOpen ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next year range"
                onPress={() => setYearPageStart((current) => current + YEAR_PAGE_SIZE)}
                style={styles.pickerNavButton}
              >
                <Icon name="chevronRight" size={18} color={theme.color.accent} strokeWidth={1.5} />
              </Pressable>
            ) : (
              <View style={styles.pickerNavPlaceholder} />
            )}
          </View>

          {yearPickerOpen ? (
            <View style={[styles.pickerGrid, { gap: theme.spacing.xs }]}>
              {yearOptions.map((optionYear) => {
                const isSelected = optionYear === viewYear;
                return (
                  <Pressable
                    key={optionYear}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose year ${optionYear}`}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => handleYearPress(optionYear)}
                    style={[
                      styles.pickerOption,
                      { borderRadius: theme.radius.md },
                      isSelected && {
                        backgroundColor: accentP50,
                        borderColor: theme.color.accent,
                        borderWidth: theme.surface.borderWidth,
                      },
                    ]}
                  >
                    <AppText weight={isSelected ? 'semibold' : 'regular'} size="small" color={isSelected ? theme.color.accent : theme.color.text}>
                      {optionYear}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={[styles.pickerGrid, { gap: theme.spacing.xs }]}>
              {MONTH_NAMES.map((monthName, index) => {
                const optionMonth = index + 1;
                const isSelected = optionMonth === viewMonth;
                return (
                  <Pressable
                    key={monthName}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${monthName} ${viewYear}`}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => handleMonthPress(optionMonth)}
                    style={[
                      styles.pickerOption,
                      { borderRadius: theme.radius.md },
                      isSelected && {
                        backgroundColor: accentP50,
                        borderColor: theme.color.accent,
                        borderWidth: theme.surface.borderWidth,
                      },
                    ]}
                  >
                    <AppText weight={isSelected ? 'semibold' : 'regular'} size="small" color={isSelected ? theme.color.accent : theme.color.text}>
                      {monthName.slice(0, 3)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : (
        <>
          {/* Days of week */}
          <View style={styles.weekRow}>
            {WEEKDAYS.map((weekday) => (
              <View key={weekday} style={styles.weekCell}>
                <AppText weight="semibold" size="small" color={theme.color.accentStrong}>
                  {weekday}
                </AppText>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.grid}>
            {cells.map((cell, index) => {
              if (cell.day === null) return <View key={index} style={styles.cell} />;
              const isToday = cell.iso === today;
              const isSelected = cell.iso !== null && cell.iso === selectedDate;
              const isMarked = cell.iso !== null && marked.has(cell.iso);
              return (
                <View key={index} style={styles.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={cell.iso ?? undefined}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => cell.iso && onSelectDate?.(cell.iso)}
                    style={styles.dayWrap}
                  >
                    {isSelected ? (
                      <View
                        testID="calendar-selected-date"
                        style={[
                          styles.selectedCircle,
                          { backgroundColor: theme.color.accent, borderRadius: theme.radius.pill },
                        ]}
                      >
                        <AppText weight="regular" size="large" color={theme.color.onAccent}>
                          {cell.day}
                        </AppText>
                        {isMarked ? (
                          <View
                            style={[
                              styles.selectedDot,
                              { backgroundColor: theme.color.danger, borderColor: theme.color.surface },
                            ]}
                          />
                        ) : null}
                      </View>
                    ) : isMarked ? (
                      <View
                        style={[
                          styles.eventMarker,
                          {
                            backgroundColor: theme.color.surface,
                            borderColor: isToday ? theme.color.accent : theme.surface.borderColor,
                            borderWidth: isToday ? 1.5 : theme.surface.borderWidth,
                          },
                        ]}
                      >
                        <View style={[styles.eventMarkerInner, { backgroundColor: theme.color.accent }]}>
                          <AppText weight="regular" size="large" color={BLACK_SCALE.B0} style={styles.eventMarkerText}>
                            {cell.day}
                          </AppText>
                        </View>
                        <View
                          style={[
                            styles.eventMarkerDot,
                            { backgroundColor: theme.color.danger, borderColor: theme.color.surface },
                          ]}
                        />
                      </View>
                    ) : (
                      <View style={[styles.dayCircle, isToday && { borderWidth: 1, borderColor: theme.color.accent }]}>
                        <AppText weight="regular" size="large" color={theme.color.text}>
                          {cell.day}
                        </AppText>
                      </View>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 6,
  },
  unborderedContainer: {
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
    paddingVertical: 7,
  },
  monthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  picker: {
    gap: 8,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  pickerNavButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerNavPlaceholder: {
    width: 40,
    height: 40,
  },
  pickerYearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 8,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  pickerOption: {
    width: '31%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrows: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: 51,
  },
  arrowButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekCell: {
    width: 32,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cell: {
    width: 40,
    alignItems: 'center',
  },
  dayWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventMarker: {
    width: 35,
    height: 40,
    borderRadius: 6,
    paddingTop: 1.5,
    paddingLeft: 1.5,
    paddingRight: 1.5,
    paddingBottom: 6.5,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  eventMarkerInner: {
    width: 30,
    height: 30,
    borderRadius: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventMarkerText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  eventMarkerDot: {
    position: 'absolute',
    top: -4,
    left: 13,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  selectedDot: {
    position: 'absolute',
    top: -3,
    left: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
});

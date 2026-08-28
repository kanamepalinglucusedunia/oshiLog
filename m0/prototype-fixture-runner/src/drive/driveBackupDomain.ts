import type { DriveFrequency } from './contracts';

export type CadenceFrequency = Exclude<DriveFrequency, 'off'>;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const MAX_ADVANCE_STEPS = 1_200;

function calendarMonthAdd(iso: string, months: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date for Drive cadence.');
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return date.toISOString();
}

/**
 * Adds one calendar interval to a UTC ISO timestamp.
 * Daily += 1 day; weekly += 7 days; monthly += 1 calendar month computed in the
 * device (local) timezone, preserving the local clock time and clamping month ends.
 */
export function addCalendarInterval(iso: string, frequency: CadenceFrequency): string {
  switch (frequency) {
    case 'daily':
      return new Date(Date.parse(iso) + DAY_MS).toISOString();
    case 'weekly':
      return new Date(Date.parse(iso) + WEEK_MS).toISOString();
    case 'monthly':
      return calendarMonthAdd(iso, 1);
    default:
      throw new Error(`Unknown schedule cadence: ${String(frequency)}`);
  }
}

/**
 * Advances a due date from `previousDue` until the first date strictly after
 * `now`. Late runs never burst-run every missed occurrence: each anchor is
 * exactly one cadence interval apart, starting from the previous due date.
 */
export function advanceDueDate(previousDue: string, frequency: CadenceFrequency, now: string): string {
  let anchor = previousDue;
  for (let step = 0; step < MAX_ADVANCE_STEPS; step += 1) {
    if (Date.parse(anchor) > Date.parse(now)) return anchor;
    anchor = addCalendarInterval(anchor, frequency);
  }
  throw new Error('Drive cadence could not advance within a bounded number of steps.');
}

export function isDue(nextDueAt: string, now: string): boolean {
  return Date.parse(nextDueAt) <= Date.parse(now);
}

export function shortestEnabledIntervalMs(
  schedules: readonly { frequency: DriveFrequency }[],
): number | null {
  let shortest: number | null = null;
  for (const schedule of schedules) {
    const interval = schedule.frequency === 'daily'
      ? DAY_MS
      : schedule.frequency === 'weekly'
        ? WEEK_MS
        : schedule.frequency === 'monthly'
          ? MONTH_MS
          : null;
    if (interval !== null && (shortest === null || interval < shortest)) shortest = interval;
  }
  return shortest;
}
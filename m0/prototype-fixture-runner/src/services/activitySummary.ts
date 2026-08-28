import type { SqliteLike } from '@/db/types';
import type { CurrencyCode } from '@/types/domain';
import { emptyMoneyTotals } from '@/utils/money';
import { getTopIdols, type DateRange, type TopIdolRow } from './dashboard';

export type ActivityRange = DateRange;

export interface ActivityChartSlice {
  key: string;
  label: string;
  value: number;
}

export interface ActivitySummary {
  eventDates: string[];
  eventCount: number;
  chekiCount: number;
  tripCount: number;
  spendingTotals: Record<CurrencyCode, number>;
  spendingBreakdown: Partial<Record<CurrencyCode, ActivityChartSlice[]>>;
  chekiBreakdown: ActivityChartSlice[];
  topIdols: TopIdolRow[];
}

const SPENDING_CATEGORY_ORDER = ['ticket', 'drink', 'cheki', 'tripExpense'];

/**
 * Aggregates the data used by Activity Summary for one inclusive date range.
 * Money remains separated by currency so callers never compare or sum unlike
 * currencies in the same chart.
 */
export function getActivitySummary(db: SqliteLike, range: ActivityRange, topLimit = 3): ActivitySummary {
  const eventDates = db
    .getAllSync<{ eventDate: string }>(
      `SELECT DISTINCT event_date AS eventDate
       FROM event
       WHERE deleted_at IS NULL AND event_date BETWEEN ? AND ?
       ORDER BY event_date`,
      range.startDate,
      range.endDate,
    )
    .map((row) => row.eventDate);

  const eventCount = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM event
     WHERE deleted_at IS NULL AND event_date BETWEEN ? AND ?`,
    range.startDate,
    range.endDate,
  )?.count ?? 0;

  const chekiCount = db.getFirstSync<{ count: number }>(
    `SELECT COALESCE(SUM(ce.quantity), 0) AS count
     FROM cheki_entry ce
     JOIN event e ON e.id = ce.event_id
     WHERE ce.deleted_at IS NULL AND e.deleted_at IS NULL
       AND e.event_date BETWEEN ? AND ?`,
    range.startDate,
    range.endDate,
  )?.count ?? 0;

  const tripCount = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM trip
     WHERE deleted_at IS NULL AND start_date <= ? AND end_date >= ?`,
    range.endDate,
    range.startDate,
  )?.count ?? 0;

  const spendingRows = db.getAllSync<{
    category: string;
    label: string;
    currency: CurrencyCode;
    amount: number;
  }>(
    `SELECT 'ticket' AS category, 'Ticket' AS label, ticket_currency AS currency, SUM(ticket_amount) AS amount
       FROM event
       WHERE deleted_at IS NULL AND event_date BETWEEN ? AND ?
         AND ticket_currency IS NOT NULL AND ticket_amount IS NOT NULL
       GROUP BY ticket_currency
     UNION ALL
     SELECT 'drink' AS category, 'Drink' AS label, drink_currency AS currency, SUM(drink_amount) AS amount
       FROM event
       WHERE deleted_at IS NULL AND event_date BETWEEN ? AND ?
         AND drink_currency IS NOT NULL AND drink_amount IS NOT NULL
       GROUP BY drink_currency
     UNION ALL
     SELECT 'cheki' AS category, 'Cheki' AS label, ce.currency AS currency, SUM(ce.subtotal) AS amount
       FROM cheki_entry ce
       JOIN event e ON e.id = ce.event_id
       WHERE ce.deleted_at IS NULL AND e.deleted_at IS NULL AND e.event_date BETWEEN ? AND ?
       GROUP BY ce.currency
     UNION ALL
     SELECT 'tripExpense' AS category, 'Trip expense' AS label, currency, SUM(amount) AS amount
       FROM trip_expense
       WHERE deleted_at IS NULL AND expense_date BETWEEN ? AND ?
       GROUP BY currency`,
    range.startDate,
    range.endDate,
    range.startDate,
    range.endDate,
    range.startDate,
    range.endDate,
    range.startDate,
    range.endDate,
  );

  const spendingTotals = emptyMoneyTotals();
  const spendingByCurrency: Partial<Record<CurrencyCode, ActivityChartSlice[]>> = {};
  for (const row of spendingRows) {
    if (row.amount <= 0) continue;
    spendingTotals[row.currency] += row.amount;
    const slices = spendingByCurrency[row.currency] ?? [];
    slices.push({ key: row.category, label: row.label, value: row.amount });
    spendingByCurrency[row.currency] = slices;
  }
  for (const slices of Object.values(spendingByCurrency)) {
    slices?.sort((a, b) => SPENDING_CATEGORY_ORDER.indexOf(a.key) - SPENDING_CATEGORY_ORDER.indexOf(b.key));
  }

  const chekiBreakdown = db.getAllSync<ActivityChartSlice>(
    `SELECT ce.idol_id AS key,
       COALESCE(MAX(ce.idol_name_snapshot), i.name) AS label,
       SUM(ce.quantity) AS value
     FROM cheki_entry ce
     JOIN idol i ON i.id = ce.idol_id
     JOIN event e ON e.id = ce.event_id
     WHERE ce.deleted_at IS NULL AND e.deleted_at IS NULL
       AND e.event_date BETWEEN ? AND ?
     GROUP BY ce.idol_id, i.name
     ORDER BY value DESC, label ASC`,
    range.startDate,
    range.endDate,
  );

  return {
    eventDates,
    eventCount,
    chekiCount,
    tripCount,
    spendingTotals,
    spendingBreakdown: spendingByCurrency,
    chekiBreakdown,
    topIdols: getTopIdols(db, 'cheki', topLimit, range),
  };
}

import type { SqliteLike } from '@/db/types';
import type { CurrencyCode, Event, Trip } from '@/types/domain';
import { File } from 'expo-file-system';
import { compareISODate, formatISOMonth, isValidISODate, todayISO } from '@/utils/date';
import { emptyMoneyTotals } from '@/utils/money';
import { pickDisplayMembership } from './membership';

export type TopIdolMetric = 'cheki' | 'event';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface TopIdolRow {
  idolId: string;
  idolName: string;
  photoMediaId: string | null;
  groupName: string | null;
  status: 'active' | 'hiatus' | 'inactive';
  isFavorite: boolean;
  chekiCount: number;
  eventCount: number;
  spendTotals: Record<CurrencyCode, number>;
  rankAmount: number;
  rankCurrency: CurrencyCode | null;
}

const ZERO_TOTALS = emptyMoneyTotals();

/**
 * Active trip for "today": a trip whose range covers today. Falls back to the
 * nearest upcoming trip, then to the most recent past trip.
 */
export function getActiveTrip(db: SqliteLike, today = todayISO()): Trip | null {
  const trips = db.getAllSync<Trip>(
    `SELECT id, title, start_date AS startDate, end_date AS endDate, description, is_favorite AS isFavorite,
      schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
     FROM trip WHERE deleted_at IS NULL ORDER BY start_date`,
  );
  const active = trips.find((t) => t.startDate <= today && t.endDate >= today);
  if (active) return active;
  const upcoming = trips
    .filter((t) => t.startDate > today)
    .sort((a, b) => compareISODate(a.startDate, b.startDate))[0];
  if (upcoming) return upcoming;
  return trips[trips.length - 1] ?? null;
}

export function getRecentEvents(db: SqliteLike, limit = 5): Event[] {
  const rows = db.getAllSync<Event>(
    `SELECT id, title, event_date AS eventDate, country, venue_id AS venueId, trip_id AS tripId,
      ticket_currency AS ticketCurrency, ticket_amount AS ticketAmount, drink_currency AS drinkCurrency,
      drink_amount AS drinkAmount, notes,
      schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
     FROM event WHERE deleted_at IS NULL ORDER BY event_date DESC, created_at DESC LIMIT ?`,
    limit,
  );
  return rows as Event[];
}

export function getMonthEventDates(db: SqliteLike, yearMonth: string): string[] {
  const rows = db.getAllSync<{ eventDate: string }>(
    `SELECT DISTINCT event_date AS eventDate FROM event WHERE deleted_at IS NULL AND substr(event_date, 1, 7) = ? ORDER BY event_date`,
    yearMonth,
  );
  return rows.map((r) => r.eventDate);
}

export interface EventByDateRow {
  id: string;
  title: string;
  venueName: string | null;
}

export function getEventsByDate(db: SqliteLike, date: string): EventByDateRow[] {
  return db.getAllSync<EventByDateRow>(
    `SELECT e.id, e.title, v.name AS venueName
     FROM event e
     LEFT JOIN venue v ON v.id = e.venue_id
     WHERE e.deleted_at IS NULL AND e.event_date = ?
     ORDER BY e.created_at DESC`,
    date,
  );
}

export interface IdolPhotoUri {
  mediaId: string;
  uri: string | null;
}

export function resolveIdolPhotoUris(db: SqliteLike, mediaIds: (string | null)[]): Map<string, string> {
  const ids = [...new Set(mediaIds.filter((id): id is string => id != null))];
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.getAllSync<{ id: string; thumbnailPath: string | null; localPath: string | null }>(
    `SELECT id, thumbnail_path AS thumbnailPath, local_path AS localPath
     FROM media_asset WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    ...ids,
  );
  for (const row of rows) {
    const uri = row.thumbnailPath ?? row.localPath;
    if (uri && fileExists(uri)) result.set(row.id, uri);
    else if (row.localPath && fileExists(row.localPath)) result.set(row.id, row.localPath);
  }
  return result;
}

function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export interface RecentEventRow {
  id: string;
  title: string;
  eventDate: string;
  country: string;
  venueName?: string | null;
  venueRegion?: string | null;
  chekiCount: number;
  spendTotals: Record<CurrencyCode, number>;
  primaryCurrency: CurrencyCode | null;
}

export function getRecentEventsWithStats(db: SqliteLike, limit = 4): RecentEventRow[] {
  const events = db.getAllSync<{
    id: string;
    title: string;
    eventDate: string;
    country: string;
    venueName: string | null;
    venueRegion: string | null;
  }>(
    `SELECT e.id, e.title, e.event_date AS eventDate, e.country,
       v.name AS venueName, v.region AS venueRegion
     FROM event e
     LEFT JOIN venue v ON v.id = e.venue_id
     WHERE e.deleted_at IS NULL
     ORDER BY e.event_date DESC, e.created_at DESC
     LIMIT ?`,
    limit,
  );
  if (events.length === 0) return [];

  const placeholders = events.map(() => '?').join(',');
  const statRows = db.getAllSync<{ eventId: string; currency: CurrencyCode; chekiCount: number; spend: number }>(
    `SELECT event_id AS eventId, currency, SUM(quantity) AS chekiCount, SUM(subtotal) AS spend
     FROM cheki_entry
     WHERE deleted_at IS NULL AND event_id IN (${placeholders})
     GROUP BY event_id, currency`,
    ...events.map((event) => event.id),
  );
  const statsByEvent = new Map<string, { chekiCount: number; spendTotals: Record<CurrencyCode, number> }>();
  for (const row of statRows) {
    const stats = statsByEvent.get(row.eventId) ?? { chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
    stats.chekiCount += row.chekiCount;
    stats.spendTotals[row.currency] = row.spend;
    statsByEvent.set(row.eventId, stats);
  }

  return events.map((event) => {
    const stats = statsByEvent.get(event.id) ?? { chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
    const activeCurrencies = (Object.keys(stats.spendTotals) as CurrencyCode[]).filter((currency) => stats.spendTotals[currency] > 0);
    return {
      ...event,
      venueName: event.venueName ?? null,
      venueRegion: event.venueRegion ?? null,
      chekiCount: stats.chekiCount,
      spendTotals: stats.spendTotals,
      primaryCurrency: activeCurrencies.length === 1 ? activeCurrencies[0] : null,
    };
  });
}

export function getTopIdols(db: SqliteLike, metric: TopIdolMetric, limit = 5, range?: DateRange): TopIdolRow[] {
  const rangeFilter = range ? ' AND e.event_date BETWEEN ? AND ?' : '';
  const rangeParams = range ? [range.startDate, range.endDate] : [];
  const rows = db.getAllSync<{
    idolId: string;
    idolName: string;
    photoMediaId: string | null;
    status: 'active' | 'hiatus' | 'inactive';
    isFavorite: number;
    chekiCount: number;
    currencyEventCount: number;
    currency: string;
    spend: number;
  }>(
    `SELECT ce.idol_id AS idolId, i.name AS idolName, i.photo_media_id AS photoMediaId,
      i.status AS status, i.is_favorite AS isFavorite,
      SUM(ce.quantity) AS chekiCount, COUNT(DISTINCT ce.event_id) AS currencyEventCount,
      ce.currency AS currency, SUM(ce.subtotal) AS spend
     FROM cheki_entry ce
     JOIN idol i ON i.id = ce.idol_id
     JOIN event e ON e.id = ce.event_id
     WHERE ce.deleted_at IS NULL AND e.deleted_at IS NULL${rangeFilter}
     GROUP BY ce.idol_id, ce.currency`,
    ...rangeParams,
  );

  const idolIds = [...new Set(rows.map((r) => r.idolId))];
  const eventCounts = new Map<string, number>();
  if (idolIds.length > 0) {
    const placeholders = idolIds.map(() => '?').join(',');
    const countRows = db.getAllSync<{ idolId: string; eventCount: number }>(
      `SELECT ce.idol_id AS idolId, COUNT(DISTINCT ce.event_id) AS eventCount
       FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
      WHERE ce.idol_id IN (${placeholders}) AND ce.deleted_at IS NULL AND e.deleted_at IS NULL${rangeFilter}
       GROUP BY ce.idol_id`,
      ...idolIds,
      ...rangeParams,
    );
    for (const row of countRows) eventCounts.set(row.idolId, row.eventCount);
  }
  const displayById = new Map<string, { idolName: string | null; groupName: string | null }>();
  if (idolIds.length > 0) {
    const placeholders = idolIds.map(() => '?').join(',');
    const memberships = db.getAllSync<{
      idolId: string;
      name: string | null;
      isMain: number;
      startDate: string;
      endDate: string | null;
      groupName: string;
    }>(
      `SELECT gm.idol_id AS idolId, gm.name, gm.is_main AS isMain, gm.start_date AS startDate, gm.end_date AS endDate, g.name AS groupName
       FROM group_membership gm
       JOIN groups g ON g.id = gm.group_id
       WHERE gm.idol_id IN (${placeholders}) AND gm.deleted_at IS NULL AND g.deleted_at IS NULL
         AND (gm.end_date IS NULL OR gm.end_date >= date('now'))
         AND gm.start_date <= date('now')
       ORDER BY gm.start_date`,
      ...idolIds,
    );
    const byIdol = new Map<string, typeof memberships>();
    for (const m of memberships) {
      const list = byIdol.get(m.idolId) ?? [];
      list.push(m);
      byIdol.set(m.idolId, list);
    }
    for (const idolId of idolIds) {
      const list = byIdol.get(idolId) ?? [];
      const picked = pickDisplayMembership(
        list.map((m) => ({ ...m, isMain: m.isMain === 1 })),
        todayISO(),
      );
      displayById.set(idolId, picked ? { idolName: picked.name, groupName: picked.groupName ?? null } : { idolName: null, groupName: null });
    }
  }

  const byIdol = new Map<
    string,
    { idolName: string; photoMediaId: string | null; status: 'active' | 'hiatus' | 'inactive'; isFavorite: boolean; groupName: string | null; chekiCount: number; eventCount: number; spendTotals: Record<CurrencyCode, number>; entryCurrencyCounts: Record<string, number> }
  >();
  for (const row of rows) {
    const entry = byIdol.get(row.idolId) ?? {
      idolName: displayById.get(row.idolId)?.idolName ?? row.idolName,
      photoMediaId: row.photoMediaId,
      status: row.status,
      isFavorite: row.isFavorite === 1,
      groupName: displayById.get(row.idolId)?.groupName ?? null,
      chekiCount: 0,
      eventCount: eventCounts.get(row.idolId) ?? 0,
      spendTotals: { ...ZERO_TOTALS },
      entryCurrencyCounts: {} as Record<string, number>,
    };
    entry.chekiCount += row.chekiCount;
    entry.spendTotals[row.currency as CurrencyCode] += row.spend;
    entry.entryCurrencyCounts[row.currency] = row.chekiCount;
    byIdol.set(row.idolId, entry);
  }

  const idols: TopIdolRow[] = [...byIdol.entries()].map(([idolId, data]) => {
    // Rank currency = the one the idol used most often (ties → first alphabetically).
    const entries = Object.entries(data.entryCurrencyCounts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const rankCurrency = (entries[0]?.[0] as CurrencyCode) ?? null;
    const rankAmount = rankCurrency ? data.spendTotals[rankCurrency] : 0;
    return {
      idolId,
      idolName: data.idolName,
      photoMediaId: data.photoMediaId,
      groupName: data.groupName,
      status: data.status,
      isFavorite: data.isFavorite,
      chekiCount: data.chekiCount,
      eventCount: data.eventCount,
      spendTotals: data.spendTotals,
      rankAmount,
      rankCurrency,
    };
  });

  idols.sort((a, b) => {
    if (metric === 'cheki') return b.chekiCount - a.chekiCount;
    return b.eventCount - a.eventCount;
  });

  return idols.slice(0, limit);
}

export { formatISOMonth, isValidISODate };

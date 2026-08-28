import type { SqliteLike } from '@/db/types';
import type { AlbumMediaRow } from '@/repositories/event';
import type { CountryCode, CurrencyCode, StoredInstaxPreset } from '@/types/domain';
import { emptyMoneyTotals } from '@/utils/money';
import { clampLimit, decodeCursor, encodeCursor, type PageCursor } from '@/repositories/cursor';

export type DetailSortOrder = 'newest' | 'oldest';
export type AlbumFilterKind = 'all' | 'cheki' | 'photo' | 'video';

export interface IdolChekiTypeLine {
  chekiTypeId: string;
  label: string;
  currency: CurrencyCode;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface IdolDetailHistoryRow {
  id: string;
  title: string;
  eventDate: string;
  country: CountryCode;
  venueName: string | null;
  venueRegion: string | null;
  chekiCount: number;
  chekiTotals: Record<CurrencyCode, number>;
  types: IdolChekiTypeLine[];
}

interface IdolEntryHistoryRow {
  eventId: string;
  title: string;
  eventDate: string;
  country: CountryCode;
  venueName: string | null;
  venueRegion: string | null;
  chekiTypeId: string;
  chekiTypeLabel: string;
  currency: CurrencyCode;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface IdolHistoryFilters {
  month?: string; // 'all' | MM
  year?: string; // 'all' | YYYY
}

export interface IdolHistoryPageArgs {
  filters?: IdolHistoryFilters;
  sort?: DetailSortOrder;
  limit?: number;
  cursor?: PageCursor;
}

export interface IdolHistoryPageResult {
  rows: IdolDetailHistoryRow[];
  nextCursor: PageCursor;
  hasMore: boolean;
}

export function countIdolDetailHistory(db: SqliteLike, idolId: string, filters: IdolHistoryFilters = {}): number {
  const month = filters.month ?? 'all';
  const year = filters.year ?? 'all';
  const where: string[] = ['ce.idol_id = ?', `ce.deleted_at IS NULL`, `e.deleted_at IS NULL`];
  const params: unknown[] = [idolId];
  if (year !== 'all') { where.push(`substr(e.event_date,1,4) = ?`); params.push(year); }
  if (month !== 'all') { where.push(`substr(e.event_date,6,2) = ?`); params.push(month); }
  const row = db.getFirstSync<{ c: number }>(
    `SELECT COUNT(DISTINCT e.id) AS c FROM cheki_entry ce JOIN event e ON e.id = ce.event_id WHERE ${where.join(' AND ')}`,
    ...params,
  );
  return row?.c ?? 0;
}

export function getIdolDetailHistoryPage(
  db: SqliteLike,
  idolId: string,
  args: IdolHistoryPageArgs = {},
): IdolHistoryPageResult {
  const sort = args.sort ?? 'newest';
  const limit = clampLimit(args.limit);
  const month = args.filters?.month ?? 'all';
  const year = args.filters?.year ?? 'all';
  const isAsc = sort === 'oldest';
  const cmp = isAsc ? '>' : '<';
  const eq = '=';

  const fetchLimit = limit + 1;

  const rawRows = db.getAllSync<IdolEntryHistoryRow & { eventCreatedAt: string }>(
    `SELECT e.id AS eventId, e.title, e.event_date AS eventDate, e.country,
      v.name AS venueName, v.region AS venueRegion,
      ce.cheki_type_id AS chekiTypeId,
      COALESCE(ce.cheki_type_label_snapshot, ct.label) AS chekiTypeLabel,
      ce.currency, ce.unit_price AS unitPrice, ce.quantity, ce.subtotal,
      e.created_at AS eventCreatedAt
     FROM cheki_entry ce
     JOIN event e ON e.id = ce.event_id
     JOIN cheki_type ct ON ct.id = ce.cheki_type_id
     LEFT JOIN venue v ON v.id = e.venue_id AND v.deleted_at IS NULL
     WHERE ce.idol_id = ? AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       ${year !== 'all' ? `AND substr(e.event_date,1,4) = ?` : ''}
       ${month !== 'all' ? `AND substr(e.event_date,6,2) = ?` : ''}
       ${args.cursor && decodeCursor(args.cursor)?.length === 3 ? `AND ((e.event_date ${cmp} ?) OR (e.event_date ${eq} ? AND e.created_at ${cmp} ?) OR (e.event_date ${eq} ? AND e.created_at ${eq} ? AND e.id ${cmp} ?))` : ''}
     ORDER BY e.event_date ${isAsc ? 'ASC' : 'DESC'}, e.created_at ${isAsc ? 'ASC' : 'DESC'}, e.id ${isAsc ? 'ASC' : 'DESC'}, ce.created_at, ce.id
     LIMIT ?`,
    ...(() => {
      const p: unknown[] = [idolId];
      if (year !== 'all') p.push(year);
      if (month !== 'all') p.push(month);
      if (args.cursor) {
        const dec = decodeCursor(args.cursor);
        if (dec && dec.length === 3) {
          const [eventDate, createdAt, eventId] = dec as [string, string, string];
          p.push(eventDate, eventDate, createdAt, eventDate, createdAt, eventId);
        }
      }
      p.push(fetchLimit * 5); // over-fetch entries to cover grouping; will trim to distinct limit later
      return p;
    })(),
  );

  // Group rawRows into events, counting distinct
  const events = new Map<string, IdolDetailHistoryRow>();
  const typeIndexes = new Map<string, Map<string, IdolChekiTypeLine>>();
  const orderedEventIds: string[] = [];
  const eventMeta = new Map<string, { eventDate: string; eventCreatedAt: string }>();

  for (const row of rawRows) {
    if (!events.has(row.eventId) && orderedEventIds.length >= fetchLimit) break;
    let event = events.get(row.eventId);
    if (!event) {
      if (orderedEventIds.length >= fetchLimit) continue;
      event = {
        id: row.eventId,
        title: row.title,
        eventDate: row.eventDate,
        country: row.country,
        venueName: row.venueName ?? null,
        venueRegion: row.venueRegion ?? null,
        chekiCount: 0,
        chekiTotals: emptyMoneyTotals(),
        types: [],
      };
      events.set(row.eventId, event);
      typeIndexes.set(row.eventId, new Map());
      orderedEventIds.push(row.eventId);
      eventMeta.set(row.eventId, { eventDate: row.eventDate, eventCreatedAt: row.eventCreatedAt });
    }
    event.chekiCount += row.quantity;
    event.chekiTotals[row.currency] += row.subtotal;
    const typeKey = `${row.chekiTypeId}:${row.currency}:${row.unitPrice}`;
    const typeIndex = typeIndexes.get(row.eventId)!;
    const current = typeIndex.get(typeKey);
    if (current) {
      current.quantity += row.quantity;
      current.subtotal += row.subtotal;
    } else {
      const line: IdolChekiTypeLine = {
        chekiTypeId: row.chekiTypeId,
        label: row.chekiTypeLabel,
        currency: row.currency,
        unitPrice: row.unitPrice,
        quantity: row.quantity,
        subtotal: row.subtotal,
      };
      typeIndex.set(typeKey, line);
      event.types.push(line);
    }
  }

  const hasMore = orderedEventIds.length > limit;
  const pageIds = hasMore ? orderedEventIds.slice(0, limit) : orderedEventIds;
  const rows = pageIds.map((id) => events.get(id)!);
  const nextCursor = hasMore
    ? (() => {
        const lastId = pageIds[pageIds.length - 1];
        const meta = eventMeta.get(lastId)!;
        return encodeCursor([meta.eventDate, meta.eventCreatedAt, lastId]);
      })()
    : null;

  return { rows, nextCursor, hasMore };
}

/**
 * Returns event history scoped to one idol. Event expenses are intentionally
 * excluded because they belong to the event, while this detail screen reports
 * only this idol's Cheki spending.
 */
export function getIdolDetailHistory(db: SqliteLike, idolId: string): IdolDetailHistoryRow[] {
  const rows = db.getAllSync<IdolEntryHistoryRow>(
    `SELECT e.id AS eventId, e.title, e.event_date AS eventDate, e.country,
      v.name AS venueName, v.region AS venueRegion,
      ce.cheki_type_id AS chekiTypeId,
      COALESCE(ce.cheki_type_label_snapshot, ct.label) AS chekiTypeLabel,
      ce.currency, ce.unit_price AS unitPrice, ce.quantity, ce.subtotal
     FROM cheki_entry ce
     JOIN event e ON e.id = ce.event_id
     JOIN cheki_type ct ON ct.id = ce.cheki_type_id
     LEFT JOIN venue v ON v.id = e.venue_id AND v.deleted_at IS NULL
     WHERE ce.idol_id = ? AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
     ORDER BY e.event_date DESC, e.created_at DESC, ce.created_at, ce.id`,
    idolId,
  );

  const events = new Map<string, IdolDetailHistoryRow>();
  const typeIndexes = new Map<string, Map<string, IdolChekiTypeLine>>();

  for (const row of rows) {
    let event = events.get(row.eventId);
    if (!event) {
      event = {
        id: row.eventId,
        title: row.title,
        eventDate: row.eventDate,
        country: row.country,
        venueName: row.venueName ?? null,
        venueRegion: row.venueRegion ?? null,
        chekiCount: 0,
        chekiTotals: emptyMoneyTotals(),
        types: [],
      };
      events.set(row.eventId, event);
      typeIndexes.set(row.eventId, new Map());
    }

    event.chekiCount += row.quantity;
    event.chekiTotals[row.currency] += row.subtotal;

    const typeKey = `${row.chekiTypeId}:${row.currency}:${row.unitPrice}`;
    const typeIndex = typeIndexes.get(row.eventId)!;
    const current = typeIndex.get(typeKey);
    if (current) {
      current.quantity += row.quantity;
      current.subtotal += row.subtotal;
    } else {
      const line: IdolChekiTypeLine = {
        chekiTypeId: row.chekiTypeId,
        label: row.chekiTypeLabel,
        currency: row.currency,
        unitPrice: row.unitPrice,
        quantity: row.quantity,
        subtotal: row.subtotal,
      };
      typeIndex.set(typeKey, line);
      event.types.push(line);
    }
  }

  return [...events.values()];
}

export function summarizeChekiTypes(history: IdolDetailHistoryRow[]): IdolChekiTypeLine[] {
  const result = new Map<string, IdolChekiTypeLine>();
  for (const event of history) {
    for (const line of event.types) {
      const key = `${line.chekiTypeId}:${line.currency}:${line.unitPrice}`;
      const current = result.get(key);
      if (current) {
        current.quantity += line.quantity;
        current.subtotal += line.subtotal;
      } else {
        result.set(key, { ...line });
      }
    }
  }
  return [...result.values()].sort((a, b) => a.label.localeCompare(b.label));
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buildSixMonthChekiSeries(
  history: Pick<IdolDetailHistoryRow, 'eventDate' | 'chekiCount'>[],
  referenceDate: string,
): { key: string; label: string; count: number }[] {
  const [referenceYear, referenceMonth] = referenceDate.split('-').map(Number);
  const totals = new Map<string, number>();
  for (const event of history) {
    const key = event.eventDate.slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + event.chekiCount);
  }

  return Array.from({ length: 6 }, (_, index) => {
    const offset = index - 5;
    const date = new Date(referenceYear, referenceMonth - 1 + offset, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return { key, label: SHORT_MONTHS[month - 1], count: totals.get(key) ?? 0 };
  });
}

export interface AlbumFilterState {
  kind: AlbumFilterKind;
  month: 'all' | string;
  year: 'all' | string;
  order: DetailSortOrder;
}

export interface AlbumDateGroup {
  date: string;
  items: AlbumMediaRow[];
}

export const INSTAX_CARD_ASPECT_RATIOS: Record<StoredInstaxPreset, { portrait: number; landscape: number }> = {
  mini: { portrait: 54 / 86, landscape: 86 / 54 },
  square: { portrait: 72 / 86, landscape: 86 / 72 },
  wide: { portrait: 86 / 108, landscape: 108 / 86 },
};

export function albumMediaAspectRatio(item: Pick<AlbumMediaRow, 'source' | 'width' | 'height' | 'instaxPreset'>): number {
  if (item.source === 'direct') return 1;
  const preset = item.instaxPreset ?? 'mini';
  const orientation = item.width != null && item.height != null && item.width >= item.height ? 'landscape' : 'portrait';
  return INSTAX_CARD_ASPECT_RATIOS[preset][orientation];
}

export function calculateAlbumTileHeight(gridWidth: number): number {
  const FIGMA_GRID_GAP = 3;
  const baseHeight = ((Math.max(0, gridWidth) - FIGMA_GRID_GAP) / 4) * 1.5;
  return Math.min(144, Math.max(96, Math.round(baseHeight)));
}

export function filterAndGroupAlbumMedia(
  items: AlbumMediaRow[],
  filter: AlbumFilterState,
): AlbumDateGroup[] {
  const filtered = items.filter((item) => {
    const date = item.createdAt.slice(0, 10);
    if (filter.year !== 'all' && date.slice(0, 4) !== filter.year) return false;
    if (filter.month !== 'all' && date.slice(5, 7) !== filter.month) return false;
    if (filter.kind === 'cheki') return item.source === 'cheki';
    if (filter.kind === 'photo') return item.source === 'direct' && item.kind === 'photo';
    if (filter.kind === 'video') return item.source === 'direct' && item.kind === 'video';
    return true;
  });

  filtered.sort((a, b) => {
    const comparison = a.createdAt.localeCompare(b.createdAt);
    return filter.order === 'newest' ? -comparison : comparison;
  });

  const groups = new Map<string, AlbumMediaRow[]>();
  for (const item of filtered) {
    const date = item.createdAt.slice(0, 10);
    const group = groups.get(date) ?? [];
    group.push(item);
    groups.set(date, group);
  }
  return [...groups.entries()].map(([date, groupItems]) => ({ date, items: groupItems }));
}

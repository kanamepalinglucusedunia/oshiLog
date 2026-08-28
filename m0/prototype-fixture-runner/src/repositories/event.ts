import type { SqliteLike } from '@/db/types';
import { withSavepointSync } from '@/db/transaction';
import type { ChekiEntry, CountryCode, CurrencyCode, Event, MediaAsset, StoredInstaxPreset } from '@/types/domain';
import { nowUTCISO } from '@/utils/date';
import { uuid } from '@/utils/id';
import { emptyMoneyTotals } from '@/utils/money';
import { cachedQuery, invalidateQueries } from '@/utils/queryCache';
import { clampLimit, decodeCursor, encodeCursor, type PageCursor } from './cursor';
import type { EventSort } from '@/services/mainListSort';

export interface ChekiEntryInput {
  /** Existing identity used by edit reconciliation; omit for a new entry. */
  id?: string;
  idolId: string;
  groupMembershipId?: string | null;
  chekiTypeId: string;
  quantity: number;
  currency: CurrencyCode;
  unitPrice: number;
  photos?: { mediaAssetId: string }[];
}

export interface EventInput {
  title: string;
  eventDate: string;
  country: CountryCode;
  venueId?: string | null;
  tripId?: string | null;
  ticketCurrency?: CurrencyCode | null;
  ticketAmount?: number | null;
  drinkCurrency?: CurrencyCode | null;
  drinkAmount?: number | null;
  notes?: string | null;
  entries?: ChekiEntryInput[];
}

const EVENT_COLS = `
  e.id, e.title, e.event_date AS eventDate, e.country, e.venue_id AS venueId, e.trip_id AS tripId,
  e.ticket_currency AS ticketCurrency, e.ticket_amount AS ticketAmount, e.drink_currency AS drinkCurrency,
  e.drink_amount AS drinkAmount, e.notes,
  e.schema_version AS schemaVersion, e.created_at AS createdAt, e.updated_at AS updatedAt, e.deleted_at AS deletedAt
`;

const ENTRY_JOINED_COLS = `
  ce.id, ce.event_id AS eventId, ce.idol_id AS idolId, ce.group_membership_id AS groupMembershipId,
  ce.cheki_type_id AS chekiTypeId, ce.quantity, ce.currency, ce.unit_price AS unitPrice, ce.subtotal,
  ce.idol_name_snapshot AS idolNameSnapshot, ce.group_name_snapshot AS groupNameSnapshot,
  ce.cheki_type_label_snapshot AS chekiTypeLabelSnapshot,
  ce.schema_version AS schemaVersion, ce.created_at AS createdAt, ce.updated_at AS updatedAt, ce.deleted_at AS deletedAt,
  COALESCE(ce.idol_name_snapshot, gm.name, i.name) AS idolName,
  i.photo_media_id AS idolPhotoMediaId,
  COALESCE(ce.cheki_type_label_snapshot, ct.label) AS chekiTypeLabel,
  COALESCE(ce.group_name_snapshot, g.name) AS groupName,
  (SELECT COUNT(*) FROM cheki_entry_media cem WHERE cem.cheki_entry_id = ce.id) AS photoCount
`;

export interface ChekiEntryJoined extends ChekiEntry {
  idolName: string;
  idolPhotoMediaId: string | null;
  chekiTypeLabel: string;
  groupName: string | null;
  photoCount: number;
}

const MEDIA_COLS = `
  ma.id, ma.kind, ma.content_hash AS contentHash, ma.mime_type AS mimeType, ma.file_size AS fileSize,
  ma.width, ma.height, ma.duration_ms AS durationMs, ma.local_path AS localPath, ma.thumbnail_path AS thumbnailPath,
  ma.instax_preset AS instaxPreset,
  ma.schema_version AS schemaVersion, ma.created_at AS createdAt, ma.updated_at AS updatedAt, ma.deleted_at AS deletedAt
`;

export interface AlbumMediaRow extends MediaAsset {
  source: 'cheki' | 'direct';
  entryId: string | null;
  position: number;
  idolNameSnapshot: string | null;
  groupNameSnapshot: string | null;
}

export interface EventListRow extends Event {
  chekiCount: number;
  chekiTotals: Record<CurrencyCode, number>;
  venueName?: string | null;
  venueRegion?: string | null;
}

export interface EventFilters {
  q?: string;
  year?: string; // 'all' or YYYY
  month?: string; // 'all' or MM
  country?: string; // 'all' or CC
  region?: string; // 'all' or region name
  tripPresence?: 'all' | 'with-trip' | 'without-trip';
}

export interface EventPageArgs {
  filters?: EventFilters;
  sort?: EventSort;
  limit?: number;
  cursor?: PageCursor;
}

export interface EventPageResult {
  rows: EventListRow[];
  nextCursor: PageCursor;
  hasMore: boolean;
}

export function createEventRepo(db: SqliteLike) {
  function listEvents(): Event[] {
    return cachedQuery(db, 'event:list', () => {
      const rows = db.getAllSync<Event>(
        `SELECT ${EVENT_COLS} FROM event e WHERE e.deleted_at IS NULL ORDER BY e.event_date DESC, e.created_at DESC`,
      );
      return rows.map((r) => r as Event);
    });
  }

  /**
   * Batched list for the Events tab: event rows joined with per-event cheki
   * summary in one query instead of one query per row.
   */
  function listEventsWithSummary(): EventListRow[] {
    return cachedQuery(db, 'event:listSummary', () => {
      const rows = db.getAllSync<Event & { venueName: string | null; venueRegion: string | null }>(
        `SELECT ${EVENT_COLS}, v.name AS venueName, v.region AS venueRegion
         FROM event e
         LEFT JOIN venue v ON v.id = e.venue_id
         WHERE e.deleted_at IS NULL
         ORDER BY e.event_date DESC, e.created_at DESC`,
      );
      const summaries = db.getAllSync<{
        eventId: string;
        currency: CurrencyCode;
        chekiCount: number;
        chekiTotal: number;
      }>(
        `SELECT ce.event_id AS eventId, ce.currency,
          COALESCE(SUM(ce.quantity), 0) AS chekiCount,
          COALESCE(SUM(ce.subtotal), 0) AS chekiTotal
         FROM cheki_entry ce
         JOIN event e ON e.id = ce.event_id
         WHERE ce.deleted_at IS NULL AND e.deleted_at IS NULL
         GROUP BY ce.event_id, ce.currency`,
      );
      const byEvent = new Map<string, { chekiCount: number; chekiTotals: Record<CurrencyCode, number> }>();
      for (const summary of summaries) {
        const current = byEvent.get(summary.eventId) ?? { chekiCount: 0, chekiTotals: emptyMoneyTotals() };
        current.chekiCount += summary.chekiCount;
        current.chekiTotals[summary.currency] += summary.chekiTotal;
        byEvent.set(summary.eventId, current);
      }
      return rows.map((row) => ({
        ...row,
        ...(byEvent.get(row.id) ?? { chekiCount: 0, chekiTotals: emptyMoneyTotals() }),
      }));
    });
  }

  // --- Paginated M4 helpers ---

  function buildEventFilterWhere(filters: EventFilters = {}): { clause: string; params: unknown[] } {
    const parts: string[] = ['e.deleted_at IS NULL'];
    const params: unknown[] = [];
    const q = (filters.q ?? '').trim();
    if (q) {
      parts.push(`(instr(lower(e.title), lower(?)) > 0 OR instr(lower(e.country), lower(?)) > 0 OR instr(lower(COALESCE(v.region,'')), lower(?)) > 0)`);
      params.push(q, q, q);
    }
    const year = filters.year ?? 'all';
    const month = filters.month ?? 'all';
    if (year !== 'all') {
      parts.push(`substr(e.event_date,1,4) = ?`);
      params.push(year);
    }
    if (month !== 'all') {
      parts.push(`substr(e.event_date,6,2) = ?`);
      params.push(month);
    }
    const country = filters.country ?? 'all';
    if (country !== 'all') {
      parts.push(`e.country = ?`);
      params.push(country);
    }
    const region = filters.region ?? 'all';
    if (region !== 'all') {
      parts.push(`v.region = ?`);
      params.push(region);
    }
    const tripPresence = filters.tripPresence ?? 'all';
    if (tripPresence === 'with-trip') parts.push(`e.trip_id IS NOT NULL`);
    else if (tripPresence === 'without-trip') parts.push(`e.trip_id IS NULL`);
    return { clause: parts.join(' AND '), params };
  }

  function eventOrderBy(sort: EventSort = 'date-desc'): string {
    switch (sort) {
      case 'date-asc':
        return `ORDER BY e.event_date ASC, e.created_at ASC, e.id ASC`;
      case 'cheki-asc':
        return `ORDER BY chekiCount ASC, e.event_date ASC, e.id ASC`;
      case 'cheki-desc':
        return `ORDER BY chekiCount DESC, e.event_date DESC, e.id DESC`;
      case 'recently-added':
        return `ORDER BY e.created_at DESC, e.id DESC`;
      case 'recently-added-asc':
        return `ORDER BY e.created_at ASC, e.id ASC`;
      case 'date-desc':
      default:
        return `ORDER BY e.event_date DESC, e.created_at DESC, e.id DESC`;
    }
  }

  function appendEventCursorPredicate(
    sort: EventSort,
    cursor: PageCursor,
    parts: string[],
    params: unknown[],
  ): void {
    if (!cursor) return;
    const decoded = decodeCursor(cursor);
    if (!decoded) return;
    const isAsc = sort.endsWith('-asc');
    const cmp = isAsc ? '>' : '<';
    const eq = '=';
    if (sort === 'date-asc' || sort === 'date-desc') {
      if (decoded.length !== 3) return;
      const [eventDate, createdAt, id] = decoded as [string, string, string];
      parts.push(`((e.event_date ${cmp} ?) OR (e.event_date ${eq} ? AND e.created_at ${cmp} ?) OR (e.event_date ${eq} ? AND e.created_at ${eq} ? AND e.id ${cmp} ?))`);
      params.push(eventDate, eventDate, createdAt, eventDate, createdAt, id);
    } else if (sort === 'cheki-asc' || sort === 'cheki-desc') {
      if (decoded.length !== 3) return;
      const [chekiCount, eventDate, id] = decoded as [number, string, string];
      const chekiExpr = `COALESCE((SELECT SUM(ce2.quantity) FROM cheki_entry ce2 WHERE ce2.event_id = e.id AND ce2.deleted_at IS NULL), 0)`;
      parts.push(`((${chekiExpr} ${cmp} ?) OR (${chekiExpr} ${eq} ? AND e.event_date ${cmp} ?) OR (${chekiExpr} ${eq} ? AND e.event_date ${eq} ? AND e.id ${cmp} ?))`);
      params.push(chekiCount, chekiCount, eventDate, chekiCount, eventDate, id);
    } else if (sort === 'recently-added' || sort === 'recently-added-asc') {
      if (decoded.length !== 2) return;
      const [createdAt, id] = decoded as [string, string];
      parts.push(`((e.created_at ${cmp} ?) OR (e.created_at ${eq} ? AND e.id ${cmp} ?))`);
      params.push(createdAt, createdAt, id);
    }
  }

  function encodeEventCursor(sort: EventSort, row: { eventDate: string; createdAt: string; id: string; chekiCount?: number }): string {
    if (sort === 'cheki-asc' || sort === 'cheki-desc') {
      return encodeCursor([row.chekiCount ?? 0, row.eventDate, row.id]);
    }
    if (sort === 'recently-added' || sort === 'recently-added-asc') {
      return encodeCursor([row.createdAt, row.id]);
    }
    return encodeCursor([row.eventDate, row.createdAt, row.id]);
  }

  function countEvents(filters: EventFilters = {}): number {
    const { clause, params } = buildEventFilterWhere(filters);
    const row = db.getFirstSync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM event e LEFT JOIN venue v ON v.id = e.venue_id WHERE ${clause}`,
      ...params,
    );
    return row?.c ?? 0;
  }

  function listEventFilterMeta(): { years: string[]; countries: string[]; regions: string[] } {
    const yearRows = db.getAllSync<{ year: string }>(`SELECT DISTINCT substr(event_date,1,4) AS year FROM event WHERE deleted_at IS NULL ORDER BY year DESC`);
    const countryRows = db.getAllSync<{ country: string }>(`SELECT DISTINCT country FROM event WHERE deleted_at IS NULL ORDER BY country`);
    const regionRows = db.getAllSync<{ region: string }>(
      `SELECT DISTINCT v.region AS region FROM event e JOIN venue v ON v.id = e.venue_id WHERE e.deleted_at IS NULL AND v.region IS NOT NULL AND v.region != '' ORDER BY v.region`,
    );
    return {
      years: yearRows.map((r) => r.year),
      countries: countryRows.map((r) => r.country),
      regions: regionRows.map((r) => r.region),
    };
  }

  function listEventsPage(args: EventPageArgs = {}): EventPageResult {
    const sort: EventSort = args.sort ?? 'date-desc';
    const limit = clampLimit(args.limit);
    const filters = args.filters ?? {};
    const { clause: baseClause, params: baseParams } = buildEventFilterWhere(filters);
    const whereParts: string[] = [baseClause];
    const whereParams: unknown[] = [...baseParams];
    appendEventCursorPredicate(sort, args.cursor ?? null, whereParts, whereParams);
    const whereClause = whereParts.join(' AND ');
    const orderBy = eventOrderBy(sort);
    const fetchLimit = limit + 1;

    const needsCheki = sort === 'cheki-asc' || sort === 'cheki-desc';
    const chekiSelect = needsCheki
      ? `, COALESCE((SELECT SUM(ce2.quantity) FROM cheki_entry ce2 WHERE ce2.event_id = e.id AND ce2.deleted_at IS NULL), 0) AS chekiCount`
      : `, COALESCE((SELECT SUM(ce2.quantity) FROM cheki_entry ce2 WHERE ce2.event_id = e.id AND ce2.deleted_at IS NULL), 0) AS chekiCount`;

    const rows = db.getAllSync<Event & { venueName: string | null; venueRegion: string | null; chekiCount: number }>(
      `SELECT ${EVENT_COLS}, v.name AS venueName, v.region AS venueRegion${chekiSelect}
       FROM event e LEFT JOIN venue v ON v.id = e.venue_id
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
      ...whereParams,
      fetchLimit,
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeEventCursor(sort, {
          eventDate: pageRows[pageRows.length - 1].eventDate,
          createdAt: pageRows[pageRows.length - 1].createdAt,
          id: pageRows[pageRows.length - 1].id,
          chekiCount: (pageRows[pageRows.length - 1] as unknown as { chekiCount: number }).chekiCount,
        })
      : null;

    if (pageRows.length === 0) return { rows: [], nextCursor: null, hasMore: false };

    const ids = pageRows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const summaries = ids.length
      ? db.getAllSync<{ eventId: string; currency: CurrencyCode; chekiCount: number; chekiTotal: number }>(
          `SELECT ce.event_id AS eventId, ce.currency,
            COALESCE(SUM(ce.quantity), 0) AS chekiCount,
            COALESCE(SUM(ce.subtotal), 0) AS chekiTotal
           FROM cheki_entry ce
           JOIN event e ON e.id = ce.event_id
           WHERE ce.deleted_at IS NULL AND e.deleted_at IS NULL AND ce.event_id IN (${placeholders})
           GROUP BY ce.event_id, ce.currency`,
          ...ids,
        )
      : [];
    const byEvent = new Map<string, { chekiCount: number; chekiTotals: Record<CurrencyCode, number> }>();
    for (const s of summaries) {
      const cur = byEvent.get(s.eventId) ?? { chekiCount: 0, chekiTotals: emptyMoneyTotals() };
      cur.chekiCount += s.chekiCount;
      cur.chekiTotals[s.currency] += s.chekiTotal;
      byEvent.set(s.eventId, cur);
    }

    const resultRows: EventListRow[] = pageRows.map((r) => ({
      ...(r as Event),
      venueName: (r as unknown as { venueName: string | null }).venueName ?? null,
      venueRegion: (r as unknown as { venueRegion: string | null }).venueRegion ?? null,
      chekiCount: (r as unknown as { chekiCount: number }).chekiCount ?? 0,
      chekiTotals: byEvent.get(r.id)?.chekiTotals ?? emptyMoneyTotals(),
    }));

    return { rows: resultRows, nextCursor, hasMore };
  }

  function getEvent(id: string): Event | null {
    const row = db.getFirstSync<Event>(`SELECT ${EVENT_COLS} FROM event e WHERE e.id = ? AND e.deleted_at IS NULL`, id);
    return row ? (row as Event) : null;
  }

  function getEventJoined(id: string): (Event & { venueName: string | null; venueRegion: string | null; tripTitle: string | null }) | null {
    const row = db.getFirstSync<Event & { venueName: string | null; venueRegion: string | null; tripTitle: string | null }>(
      `SELECT ${EVENT_COLS.replace('e.', 'e.')}, v.name AS venueName, v.region AS venueRegion, t.title AS tripTitle
       FROM event e LEFT JOIN venue v ON v.id = e.venue_id AND v.deleted_at IS NULL
       LEFT JOIN trip t ON t.id = e.trip_id AND t.deleted_at IS NULL
       WHERE e.id = ? AND e.deleted_at IS NULL`,
      id,
    );
    return row ?? null;
  }

  function createEvent(input: EventInput): Event {
    const now = nowUTCISO();
    const id = uuid();
    withSavepointSync(db, () => {
      db.runSync(
        `INSERT INTO event (id, title, event_date, country, venue_id, trip_id, ticket_currency, ticket_amount,
          drink_currency, drink_amount, notes, schema_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        id,
        input.title,
        input.eventDate,
        input.country,
        input.venueId ?? null,
        input.tripId ?? null,
        input.ticketCurrency ?? null,
        input.ticketAmount ?? null,
        input.drinkCurrency ?? null,
        input.drinkAmount ?? null,
        input.notes ?? null,
        now,
        now,
      );
      insertEntries(db, id, input.eventDate, input.entries ?? []);
    });
    invalidateQueries(db);
    return getEvent(id)!;
  }

  function updateEvent(id: string, input: Partial<EventInput>): Event {
    const current = getEvent(id);
    if (!current) throw new Error(`Event not found: ${id}`);
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      db.runSync(
        `UPDATE event SET title = ?, event_date = ?, country = ?, venue_id = ?, trip_id = ?,
          ticket_currency = ?, ticket_amount = ?, drink_currency = ?, drink_amount = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        input.title ?? current.title,
        input.eventDate ?? current.eventDate,
        input.country ?? current.country,
        input.venueId !== undefined ? input.venueId : current.venueId,
        input.tripId !== undefined ? input.tripId : current.tripId,
        input.ticketCurrency !== undefined ? input.ticketCurrency : current.ticketCurrency,
        input.ticketAmount !== undefined ? input.ticketAmount : current.ticketAmount,
        input.drinkCurrency !== undefined ? input.drinkCurrency : current.drinkCurrency,
        input.drinkAmount !== undefined ? input.drinkAmount : current.drinkAmount,
        input.notes !== undefined ? input.notes : current.notes,
        now,
        id,
      );
      if (input.entries !== undefined) {
        reconcileEntries(db, id, input.eventDate ?? current.eventDate, input.entries, now);
      }
    });
    invalidateQueries(db);
    return getEvent(id)!;
  }

  function resolveEntryDisplay(
    db: SqliteLike,
    eventDate: string,
    entry: ChekiEntryInput,
  ): { idolName: string; groupName: string | null; chekiTypeLabel: string } {
    const display = db.getFirstSync<{ idolName: string; groupName: string | null; chekiTypeLabel: string }>(
      `SELECT
        COALESCE(
          (SELECT history.name FROM idol_name_history history
           WHERE history.idol_id = i.id AND history.deleted_at IS NULL
             AND substr(history.effective_at, 1, 10) <= ?
             AND (history.group_membership_id = ? OR history.group_membership_id IS NULL)
           ORDER BY CASE WHEN history.group_membership_id = ? THEN 0 ELSE 1 END,
             history.effective_at DESC, history.created_at DESC LIMIT 1),
          gm.name,
          i.name
        ) AS idolName,
        g.name AS groupName,
        ct.label AS chekiTypeLabel
       FROM idol i
       JOIN cheki_type ct ON ct.id = ?
       LEFT JOIN group_membership gm ON gm.id = ?
       LEFT JOIN groups g ON g.id = gm.group_id
       WHERE i.id = ?`,
      eventDate,
      entry.groupMembershipId ?? null,
      entry.groupMembershipId ?? null,
      entry.chekiTypeId,
      entry.groupMembershipId ?? null,
      entry.idolId,
    );
    if (!display) throw new Error(`Cannot resolve Cheki Entry display snapshot for Idol ${entry.idolId}`);
    return display;
  }

  function insertEntries(db: SqliteLike, eventId: string, eventDate: string, entries: ChekiEntryInput[]): string[] {
    const now = nowUTCISO();
    const insertedIds: string[] = [];
    for (const entry of entries) {
      const entryId = entry.id ?? uuid();
      const display = resolveEntryDisplay(db, eventDate, entry);
      db.runSync(
        `INSERT INTO cheki_entry (id, event_id, idol_id, group_membership_id, cheki_type_id, quantity, currency,
          unit_price, subtotal, idol_name_snapshot, group_name_snapshot, cheki_type_label_snapshot,
          schema_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        entryId,
        eventId,
        entry.idolId,
        entry.groupMembershipId ?? null,
        entry.chekiTypeId,
        entry.quantity,
        entry.currency,
        entry.unitPrice,
        entry.quantity * entry.unitPrice,
        display.idolName,
        display.groupName,
        display.chekiTypeLabel,
        now,
        now,
      );
      entry.photos?.forEach((photo, index) => {
        db.runSync(
          `INSERT INTO cheki_entry_media (media_asset_id, cheki_entry_id, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          photo.mediaAssetId,
          entryId,
          index + 1,
          now,
          now,
        );
      });
      insertedIds.push(entryId);
    }
    return insertedIds;
  }

  function reconcileEntries(
    db: SqliteLike,
    eventId: string,
    eventDate: string,
    entries: ChekiEntryInput[],
    now: string,
  ): void {
    const existing = db.getAllSync<{ id: string }>(
      `SELECT id FROM cheki_entry WHERE event_id = ? AND deleted_at IS NULL`,
      eventId,
    );
    const existingIds = new Set(existing.map((row) => row.id));
    const retainedIds = new Set<string>();
    const resolvedEntries: { id: string; input: ChekiEntryInput }[] = [];

    for (const input of entries) {
      if (input.id) {
        if (!existingIds.has(input.id)) {
          throw new Error(`Cheki Entry ${input.id} does not belong to Event ${eventId}`);
        }
        if (retainedIds.has(input.id)) throw new Error(`Duplicate Cheki Entry identity: ${input.id}`);
        const display = resolveEntryDisplay(db, eventDate, input);
        db.runSync(
          `UPDATE cheki_entry SET idol_id = ?, group_membership_id = ?, cheki_type_id = ?, quantity = ?,
            currency = ?, unit_price = ?, subtotal = ?, idol_name_snapshot = ?, group_name_snapshot = ?,
            cheki_type_label_snapshot = ?, updated_at = ?, deleted_at = NULL
           WHERE id = ? AND event_id = ?`,
          input.idolId,
          input.groupMembershipId ?? null,
          input.chekiTypeId,
          input.quantity,
          input.currency,
          input.unitPrice,
          input.quantity * input.unitPrice,
          display.idolName,
          display.groupName,
          display.chekiTypeLabel,
          now,
          input.id,
          eventId,
        );
        retainedIds.add(input.id);
        resolvedEntries.push({ id: input.id, input });
      } else {
        const [newId] = insertEntries(db, eventId, eventDate, [{ ...input, photos: [] }]);
        retainedIds.add(newId);
        resolvedEntries.push({ id: newId, input });
      }
    }

    const removedIds = existing.filter((row) => !retainedIds.has(row.id)).map((row) => row.id);
    const touchedIds = [...existingIds, ...[...retainedIds].filter((id) => !existingIds.has(id))];
    const oldMediaIds = touchedIds.length === 0
      ? []
      : db.getAllSync<{ mediaAssetId: string }>(
          `SELECT media_asset_id AS mediaAssetId FROM cheki_entry_media
           WHERE cheki_entry_id IN (${touchedIds.map(() => '?').join(',')})`,
          ...touchedIds,
        ).map((row) => row.mediaAssetId);

    if (touchedIds.length > 0) {
      db.runSync(
        `DELETE FROM cheki_entry_media WHERE cheki_entry_id IN (${touchedIds.map(() => '?').join(',')})`,
        ...touchedIds,
      );
    }
    if (removedIds.length > 0) {
      db.runSync(
        `UPDATE cheki_entry SET deleted_at = ?, updated_at = ? WHERE id IN (${removedIds.map(() => '?').join(',')})`,
        now,
        now,
        ...removedIds,
      );
    }

    const assignedMedia = new Set<string>();
    for (const resolved of resolvedEntries) {
      for (const [index, photo] of (resolved.input.photos ?? []).entries()) {
        if (assignedMedia.has(photo.mediaAssetId)) {
          throw new Error(`Media asset is assigned more than once: ${photo.mediaAssetId}`);
        }
        assignedMedia.add(photo.mediaAssetId);
        db.runSync(
          `INSERT INTO cheki_entry_media (media_asset_id, cheki_entry_id, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          photo.mediaAssetId,
          resolved.id,
          index + 1,
          now,
          now,
        );
      }
    }

    for (const mediaId of new Set(oldMediaIds.filter((id) => !assignedMedia.has(id)))) {
      tombstoneMediaIfUnreferenced(db, mediaId, now);
    }
  }

  function tombstoneMediaIfUnreferenced(db: SqliteLike, mediaId: string, now: string): void {
    const referenced = db.getFirstSync<{ referenced: number }>(
      `SELECT (
        EXISTS(SELECT 1 FROM idol_media WHERE media_asset_id = ?)
        OR EXISTS(SELECT 1 FROM group_media WHERE media_asset_id = ?)
        OR EXISTS(SELECT 1 FROM cheki_entry_media WHERE media_asset_id = ?)
        OR EXISTS(SELECT 1 FROM idol WHERE photo_media_id = ? AND deleted_at IS NULL)
        OR EXISTS(SELECT 1 FROM groups WHERE photo_media_id = ? AND deleted_at IS NULL)
      ) AS referenced`,
      mediaId,
      mediaId,
      mediaId,
      mediaId,
      mediaId,
    );
    if (!referenced?.referenced) {
      db.runSync(`UPDATE media_asset SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, mediaId);
    }
  }

  function deleteEvent(id: string): void {
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      const mediaIds = db.getAllSync<{ mediaAssetId: string }>(
        `SELECT cem.media_asset_id AS mediaAssetId
         FROM cheki_entry_media cem
         JOIN cheki_entry ce ON ce.id = cem.cheki_entry_id
         WHERE ce.event_id = ? AND ce.deleted_at IS NULL`,
        id,
      ).map((row) => row.mediaAssetId);
      db.runSync(`UPDATE event SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id);
      db.runSync(
        `UPDATE cheki_entry SET deleted_at = ?, updated_at = ? WHERE event_id = ? AND deleted_at IS NULL`,
        now,
        now,
        id,
      );
      if (mediaIds.length > 0) {
        db.runSync(
          `DELETE FROM cheki_entry_media WHERE media_asset_id IN (${mediaIds.map(() => '?').join(',')})`,
          ...mediaIds,
        );
        for (const mediaId of mediaIds) tombstoneMediaIfUnreferenced(db, mediaId, now);
      }
    });
    invalidateQueries(db);
  }

  // --- Entries ---

  function listEntries(eventId: string): ChekiEntryJoined[] {
    return db.getAllSync<ChekiEntryJoined>(
      `SELECT ${ENTRY_JOINED_COLS}
       FROM cheki_entry ce
       JOIN idol i ON i.id = ce.idol_id
       JOIN cheki_type ct ON ct.id = ce.cheki_type_id
       LEFT JOIN group_membership gm ON gm.id = ce.group_membership_id
       LEFT JOIN groups g ON g.id = gm.group_id
       WHERE ce.event_id = ? AND ce.deleted_at IS NULL
       ORDER BY ce.created_at`,
      eventId,
    );
  }

  function listEntriesByMembership(membershipId: string): ChekiEntryJoined[] {
    return db.getAllSync<ChekiEntryJoined>(
      `SELECT ${ENTRY_JOINED_COLS}
       FROM cheki_entry ce
       JOIN idol i ON i.id = ce.idol_id
       JOIN cheki_type ct ON ct.id = ce.cheki_type_id
       LEFT JOIN group_membership gm ON gm.id = ce.group_membership_id
       LEFT JOIN groups g ON g.id = gm.group_id
       WHERE ce.group_membership_id = ? AND ce.deleted_at IS NULL
       ORDER BY ce.created_at`,
      membershipId,
    );
  }

  function listEntryIdsByMembership(membershipId: string): string[] {
    const rows = db.getAllSync<{ id: string }>(
      `SELECT ce.id FROM cheki_entry ce WHERE ce.group_membership_id = ? AND ce.deleted_at IS NULL`,
      membershipId,
    );
    return rows.map((r) => r.id);
  }

  function listEntryPhotos(entryId: string): (MediaAsset & { position: number })[] {
    return db.getAllSync<MediaAsset & { position: number }>(
      `SELECT ${MEDIA_COLS.replace(/^ma\./, 'ma.')}, cem.position
       FROM cheki_entry_media cem JOIN media_asset ma ON ma.id = cem.media_asset_id
       WHERE cem.cheki_entry_id = ?
       ORDER BY cem.position`,
      entryId,
    );
  }

  /** Loads every photo relation for an Event in one query for edit-form hydration. */
  function listEntryPhotoIdsByEvent(eventId: string): Map<string, string[]> {
    const rows = db.getAllSync<{ entryId: string; mediaAssetId: string }>(
      `SELECT cem.cheki_entry_id AS entryId, cem.media_asset_id AS mediaAssetId
       FROM cheki_entry_media cem
       JOIN cheki_entry ce ON ce.id = cem.cheki_entry_id
       WHERE ce.event_id = ? AND ce.deleted_at IS NULL
       ORDER BY cem.cheki_entry_id, cem.position`,
      eventId,
    );
    const result = new Map<string, string[]>();
    for (const row of rows) {
      const photos = result.get(row.entryId) ?? [];
      photos.push(row.mediaAssetId);
      result.set(row.entryId, photos);
    }
    return result;
  }

  /**
   * Reindexes photo positions for the given entry so they are 1..N contiguous.
   */
  function reindexEntryPhotos(entryId: string): void {
    const photos = listEntryPhotos(entryId);
    const now = nowUTCISO();
    photos.forEach((photo, index) => {
      db.runSync(
        `UPDATE cheki_entry_media SET position = ?, updated_at = ? WHERE media_asset_id = ?`,
        index + 1,
        now,
        photo.id,
      );
    });
    invalidateQueries(db);
  }

  function deleteEntryPhoto(entryId: string, mediaAssetId: string): void {
    const now = nowUTCISO();
    db.runSync(`DELETE FROM cheki_entry_media WHERE media_asset_id = ? AND cheki_entry_id = ?`, mediaAssetId, entryId);
    db.runSync(`UPDATE media_asset SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, mediaAssetId);
    invalidateQueries(db);
    reindexEntryPhotos(entryId);
  }

  // --- Media relations ---

  function getMediaAsset(id: string): MediaAsset | null {
    const row = db.getFirstSync<MediaAsset>(`SELECT ${MEDIA_COLS} FROM media_asset ma WHERE ma.id = ?`, id);
    return row ?? null;
  }

  function findByContentHash(hash: string, kind: string, fileSize?: number | null): MediaAsset | null {
    const row = db.getFirstSync<MediaAsset>(
      `SELECT ${MEDIA_COLS} FROM media_asset ma
       WHERE ma.content_hash = ? AND ma.kind = ? AND ma.deleted_at IS NULL
         AND (? IS NULL OR ma.file_size = ?)`,
      hash,
      kind,
      fileSize ?? null,
      fileSize ?? null,
    );
    return row ?? null;
  }

  function insertMediaAsset(input: {
    id: string;
    kind: string;
    contentHash: string | null;
    mimeType: string | null;
    fileSize: number | null;
    width: number | null;
    height: number | null;
    durationMs?: number | null;
    localPath: string | null;
    thumbnailPath?: string | null;
    instaxPreset?: StoredInstaxPreset | null;
    /** Overrides the recorded date (album grouping). Defaults to now. */
    createdAt?: string;
  }): MediaAsset {
    const now = nowUTCISO();
    const createdAt = input.createdAt ?? now;
    const instaxPreset = input.instaxPreset ?? (input.kind === 'cheki' ? 'mini' : null);
    db.runSync(
      `INSERT INTO media_asset (id, kind, content_hash, mime_type, file_size, width, height, duration_ms,
        local_path, thumbnail_path, instax_preset, schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      input.id,
      input.kind,
      input.contentHash ?? null,
      input.mimeType ?? null,
      input.fileSize ?? null,
      input.width ?? null,
      input.height ?? null,
      input.durationMs ?? null,
      input.localPath ?? null,
      input.thumbnailPath ?? null,
      instaxPreset,
      createdAt,
      now,
    );
    invalidateQueries(db);
    return getMediaAsset(input.id)!;
  }

  function updateMediaAsset(id: string, patch: { localPath?: string | null; thumbnailPath?: string | null; fileSize?: number | null; createdAt?: string; instaxPreset?: StoredInstaxPreset | null }): MediaAsset {
    const current = getMediaAsset(id);
    if (!current) throw new Error(`Media asset not found: ${id}`);
    const now = nowUTCISO();
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.localPath !== undefined) { sets.push('local_path = ?'); values.push(patch.localPath); }
    if (patch.thumbnailPath !== undefined) { sets.push('thumbnail_path = ?'); values.push(patch.thumbnailPath); }
    if (patch.fileSize !== undefined) { sets.push('file_size = ?'); values.push(patch.fileSize); }
    if (patch.createdAt !== undefined) { sets.push('created_at = ?'); values.push(patch.createdAt); }
    if (patch.instaxPreset !== undefined) { sets.push('instax_preset = ?'); values.push(patch.instaxPreset); }
    if (sets.length === 0) return current;
    db.runSync(
      `UPDATE media_asset SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
      ...values,
      now,
      id,
    );
    invalidateQueries(db);
    return getMediaAsset(id)!;
  }

  function resolveDirectMediaDisplay(idolId: string, date: string): { idolName: string; groupName: string | null } {
    const membership = db.getFirstSync<{ id: string; name: string | null; groupName: string | null }>(
      `SELECT gm.id, gm.name, g.name AS groupName
       FROM group_membership gm
       LEFT JOIN groups g ON g.id = gm.group_id
       WHERE gm.idol_id = ? AND gm.deleted_at IS NULL
         AND gm.start_date <= ? AND (gm.end_date IS NULL OR gm.end_date >= ?)
       ORDER BY gm.is_main DESC, gm.start_date DESC, gm.created_at DESC
       LIMIT 1`,
      idolId,
      date,
      date,
    );
    const history = db.getFirstSync<{ name: string }>(
      `SELECT history.name
       FROM idol_name_history history
       WHERE history.idol_id = ? AND history.deleted_at IS NULL
         AND substr(history.effective_at, 1, 10) <= ?
         AND (history.group_membership_id = ? OR history.group_membership_id IS NULL)
       ORDER BY CASE WHEN history.group_membership_id = ? THEN 0 ELSE 1 END,
         history.effective_at DESC, history.created_at DESC
       LIMIT 1`,
      idolId,
      date,
      membership?.id ?? null,
      membership?.id ?? null,
    );
    const idol = db.getFirstSync<{ name: string }>('SELECT name FROM idol WHERE id = ? AND deleted_at IS NULL', idolId);
    if (!idol) throw new Error(`Idol not found: ${idolId}`);
    return {
      idolName: history?.name ?? membership?.name ?? idol.name,
      groupName: membership?.groupName ?? null,
    };
  }

  function attachMediaToIdol(mediaAssetId: string, idolId: string): void {
    const now = nowUTCISO();
    const asset = getMediaAsset(mediaAssetId);
    if (!asset) throw new Error(`Media asset not found: ${mediaAssetId}`);
    const display = resolveDirectMediaDisplay(idolId, asset.createdAt.slice(0, 10));
    db.runSync(
      `INSERT OR IGNORE INTO idol_media (
        media_asset_id, idol_id, sort_order, idol_name_snapshot, group_name_snapshot, created_at, updated_at
      ) VALUES (?, ?, 0, ?, ?, ?, ?)`,
      mediaAssetId,
      idolId,
      display.idolName,
      display.groupName,
      now,
      now,
    );
    invalidateQueries(db);
  }

  function attachMediaToGroup(mediaAssetId: string, groupId: string): void {
    const now = nowUTCISO();
    db.runSync(
      `INSERT OR IGNORE INTO group_media (media_asset_id, group_id, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`,
      mediaAssetId,
      groupId,
      now,
      now,
    );
    invalidateQueries(db);
  }

  function detachMedia(mediaAssetId: string): void {
    const now = nowUTCISO();
    db.runSync(`DELETE FROM idol_media WHERE media_asset_id = ?`, mediaAssetId);
    db.runSync(`DELETE FROM group_media WHERE media_asset_id = ?`, mediaAssetId);
    db.runSync(`DELETE FROM cheki_entry_media WHERE media_asset_id = ?`, mediaAssetId);
    db.runSync(`UPDATE media_asset SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, mediaAssetId);
    invalidateQueries(db);
  }

  function listIdolAlbumMedia(idolId: string): AlbumMediaRow[] {
    return cachedQuery(db, `media:album:${idolId}`, () => {
      return db.getAllSync<AlbumMediaRow>(
      `SELECT ma.id, ma.kind, ma.content_hash AS contentHash, ma.mime_type AS mimeType, ma.file_size AS fileSize,
        ma.width, ma.height, ma.duration_ms AS durationMs, ma.local_path AS localPath, ma.thumbnail_path AS thumbnailPath,
        ma.instax_preset AS instaxPreset,
        ma.schema_version AS schemaVersion, ma.created_at AS createdAt, ma.updated_at AS updatedAt, ma.deleted_at AS deletedAt,
        'direct' AS source, NULL AS entryId, 0 AS position,
        COALESCE(im.idol_name_snapshot, i.name) AS idolNameSnapshot,
        im.group_name_snapshot AS groupNameSnapshot
       FROM idol_media im
       JOIN media_asset ma ON ma.id = im.media_asset_id
       JOIN idol i ON i.id = im.idol_id
       WHERE im.idol_id = ? AND ma.deleted_at IS NULL
       UNION ALL
       SELECT ma.id, ma.kind, ma.content_hash AS contentHash, ma.mime_type AS mimeType, ma.file_size AS fileSize,
        ma.width, ma.height, ma.duration_ms AS durationMs, ma.local_path AS localPath, ma.thumbnail_path AS thumbnailPath,
        ma.instax_preset AS instaxPreset,
        ma.schema_version AS schemaVersion, ma.created_at AS createdAt, ma.updated_at AS updatedAt, ma.deleted_at AS deletedAt,
        'cheki' AS source, cem.cheki_entry_id AS entryId, cem.position,
        ce.idol_name_snapshot AS idolNameSnapshot,
        ce.group_name_snapshot AS groupNameSnapshot
       FROM cheki_entry ce
       JOIN cheki_entry_media cem ON cem.cheki_entry_id = ce.id
       JOIN media_asset ma ON ma.id = cem.media_asset_id
       WHERE ce.idol_id = ? AND ce.deleted_at IS NULL AND ma.deleted_at IS NULL
       ORDER BY createdAt`,
      idolId,
      idolId,
    );
    });
  }

  type AlbumKind = 'all' | 'cheki' | 'photo' | 'video';
  interface AlbumPageArgs {
    kind?: AlbumKind;
    month?: string;
    year?: string;
    order?: 'newest' | 'oldest';
    limit?: number;
    cursor?: PageCursor;
  }
  interface AlbumPageResult {
    rows: AlbumMediaRow[];
    nextCursor: PageCursor;
    hasMore: boolean;
  }

  function countIdolAlbumMedia(idolId: string, filters: Pick<AlbumPageArgs, 'kind' | 'month' | 'year'> = {}): number {
    const kind = filters.kind ?? 'all';
    const month = filters.month ?? 'all';
    const year = filters.year ?? 'all';
    let total = 0;
    if (kind === 'all' || kind === 'photo' || kind === 'video') {
      const where: string[] = ['im.idol_id = ?', 'ma.deleted_at IS NULL'];
      const params: unknown[] = [idolId];
      if (kind === 'photo' || kind === 'video') { where.push('ma.kind = ?'); params.push(kind); }
      if (year !== 'all') { where.push(`substr(ma.created_at,1,4) = ?`); params.push(year); }
      if (month !== 'all') { where.push(`substr(ma.created_at,6,2) = ?`); params.push(month); }
      const row = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM idol_media im JOIN media_asset ma ON ma.id = im.media_asset_id WHERE ${where.join(' AND ')}`, ...params);
      total += row?.c ?? 0;
    }
    if (kind === 'all' || kind === 'cheki') {
      const where: string[] = ['ce.idol_id = ?', 'ce.deleted_at IS NULL', 'ma.deleted_at IS NULL'];
      const params: unknown[] = [idolId];
      if (year !== 'all') { where.push(`substr(ma.created_at,1,4) = ?`); params.push(year); }
      if (month !== 'all') { where.push(`substr(ma.created_at,6,2) = ?`); params.push(month); }
      const row = db.getFirstSync<{ c: number }>(
        `SELECT COUNT(*) AS c FROM cheki_entry ce JOIN cheki_entry_media cem ON cem.cheki_entry_id = ce.id JOIN media_asset ma ON ma.id = cem.media_asset_id WHERE ${where.join(' AND ')}`,
        ...params,
      );
      total += row?.c ?? 0;
    }
    return total;
  }

  function listIdolAlbumPage(idolId: string, args: AlbumPageArgs = {}): AlbumPageResult {
    const kind = args.kind ?? 'all';
    const month = args.month ?? 'all';
    const year = args.year ?? 'all';
    const order = args.order ?? 'newest';
    const limit = clampLimit(args.limit);
    const isAsc = order === 'oldest';
    const cmp = isAsc ? '>' : '<';
    const eq = '=';
    const fetchLimit = limit + 1;
    const cursorValues = args.cursor ? decodeCursor(args.cursor) : null;
    const cursorCreatedAt = cursorValues && cursorValues.length === 2 ? (cursorValues[0] as string) : null;
    const cursorId = cursorValues && cursorValues.length === 2 ? (cursorValues[1] as string) : null;

    function buildAlbumWhereForDirect(): { clause: string; params: unknown[] } {
      const parts: string[] = ['im.idol_id = ?', 'ma.deleted_at IS NULL'];
      const params: unknown[] = [idolId];
      if (kind === 'photo' || kind === 'video') { parts.push('ma.kind = ?'); params.push(kind); }
      if (year !== 'all') { parts.push('substr(ma.created_at,1,4) = ?'); params.push(year); }
      if (month !== 'all') { parts.push('substr(ma.created_at,6,2) = ?'); params.push(month); }
      if (cursorCreatedAt && cursorId) {
        parts.push(`((ma.created_at ${cmp} ?) OR (ma.created_at ${eq} ? AND ma.id ${cmp} ?))`);
        params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
      }
      return { clause: parts.join(' AND '), params };
    }
    function buildAlbumWhereForCheki(): { clause: string; params: unknown[] } {
      const parts: string[] = ['ce.idol_id = ?', 'ce.deleted_at IS NULL', 'ma.deleted_at IS NULL'];
      const params: unknown[] = [idolId];
      if (year !== 'all') { parts.push('substr(ma.created_at,1,4) = ?'); params.push(year); }
      if (month !== 'all') { parts.push('substr(ma.created_at,6,2) = ?'); params.push(month); }
      if (cursorCreatedAt && cursorId) {
        parts.push(`((ma.created_at ${cmp} ?) OR (ma.created_at ${eq} ? AND ma.id ${cmp} ?))`);
        params.push(cursorCreatedAt, cursorCreatedAt, cursorId);
      }
      return { clause: parts.join(' AND '), params };
    }

    const directOrder = isAsc ? 'ORDER BY ma.created_at ASC, ma.id ASC' : 'ORDER BY ma.created_at DESC, ma.id DESC';
    const chekiOrder = directOrder;

    let candidates: AlbumMediaRow[] = [];

    if (kind === 'all' || kind === 'photo' || kind === 'video') {
      const { clause, params } = buildAlbumWhereForDirect();
      const rows = db.getAllSync<AlbumMediaRow>(
        `SELECT ma.id, ma.kind, ma.content_hash AS contentHash, ma.mime_type AS mimeType, ma.file_size AS fileSize,
          ma.width, ma.height, ma.duration_ms AS durationMs, ma.local_path AS localPath, ma.thumbnail_path AS thumbnailPath,
          ma.instax_preset AS instaxPreset,
          ma.schema_version AS schemaVersion, ma.created_at AS createdAt, ma.updated_at AS updatedAt, ma.deleted_at AS deletedAt,
          'direct' AS source, NULL AS entryId, 0 AS position,
          COALESCE(im.idol_name_snapshot, i.name) AS idolNameSnapshot,
          im.group_name_snapshot AS groupNameSnapshot
         FROM idol_media im
         JOIN media_asset ma ON ma.id = im.media_asset_id
         JOIN idol i ON i.id = im.idol_id
         WHERE ${clause}
         ${directOrder}
         LIMIT ?`,
        ...params,
        fetchLimit,
      );
      candidates.push(...rows);
    }
    if (kind === 'all' || kind === 'cheki') {
      const { clause, params } = buildAlbumWhereForCheki();
      const rows = db.getAllSync<AlbumMediaRow>(
        `SELECT ma.id, ma.kind, ma.content_hash AS contentHash, ma.mime_type AS mimeType, ma.file_size AS fileSize,
          ma.width, ma.height, ma.duration_ms AS durationMs, ma.local_path AS localPath, ma.thumbnail_path AS thumbnailPath,
          ma.instax_preset AS instaxPreset,
          ma.schema_version AS schemaVersion, ma.created_at AS createdAt, ma.updated_at AS updatedAt, ma.deleted_at AS deletedAt,
          'cheki' AS source, cem.cheki_entry_id AS entryId, cem.position,
          ce.idol_name_snapshot AS idolNameSnapshot,
          ce.group_name_snapshot AS groupNameSnapshot
         FROM cheki_entry ce
         JOIN cheki_entry_media cem ON cem.cheki_entry_id = ce.id
         JOIN media_asset ma ON ma.id = cem.media_asset_id
         WHERE ${clause}
         ${chekiOrder}
         LIMIT ?`,
        ...params,
        fetchLimit,
      );
      candidates.push(...rows);
    }

    candidates.sort((a, b) => {
      const c = a.createdAt.localeCompare(b.createdAt);
      if (c !== 0) return isAsc ? c : -c;
      return isAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });

    const hasMore = candidates.length > limit;
    const pageRows = hasMore ? candidates.slice(0, limit) : candidates;
    const nextCursor = hasMore ? encodeCursor([pageRows[pageRows.length - 1].createdAt, pageRows[pageRows.length - 1].id]) : null;
    return { rows: pageRows, nextCursor, hasMore };
  }

  function relinkMedia(assetId: string, localPath: string): MediaAsset {
    const now = nowUTCISO();
    db.runSync(
      `UPDATE media_asset SET local_path = ?, updated_at = ? WHERE id = ?`,
      localPath,
      now,
      assetId,
    );
    invalidateQueries(db);
    return getMediaAsset(assetId)!;
  }

  return {
    listEvents,
    listEventsWithSummary,
    listEventsPage,
    countEvents,
    listEventFilterMeta,
    getEvent,
    getEventJoined,
    createEvent,
    updateEvent,
    deleteEvent,
    listEntries,
    listEntriesByMembership,
    listEntryIdsByMembership,
    listEntryPhotos,
    listEntryPhotoIdsByEvent,
    reindexEntryPhotos,
    deleteEntryPhoto,
    getMediaAsset,
    findByContentHash,
    insertMediaAsset,
    updateMediaAsset,
    listIdolAlbumMedia,
    listIdolAlbumPage,
    countIdolAlbumMedia,
    relinkMedia,
    attachMediaToIdol,
    attachMediaToGroup,
    detachMedia,
  };
}

export type EventRepo = ReturnType<typeof createEventRepo>;

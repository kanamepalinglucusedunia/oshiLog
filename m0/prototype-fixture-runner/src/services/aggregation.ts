import type { SqliteLike } from '@/db/types';
import type { CountryCode, CurrencyCode, Group, Idol, Trip, Venue } from '@/types/domain';
import { todayISO } from '@/utils/date';
import { addAmounts, emptyMoneyTotals, formatMinorUnits } from '@/utils/money';
import { cachedQuery } from '@/utils/queryCache';
import { pickDisplayMembership } from './membership';
import { clampLimit, decodeCursor, encodeCursor, type PageCursor } from '@/repositories/cursor';
import { COUNTRIES } from '@/types/domain';
import type { IdolGroupSort, TripSort, VenueSort } from './mainListSort';

export interface MoneyTotal {
  currency: CurrencyCode;
  amount: number;
  formatted: string;
}

export function totalsToSortedList(totals: Record<CurrencyCode, number>): MoneyTotal[] {
  return (Object.entries(totals) as [CurrencyCode, number][])
    .filter(([, amount]) => amount !== 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([currency, amount]) => ({
      currency,
      amount,
      formatted: formatMinorUnits(amount, currency),
    }));
}

export interface IdolStats {
  chekiCount: number;
  spendTotals: Record<CurrencyCode, number>;
  eventCount: number;
}

export interface GroupStats {
  eventCount: number;
  chekiCount: number;
  spendTotals: Record<CurrencyCode, number>;
}

export type GroupMemberStats = IdolStats;

export interface IdolListRow extends Idol {
  groupName: string | null;
  eventCount: number;
  chekiCount: number;
  spendTotals: Record<CurrencyCode, number>;
}

export interface GroupListRow extends Group {
  eventCount: number;
  chekiCount: number;
  spendTotals: Record<CurrencyCode, number>;
}

export interface VenueStats {
  visitCount: number;
  drinkSpendTotals: Record<CurrencyCode, number>;
}

export interface TripStats {
  eventCount: number;
  chekiCount: number;
  expenseCount: number;
  expenseTotals: Record<CurrencyCode, number>;
  eventTotals: Record<CurrencyCode, number>;
}

export interface HomeStats {
  spendingTotals: Record<CurrencyCode, number>;
  chekiCount: number;
  eventCount: number;
  tripCount: number;
}

const ZERO_TOTALS = emptyMoneyTotals();

export interface TripListRow extends Trip {
  countries: CountryCode[];
  eventCount: number;
  chekiCount: number;
  expenseCount: number;
  eventTotals: Record<CurrencyCode, number>;
}

export interface VenueListRow extends Venue {
  visitCount: number;
  drinkSpendTotals: Record<CurrencyCode, number>;
}

export function createAggregationService(db: SqliteLike) {
  function getIdolStats(idolId: string): IdolStats {
    const counts = db.getFirstSync<{
      chekiCount: number;
      eventCount: number;
    }>(
      `SELECT
        COALESCE(SUM(ce.quantity), 0) AS chekiCount,
        COUNT(DISTINCT ce.event_id) AS eventCount
       FROM cheki_entry ce
       JOIN event e ON e.id = ce.event_id
       WHERE ce.idol_id = ? AND ce.deleted_at IS NULL AND e.deleted_at IS NULL`,
      idolId,
    );
    const chekiSpendRows = db.getAllSync<{ currency: CurrencyCode; amount: number }>(
      `SELECT ce.currency, SUM(ce.subtotal) AS amount
       FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
       WHERE ce.idol_id = ? AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY ce.currency`,
      idolId,
    );
    return {
      chekiCount: counts?.chekiCount ?? 0,
      spendTotals: addAmounts(chekiSpendRows),
      eventCount: counts?.eventCount ?? 0,
    };
  }

  function getIdolSpendByIdolIds(idolIds: string[]): Record<string, Record<CurrencyCode, number>> {
    if (idolIds.length === 0) return {};
    const placeholders = idolIds.map(() => '?').join(',');
    const rows = db.getAllSync<{ idolId: string; spend: number; currency: CurrencyCode }>(
      `SELECT ce.idol_id AS idolId, SUM(ce.subtotal) AS spend, ce.currency
       FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
       WHERE ce.idol_id IN (${placeholders}) AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY ce.idol_id, ce.currency`,
      ...idolIds,
    );
    const result: Record<string, Record<CurrencyCode, number>> = {};
    for (const idolId of idolIds) result[idolId] = { ...ZERO_TOTALS };
    for (const row of rows) {
      result[row.idolId][row.currency] = row.spend;
    }
    return result;
  }

  function getGroupStats(groupId: string): GroupStats {
    const counts = db.getFirstSync<{
      eventCount: number;
      chekiCount: number;
    }>(
      `SELECT
        COUNT(DISTINCT ce.event_id) AS eventCount,
        COALESCE(SUM(ce.quantity), 0) AS chekiCount
       FROM cheki_entry ce
       JOIN group_membership gm ON gm.id = ce.group_membership_id
       JOIN event e ON e.id = ce.event_id
       WHERE gm.group_id = ?
         AND gm.start_date <= e.event_date
         AND (gm.end_date IS NULL OR e.event_date <= gm.end_date)
         AND ce.deleted_at IS NULL AND e.deleted_at IS NULL`,
      groupId,
    );
    const spendRows = db.getAllSync<{ currency: CurrencyCode; amount: number }>(
      `SELECT ce.currency, SUM(ce.subtotal) AS amount
       FROM cheki_entry ce
       JOIN group_membership gm ON gm.id = ce.group_membership_id
       JOIN event e ON e.id = ce.event_id
       WHERE gm.group_id = ?
         AND gm.start_date <= e.event_date
         AND (gm.end_date IS NULL OR e.event_date <= gm.end_date)
         AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY ce.currency`,
      groupId,
    );
    return {
      eventCount: counts?.eventCount ?? 0,
      chekiCount: counts?.chekiCount ?? 0,
      spendTotals: addAmounts(spendRows),
    };
  }

  function getGroupMemberStats(groupId: string): Record<string, GroupMemberStats> {
    const countRows = db.getAllSync<{
      membershipId: string;
      eventCount: number;
      chekiCount: number;
    }>(
      `SELECT ce.group_membership_id AS membershipId,
        COUNT(DISTINCT ce.event_id) AS eventCount,
        COALESCE(SUM(ce.quantity), 0) AS chekiCount
       FROM cheki_entry ce
       JOIN group_membership gm ON gm.id = ce.group_membership_id
       JOIN event e ON e.id = ce.event_id
       WHERE gm.group_id = ? AND gm.deleted_at IS NULL
         AND ce.group_membership_id IS NOT NULL
         AND gm.start_date <= e.event_date
         AND (gm.end_date IS NULL OR e.event_date <= gm.end_date)
         AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY ce.group_membership_id`,
      groupId,
    );
    const spendRows = db.getAllSync<{
      membershipId: string;
      currency: CurrencyCode;
      amount: number;
    }>(
      `SELECT ce.group_membership_id AS membershipId, ce.currency, SUM(ce.subtotal) AS amount
       FROM cheki_entry ce
       JOIN group_membership gm ON gm.id = ce.group_membership_id
       JOIN event e ON e.id = ce.event_id
       WHERE gm.group_id = ? AND gm.deleted_at IS NULL
         AND ce.group_membership_id IS NOT NULL
         AND gm.start_date <= e.event_date
         AND (gm.end_date IS NULL OR e.event_date <= gm.end_date)
         AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY ce.group_membership_id, ce.currency`,
      groupId,
    );

    const result: Record<string, GroupMemberStats> = {};
    for (const row of countRows) {
      result[row.membershipId] = {
        eventCount: row.eventCount,
        chekiCount: row.chekiCount,
        spendTotals: { ...ZERO_TOTALS },
      };
    }
    for (const row of spendRows) {
      const stats = result[row.membershipId] ?? {
        eventCount: 0,
        chekiCount: 0,
        spendTotals: { ...ZERO_TOTALS },
      };
      stats.spendTotals[row.currency] = row.amount;
      result[row.membershipId] = stats;
    }
    return result;
  }

  function getVenueStats(venueId: string): VenueStats {
    const visitCount = db.getFirstSync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM event e WHERE e.venue_id = ? AND e.deleted_at IS NULL`,
      venueId,
    )?.c ?? 0;
    const drinkRows = db.getAllSync<{ currency: CurrencyCode; amount: number }>(
      `SELECT drink_currency AS currency, SUM(drink_amount) AS amount
       FROM event WHERE venue_id = ? AND deleted_at IS NULL AND drink_currency IS NOT NULL AND drink_amount IS NOT NULL
       GROUP BY drink_currency`,
      venueId,
    );
    return { visitCount, drinkSpendTotals: addAmounts(drinkRows) };
  }

  function getTripStats(tripId: string): TripStats {
    const eventAmounts = db.getAllSync<{ currency: CurrencyCode; amount: number }>(
      `SELECT ticket_currency AS currency, ticket_amount AS amount
       FROM event WHERE trip_id = ? AND deleted_at IS NULL AND ticket_currency IS NOT NULL AND ticket_amount IS NOT NULL
       UNION ALL
       SELECT drink_currency AS currency, drink_amount AS amount
       FROM event WHERE trip_id = ? AND deleted_at IS NULL AND drink_currency IS NOT NULL AND drink_amount IS NOT NULL
       UNION ALL
       SELECT ce.currency, SUM(ce.subtotal) AS amount
       FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
       WHERE e.trip_id = ? AND e.deleted_at IS NULL AND ce.deleted_at IS NULL
       GROUP BY ce.currency`,
      tripId,
      tripId,
      tripId,
    );
    const eventTotals = addAmounts(eventAmounts);

    const expenseRows = db.getAllSync<{ currency: string; amount: number }>(
      `SELECT currency, amount FROM trip_expense WHERE trip_id = ? AND deleted_at IS NULL`,
      tripId,
    );
    const expenseTotals = addAmounts(expenseRows.map((r) => ({ amount: r.amount, currency: r.currency as CurrencyCode })));

    const chekiCount = db.getFirstSync<{ c: number }>(
      `SELECT COALESCE(SUM(ce.quantity), 0) AS c
       FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
       WHERE e.trip_id = ? AND ce.deleted_at IS NULL AND e.deleted_at IS NULL`,
      tripId,
    )?.c ?? 0;

    const eventCount = db.getFirstSync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM event e WHERE e.trip_id = ? AND e.deleted_at IS NULL`,
      tripId,
    )?.c ?? 0;

    return {
      eventCount,
      chekiCount,
      expenseCount: expenseRows.length,
      expenseTotals,
      eventTotals,
    };
  }

  function getHomeStats(): HomeStats {
    return cachedQuery(db, 'home:stats', () => {
      const eventAmounts = db.getAllSync<{ currency: CurrencyCode; amount: number }>(
        `SELECT ticket_currency AS currency, ticket_amount AS amount
         FROM event WHERE deleted_at IS NULL AND ticket_currency IS NOT NULL AND ticket_amount IS NOT NULL
         UNION ALL
         SELECT drink_currency AS currency, drink_amount AS amount
         FROM event WHERE deleted_at IS NULL AND drink_currency IS NOT NULL AND drink_amount IS NOT NULL
         UNION ALL
         SELECT ce.currency, SUM(ce.subtotal) AS amount
         FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
         WHERE e.deleted_at IS NULL AND ce.deleted_at IS NULL
         GROUP BY ce.currency`,
      );
      const eventTotals = addAmounts(eventAmounts);

      const expenseRows = db.getAllSync<{ currency: string; amount: number }>(
        `SELECT currency, amount FROM trip_expense WHERE deleted_at IS NULL`,
      );
      const expenseTotals = addAmounts(expenseRows.map((r) => ({ amount: r.amount, currency: r.currency as CurrencyCode })));

      const spendingTotals: Record<CurrencyCode, number> = { ...ZERO_TOTALS };
      for (const currency of Object.keys(ZERO_TOTALS) as CurrencyCode[]) {
        spendingTotals[currency] = eventTotals[currency] + expenseTotals[currency];
      }

      const counts = db.getFirstSync<{ cheki: number; events: number; trips: number }>(
        `SELECT
          (SELECT COALESCE(SUM(ce.quantity), 0) FROM cheki_entry ce JOIN event e ON e.id = ce.event_id WHERE ce.deleted_at IS NULL AND e.deleted_at IS NULL) AS cheki,
          (SELECT COUNT(*) FROM event WHERE deleted_at IS NULL) AS events,
          (SELECT COUNT(*) FROM trip WHERE deleted_at IS NULL) AS trips`,
      );

      return {
        spendingTotals,
        chekiCount: counts?.cheki ?? 0,
        eventCount: counts?.events ?? 0,
        tripCount: counts?.trips ?? 0,
      };
    });
  }

  // --- Batched list stats (one pass for all rows instead of N+1) ---

  function listTripsWithStats(): TripListRow[] {
    return cachedQuery(db, 'trip:listWithStats', () => {
      const trips = db.getAllSync<Trip>(
        `SELECT id, title, start_date AS startDate, end_date AS endDate, description, is_favorite AS isFavorite,
          schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
         FROM trip WHERE deleted_at IS NULL ORDER BY start_date DESC`,
      );

      const countryRows = db.getAllSync<{ tripId: string; country: CountryCode }>(
        `SELECT trip_id AS tripId, country FROM trip_country WHERE deleted_at IS NULL`,
      );
      const countriesByTrip = new Map<string, CountryCode[]>();
      for (const row of countryRows) {
        const list = countriesByTrip.get(row.tripId) ?? [];
        list.push(row.country);
        countriesByTrip.set(row.tripId, list);
      }

      const expenseRows = db.getAllSync<{ tripId: string; currency: string; amount: number }>(
        `SELECT trip_id AS tripId, currency, amount FROM trip_expense WHERE deleted_at IS NULL`,
      );
      const expensesByTrip = new Map<string, { amount: number; currency: CurrencyCode }[]>();
      for (const row of expenseRows) {
        const list = expensesByTrip.get(row.tripId) ?? [];
        list.push({ amount: row.amount, currency: row.currency as CurrencyCode });
        expensesByTrip.set(row.tripId, list);
      }

      const eventCountRows = db.getAllSync<{ tripId: string; eventCount: number; chekiCount: number }>(
        `SELECT e.trip_id AS tripId, COUNT(DISTINCT e.id) AS eventCount, COALESCE(SUM(ce.quantity), 0) AS chekiCount
         FROM event e LEFT JOIN cheki_entry ce ON ce.event_id = e.id AND ce.deleted_at IS NULL
         WHERE e.deleted_at IS NULL AND e.trip_id IS NOT NULL
         GROUP BY e.trip_id`,
      );
      const eventAmountRows = db.getAllSync<{ tripId: string; currency: CurrencyCode; amount: number }>(
        `SELECT trip_id AS tripId, ticket_currency AS currency, SUM(ticket_amount) AS amount
         FROM event WHERE deleted_at IS NULL AND trip_id IS NOT NULL AND ticket_currency IS NOT NULL AND ticket_amount IS NOT NULL
         GROUP BY trip_id, ticket_currency
         UNION ALL
         SELECT trip_id AS tripId, drink_currency AS currency, SUM(drink_amount) AS amount
         FROM event WHERE deleted_at IS NULL AND trip_id IS NOT NULL AND drink_currency IS NOT NULL AND drink_amount IS NOT NULL
         GROUP BY trip_id, drink_currency
         UNION ALL
         SELECT e.trip_id AS tripId, ce.currency, SUM(ce.subtotal) AS amount
         FROM event e JOIN cheki_entry ce ON ce.event_id = e.id
         WHERE e.deleted_at IS NULL AND ce.deleted_at IS NULL AND e.trip_id IS NOT NULL
         GROUP BY e.trip_id, ce.currency`,
      );

      const rowsByTrip = new Map<
        string,
        { eventTotals: Record<CurrencyCode, number>; eventCount: number; chekiCount: number }
      >();
      for (const row of eventCountRows) {
        rowsByTrip.set(row.tripId, {
          eventTotals: { ...ZERO_TOTALS },
          eventCount: row.eventCount,
          chekiCount: row.chekiCount,
        });
      }
      for (const row of eventAmountRows) {
        const agg = rowsByTrip.get(row.tripId) ?? { eventTotals: { ...ZERO_TOTALS }, eventCount: 0, chekiCount: 0 };
        agg.eventTotals[row.currency] += row.amount;
        rowsByTrip.set(row.tripId, agg);
      }

      return trips.map((trip) => {
        const agg = rowsByTrip.get(trip.id) ?? { eventTotals: { ...ZERO_TOTALS }, eventCount: 0, chekiCount: 0 };
        const expenses = expensesByTrip.get(trip.id) ?? [];
        return {
          ...trip,
          countries: countriesByTrip.get(trip.id) ?? [],
          eventCount: agg.eventCount,
          chekiCount: agg.chekiCount,
          expenseCount: expenses.length,
          eventTotals: agg.eventTotals,
        };
      });
    });
  }

  function listVenuesWithStats(): VenueListRow[] {
    return cachedQuery(db, 'venue:listWithStats', () => {
      const venues = db.getAllSync<Venue>(
        `SELECT id, name, country, region, address, is_favorite AS isFavorite, notes,
          schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
         FROM venue WHERE deleted_at IS NULL ORDER BY is_favorite DESC, name COLLATE NOCASE`,
      );

      const visitRows = db.getAllSync<{ venueId: string; c: number }>(
        `SELECT venue_id AS venueId, COUNT(*) AS c FROM event WHERE deleted_at IS NULL AND venue_id IS NOT NULL GROUP BY venue_id`,
      );
      const visitsByVenue = new Map(visitRows.map((r) => [r.venueId, r.c]));

      const drinkRows = db.getAllSync<{ venueId: string; currency: string; amount: number }>(
        `SELECT venue_id AS venueId, drink_currency AS currency, SUM(drink_amount) AS amount
         FROM event WHERE deleted_at IS NULL AND venue_id IS NOT NULL AND drink_amount IS NOT NULL
         GROUP BY venue_id, drink_currency`,
      );
      const drinksByVenue = new Map<string, Record<CurrencyCode, number>>();
      for (const row of drinkRows) {
        const totals = drinksByVenue.get(row.venueId) ?? { ...ZERO_TOTALS };
        totals[row.currency as CurrencyCode] = (totals[row.currency as CurrencyCode] ?? 0) + row.amount;
        drinksByVenue.set(row.venueId, totals);
      }

      return venues.map((venue) => ({
        ...venue,
        isFavorite: !!venue.isFavorite,
        visitCount: visitsByVenue.get(venue.id) ?? 0,
        drinkSpendTotals: drinksByVenue.get(venue.id) ?? { ...ZERO_TOTALS },
      }));
    });
  }

  function listIdolsWithStats(): IdolListRow[] {
    return cachedQuery(db, 'idol:listWithStats', () => {
      const idols = db
        .getAllSync<Idol>(
          `SELECT id, name, photo_media_id AS photoMediaId, country, region, birth_date AS birthDate,
            member_color AS memberColor, status, is_favorite AS isFavorite, notes,
            schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
           FROM idol WHERE deleted_at IS NULL AND status != 'inactive'
           ORDER BY is_favorite DESC, name COLLATE NOCASE`,
        )
        .map((i) => ({ ...i, isFavorite: !!i.isFavorite }));

      const ids = idols.map((i) => i.id);
      if (ids.length === 0) return [];

      const placeholders = ids.map(() => '?').join(',');

      const countRows = db.getAllSync<{ idolId: string; eventCount: number; chekiCount: number }>(
        `SELECT ce.idol_id AS idolId, COUNT(DISTINCT ce.event_id) AS eventCount,
           COALESCE(SUM(ce.quantity), 0) AS chekiCount
         FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
         WHERE ce.idol_id IN (${placeholders}) AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
         GROUP BY ce.idol_id`,
        ...ids,
      );
      const spendRows = db.getAllSync<{ idolId: string; spend: number; currency: CurrencyCode }>(
        `SELECT ce.idol_id AS idolId, ce.currency, SUM(ce.subtotal) AS spend
         FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
         WHERE ce.idol_id IN (${placeholders}) AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
         GROUP BY ce.idol_id, ce.currency`,
        ...ids,
      );
      const statsById = new Map<string, { eventCount: number; chekiCount: number; spendTotals: Record<CurrencyCode, number> }>();
      for (const row of countRows) {
        statsById.set(row.idolId, { eventCount: row.eventCount, chekiCount: row.chekiCount, spendTotals: { ...ZERO_TOTALS } });
      }
      for (const row of spendRows) {
        const stats = statsById.get(row.idolId) ?? { eventCount: 0, chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
        stats.spendTotals[row.currency] = row.spend;
        statsById.set(row.idolId, stats);
      }

      const memberships = db.getAllSync<{
        idolId: string;
        name: string | null;
        isMain: number;
        startDate: string;
        endDate: string | null;
        groupName: string;
      }>(
        `SELECT gm.idol_id AS idolId, gm.name, gm.is_main AS isMain, gm.start_date AS startDate,
          gm.end_date AS endDate, g.name AS groupName
         FROM group_membership gm JOIN groups g ON g.id = gm.group_id
         WHERE gm.idol_id IN (${placeholders}) AND gm.deleted_at IS NULL AND g.deleted_at IS NULL
           AND (gm.end_date IS NULL OR gm.end_date >= date('now'))
           AND gm.start_date <= date('now')
         ORDER BY gm.start_date`,
        ...ids,
      );
      const byIdol = new Map<string, typeof memberships>();
      for (const m of memberships) {
        const list = byIdol.get(m.idolId) ?? [];
        list.push(m);
        byIdol.set(m.idolId, list);
      }
      const displayById = new Map<string, { idolName: string | null; groupName: string | null }>();
      for (const idol of idols) {
        const picked = pickDisplayMembership(
          (byIdol.get(idol.id) ?? []).map((m) => ({ ...m, isMain: m.isMain === 1 })),
          todayISO(),
        );
        displayById.set(idol.id, picked ? { idolName: picked.name, groupName: picked.groupName ?? null } : { idolName: null, groupName: null });
      }

      return idols.map((idol) => {
        const stats = statsById.get(idol.id) ?? { eventCount: 0, chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
        const display = displayById.get(idol.id) ?? { idolName: null, groupName: null };
        return {
          ...idol,
          name: display.idolName ?? idol.name,
          groupName: display.groupName,
          ...stats,
        };
      });
    });
  }

  function listGroupsWithStats(): GroupListRow[] {
    return cachedQuery(db, 'group:listWithStats', () => {
      const groups = db
        .getAllSync<Group>(
          `SELECT id, name, photo_media_id AS photoMediaId, country, region, debut_date AS debutDate,
            end_date AS endDate, is_favorite AS isFavorite, notes,
            schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
           FROM groups WHERE deleted_at IS NULL ORDER BY is_favorite DESC, name COLLATE NOCASE`,
        )
        .map((g) => ({ ...g, isFavorite: !!g.isFavorite }));

      const ids = groups.map((g) => g.id);
      if (ids.length === 0) return [];

      const placeholders = ids.map(() => '?').join(',');

      const countRows = db.getAllSync<{ groupId: string; eventCount: number; chekiCount: number }>(
        `SELECT gm.group_id AS groupId, COUNT(DISTINCT ce.event_id) AS eventCount,
           COALESCE(SUM(ce.quantity), 0) AS chekiCount
         FROM cheki_entry ce
         JOIN group_membership gm ON gm.id = ce.group_membership_id
         JOIN event e ON e.id = ce.event_id
         WHERE gm.group_id IN (${placeholders})
           AND gm.start_date <= e.event_date
           AND (gm.end_date IS NULL OR e.event_date <= gm.end_date)
           AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
         GROUP BY gm.group_id`,
        ...ids,
      );
      const spendRows = db.getAllSync<{ groupId: string; spend: number; currency: CurrencyCode }>(
        `SELECT gm.group_id AS groupId, ce.currency, SUM(ce.subtotal) AS spend
         FROM cheki_entry ce
         JOIN group_membership gm ON gm.id = ce.group_membership_id
         JOIN event e ON e.id = ce.event_id
         WHERE gm.group_id IN (${placeholders})
           AND gm.start_date <= e.event_date
           AND (gm.end_date IS NULL OR e.event_date <= gm.end_date)
           AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
         GROUP BY gm.group_id, ce.currency`,
        ...ids,
      );
      const statsByGroup = new Map<string, { eventCount: number; chekiCount: number; spendTotals: Record<CurrencyCode, number> }>();
      for (const row of countRows) {
        statsByGroup.set(row.groupId, { eventCount: row.eventCount, chekiCount: row.chekiCount, spendTotals: { ...ZERO_TOTALS } });
      }
      for (const row of spendRows) {
        const stats = statsByGroup.get(row.groupId) ?? { eventCount: 0, chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
        stats.spendTotals[row.currency] = row.spend;
        statsByGroup.set(row.groupId, stats);
      }

      return groups.map((group) => {
        const stats = statsByGroup.get(group.id) ?? { eventCount: 0, chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
        return { ...group, ...stats };
      });
    });
  }

  // --- M4 Paginated helpers ---

  function mapCountryNameToCode(name: string): CountryCode | null {
    const found = COUNTRIES.find((c) => c.name === name);
    return found ? found.code : null;
  }

  function idolWhereParts(filters: { q?: string; status?: string; country?: string; region?: string; group?: string; favoritesOnly?: boolean; includeArchived?: boolean } = {}): { where: string[]; params: unknown[] } {
    const where: string[] = ['i.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (!filters.includeArchived) where.push(`i.status != 'inactive'`);
    const q = (filters.q ?? '').trim();
    if (q) {
      where.push(`(instr(lower(i.name), lower(?)) > 0 OR instr(lower(COALESCE(i.region,'')), lower(?)) > 0 OR instr(lower(i.country), lower(?)) > 0)`);
      params.push(q, q, q);
    }
    if (filters.status && filters.status !== 'all') {
      where.push(`i.status = ?`);
      params.push(filters.status);
    }
    if (filters.country && filters.country !== 'all') {
      const code = mapCountryNameToCode(filters.country) ?? filters.country;
      where.push(`i.country = ?`);
      params.push(code);
    }
    if (filters.region && filters.region !== 'all') {
      where.push(`i.region = ?`);
      params.push(filters.region);
    }
    if (filters.favoritesOnly) where.push(`i.is_favorite = 1`);
    // group filter applied via EXISTS on active membership
    if (filters.group && filters.group !== 'all') {
      where.push(`EXISTS (SELECT 1 FROM group_membership gm JOIN groups g ON g.id = gm.group_id WHERE gm.idol_id = i.id AND gm.deleted_at IS NULL AND g.deleted_at IS NULL AND g.name = ? AND gm.start_date <= date('now') AND (gm.end_date IS NULL OR gm.end_date >= date('now')))`);
      params.push(filters.group);
    }
    return { where, params };
  }

  function idolOrderBy(sort: IdolGroupSort = 'name-asc'): string {
    const dir = sort.endsWith('-asc') ? 'ASC' : 'DESC';
    if (sort.startsWith('name-')) return `ORDER BY i.name COLLATE NOCASE ${dir}, i.id ${dir}`;
    if (sort.startsWith('recently-added')) return `ORDER BY i.created_at ${dir}, i.id ${dir}`;
    if (sort.startsWith('events-')) return `ORDER BY COALESCE(stats.eventCount,0) ${dir}, i.name COLLATE NOCASE ASC, i.id ASC`;
    if (sort.startsWith('cheki-')) return `ORDER BY COALESCE(stats.chekiCount,0) ${dir}, i.name COLLATE NOCASE ASC, i.id ASC`;
    return `ORDER BY i.name COLLATE NOCASE ASC, i.id ASC`;
  }

  function appendIdolCursor(sort: IdolGroupSort, cursor: PageCursor, where: string[], params: unknown[]): void {
    if (!cursor) return;
    const decoded = decodeCursor(cursor);
    if (!decoded) return;
    const isAsc = sort.endsWith('-asc');
    const cmp = isAsc ? '>' : '<';
    if (sort.startsWith('name-')) {
      if (decoded.length !== 2) return;
      const [name, id] = decoded as [string, string];
      where.push(`((i.name COLLATE NOCASE ${cmp} ?) OR (i.name COLLATE NOCASE = ? AND i.id ${cmp} ?))`);
      params.push(name, name, id);
    } else if (sort.startsWith('recently-added')) {
      if (decoded.length !== 2) return;
      const [createdAt, id] = decoded as [string, string];
      where.push(`((i.created_at ${cmp} ?) OR (i.created_at = ? AND i.id ${cmp} ?))`);
      params.push(createdAt, createdAt, id);
    } else if (sort.startsWith('events-') || sort.startsWith('cheki-')) {
      if (decoded.length !== 3) return;
      const [primary, name, id] = decoded as [number, string, string];
      const col = sort.startsWith('events-') ? 'COALESCE(stats.eventCount,0)' : 'COALESCE(stats.chekiCount,0)';
      where.push(`((${col} ${cmp} ?) OR (${col} = ? AND i.name COLLATE NOCASE ${cmp} ?) OR (${col} = ? AND i.name COLLATE NOCASE = ? AND i.id ${cmp} ?))`);
      params.push(primary, primary, name, primary, name, id);
    }
  }

  function encodeIdolCursor(sort: IdolGroupSort, row: { name: string; createdAt: string; id: string; eventCount?: number; chekiCount?: number }): string {
    if (sort.startsWith('events-')) return encodeCursor([row.eventCount ?? 0, row.name, row.id]);
    if (sort.startsWith('cheki-')) return encodeCursor([row.chekiCount ?? 0, row.name, row.id]);
    if (sort.startsWith('recently-added')) return encodeCursor([row.createdAt, row.id]);
    return encodeCursor([row.name, row.id]);
  }

  interface IdolPageFiltersLocal {
    q?: string;
    status?: string;
    country?: string;
    region?: string;
    group?: string;
    favoritesOnly?: boolean;
    includeArchived?: boolean;
  }

  function countIdols(filters: IdolPageFiltersLocal = {}): number {
    const { where, params } = idolWhereParts(filters);
    const row = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM idol i WHERE ${where.join(' AND ')}`, ...params);
    return row?.c ?? 0;
  }

  function listIdolsPage(args: { filters?: IdolPageFiltersLocal; sort?: IdolGroupSort; limit?: number; cursor?: PageCursor } = {}): { rows: IdolListRow[]; nextCursor: PageCursor; hasMore: boolean } {
    const sort: IdolGroupSort = args.sort ?? 'name-asc';
    const limit = clampLimit(args.limit);
    const fetchLimit = limit + 1;
    const needsStats = sort.startsWith('events-') || sort.startsWith('cheki-');
    const { where: baseWhere, params: baseParams } = idolWhereParts(args.filters);
    const where: string[] = [...baseWhere];
    const params: unknown[] = [...baseParams];
    appendIdolCursor(sort, args.cursor ?? null, where, params);
    const whereClause = where.join(' AND ');
    const orderBy = idolOrderBy(sort);
    const joinStats = needsStats
      ? `LEFT JOIN (SELECT ce.idol_id AS idolId, COUNT(DISTINCT ce.event_id) AS eventCount, SUM(ce.quantity) AS chekiCount FROM cheki_entry ce JOIN event e ON e.id = ce.event_id WHERE ce.deleted_at IS NULL AND e.deleted_at IS NULL GROUP BY ce.idol_id) stats ON stats.idolId = i.id`
      : '';
    const rows = needsStats
      ? db.getAllSync<Idol & { eventCount?: number; chekiCount?: number }>(
          `SELECT i.id, i.name, i.photo_media_id AS photoMediaId, i.country, i.region, i.birth_date AS birthDate, i.member_color AS memberColor, i.status, i.is_favorite AS isFavorite, i.notes, i.schema_version AS schemaVersion, i.created_at AS createdAt, i.updated_at AS updatedAt, i.deleted_at AS deletedAt,
        COALESCE(stats.eventCount,0) AS eventCount, COALESCE(stats.chekiCount,0) AS chekiCount
       FROM idol i ${joinStats}
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
          ...params,
          fetchLimit,
        )
      : db.getAllSync<Idol & { eventCount?: number; chekiCount?: number }>(
          `SELECT i.id, i.name, i.photo_media_id AS photoMediaId, i.country, i.region, i.birth_date AS birthDate, i.member_color AS memberColor, i.status, i.is_favorite AS isFavorite, i.notes, i.schema_version AS schemaVersion, i.created_at AS createdAt, i.updated_at AS updatedAt, i.deleted_at AS deletedAt,
        0 AS eventCount, 0 AS chekiCount
       FROM idol i
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
          ...params,
          fetchLimit,
        );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    if (pageRows.length === 0) return { rows: [], nextCursor: null, hasMore: false };
    const nextCursor = hasMore ? encodeIdolCursor(sort, { name: pageRows[pageRows.length-1].name, createdAt: pageRows[pageRows.length-1].createdAt, id: pageRows[pageRows.length-1].id, eventCount: (pageRows[pageRows.length-1] as unknown as {eventCount:number}).eventCount, chekiCount: (pageRows[pageRows.length-1] as unknown as {chekiCount:number}).chekiCount }) : null;

    const ids = pageRows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    // stats per page (counts already have but spendTotals still needed)
    const countRows = db.getAllSync<{ idolId: string; eventCount: number; chekiCount: number }>(
      `SELECT ce.idol_id AS idolId, COUNT(DISTINCT ce.event_id) AS eventCount, COALESCE(SUM(ce.quantity),0) AS chekiCount
       FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
       WHERE ce.idol_id IN (${placeholders}) AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY ce.idol_id`,
      ...ids,
    );
    const spendRows = db.getAllSync<{ idolId: string; spend: number; currency: CurrencyCode }>(
      `SELECT ce.idol_id AS idolId, ce.currency, SUM(ce.subtotal) AS spend
       FROM cheki_entry ce JOIN event e ON e.id = ce.event_id
       WHERE ce.idol_id IN (${placeholders}) AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY ce.idol_id, ce.currency`,
      ...ids,
    );
    const statsById = new Map<string, { eventCount: number; chekiCount: number; spendTotals: Record<CurrencyCode, number> }>();
    for (const row of countRows) statsById.set(row.idolId, { eventCount: row.eventCount, chekiCount: row.chekiCount, spendTotals: { ...ZERO_TOTALS } });
    for (const row of spendRows) {
      const stats = statsById.get(row.idolId) ?? { eventCount: 0, chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
      stats.spendTotals[row.currency] = row.spend;
      statsById.set(row.idolId, stats);
    }
    // groupName per idol
    const memberships = db.getAllSync<{ idolId: string; name: string | null; isMain: number; startDate: string; endDate: string | null; groupName: string }>(
      `SELECT gm.idol_id AS idolId, gm.name, gm.is_main AS isMain, gm.start_date AS startDate, gm.end_date AS endDate, g.name AS groupName
       FROM group_membership gm JOIN groups g ON g.id = gm.group_id
       WHERE gm.idol_id IN (${placeholders}) AND gm.deleted_at IS NULL AND g.deleted_at IS NULL
         AND (gm.end_date IS NULL OR gm.end_date >= date('now'))
         AND gm.start_date <= date('now')
       ORDER BY gm.start_date`,
      ...ids,
    );
    const byIdol = new Map<string, typeof memberships>();
    for (const m of memberships) {
      const list = byIdol.get(m.idolId) ?? [];
      list.push(m);
      byIdol.set(m.idolId, list);
    }
    const displayById = new Map<string, { idolName: string | null; groupName: string | null }>();
    for (const idol of pageRows) {
      const list = (byIdol.get(idol.id) ?? []).map((m) => ({ ...m, isMain: m.isMain === 1 }));
      const picked = pickDisplayMembership(list as never, todayISO()) as unknown as { name: string | null; groupName: string | null } | null;
      displayById.set(idol.id, picked ? { idolName: picked.name, groupName: picked.groupName ?? null } : { idolName: null, groupName: null });
    }

    const resultRows: IdolListRow[] = pageRows.map((idol) => {
      const stats = statsById.get(idol.id) ?? { eventCount: 0, chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
      const display = displayById.get(idol.id) ?? { idolName: null, groupName: null };
      return {
        ...(idol as unknown as Idol),
        isFavorite: !!(idol as unknown as { isFavorite: number | boolean }).isFavorite,
        name: display.idolName ?? idol.name,
        groupName: display.groupName,
        ...stats,
      };
    });

    return { rows: resultRows, nextCursor, hasMore };
  }

  function listGroupsPage(args: { filters?: { q?: string; country?: string; region?: string; favoritesOnly?: boolean }; sort?: IdolGroupSort; limit?: number; cursor?: PageCursor } = {}): { rows: GroupListRow[]; nextCursor: PageCursor; hasMore: boolean } {
    const sort: IdolGroupSort = args.sort ?? 'name-asc';
    const limit = clampLimit(args.limit);
    const fetchLimit = limit + 1;
    const q = (args.filters?.q ?? '').trim();
    const country = args.filters?.country ?? 'all';
    const region = args.filters?.region ?? 'all';
    const needsStats = sort.startsWith('events-') || sort.startsWith('cheki-');

    const where: string[] = ['g.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q) { where.push(`(instr(lower(g.name), lower(?)) > 0 OR instr(lower(COALESCE(g.region,'')), lower(?)) > 0 OR instr(lower(g.country), lower(?)) > 0)`); params.push(q,q,q); }
    if (args.filters?.favoritesOnly) where.push(`g.is_favorite = 1`);
    if (country !== 'all') {
      const code = mapCountryNameToCode(country) ?? country;
      where.push(`g.country = ?`); params.push(code);
    }
    if (region !== 'all') { where.push(`g.region = ?`); params.push(region); }

    appendGroupCursor(sort, args.cursor ?? null, where, params);
    const whereClause = where.join(' AND ');
    const orderBy = groupOrderBy(sort);
    const joinStats = needsStats
      ? `LEFT JOIN (SELECT gm.group_id AS groupId, COUNT(DISTINCT ce.event_id) AS eventCount, SUM(ce.quantity) AS chekiCount FROM cheki_entry ce JOIN group_membership gm ON gm.id = ce.group_membership_id JOIN event e ON e.id = ce.event_id WHERE gm.deleted_at IS NULL AND ce.deleted_at IS NULL AND e.deleted_at IS NULL AND gm.start_date <= e.event_date AND (gm.end_date IS NULL OR e.event_date <= gm.end_date) GROUP BY gm.group_id) stats ON stats.groupId = g.id`
      : '';

    const rows = needsStats
      ? db.getAllSync<Group & { eventCount?: number; chekiCount?: number }>(
          `SELECT g.id, g.name, g.photo_media_id AS photoMediaId, g.country, g.region, g.debut_date AS debutDate, g.end_date AS endDate, g.is_favorite AS isFavorite, g.notes, g.schema_version AS schemaVersion, g.created_at AS createdAt, g.updated_at AS updatedAt, g.deleted_at AS deletedAt,
        COALESCE(stats.eventCount,0) AS eventCount, COALESCE(stats.chekiCount,0) AS chekiCount
       FROM groups g ${joinStats}
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
          ...params,
          fetchLimit,
        )
      : db.getAllSync<Group & { eventCount?: number; chekiCount?: number }>(
          `SELECT g.id, g.name, g.photo_media_id AS photoMediaId, g.country, g.region, g.debut_date AS debutDate, g.end_date AS endDate, g.is_favorite AS isFavorite, g.notes, g.schema_version AS schemaVersion, g.created_at AS createdAt, g.updated_at AS updatedAt, g.deleted_at AS deletedAt,
        0 AS eventCount, 0 AS chekiCount
       FROM groups g
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
          ...params,
          fetchLimit,
        );
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    if (pageRows.length === 0) return { rows: [], nextCursor: null, hasMore: false };
    const nextCursor = hasMore ? encodeGroupCursor(sort, pageRows[pageRows.length-1] as unknown as { name: string; createdAt: string; id: string; eventCount:number; chekiCount:number }) : null;
    const ids = pageRows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const countRows = db.getAllSync<{ groupId: string; eventCount: number; chekiCount: number }>(
      `SELECT gm.group_id AS groupId, COUNT(DISTINCT ce.event_id) AS eventCount, COALESCE(SUM(ce.quantity),0) AS chekiCount
       FROM cheki_entry ce JOIN group_membership gm ON gm.id = ce.group_membership_id JOIN event e ON e.id = ce.event_id
       WHERE gm.group_id IN (${placeholders}) AND gm.start_date <= e.event_date AND (gm.end_date IS NULL OR e.event_date <= gm.end_date) AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY gm.group_id`,
      ...ids,
    );
    const spendRows = db.getAllSync<{ groupId: string; spend: number; currency: CurrencyCode }>(
      `SELECT gm.group_id AS groupId, ce.currency, SUM(ce.subtotal) AS spend
       FROM cheki_entry ce JOIN group_membership gm ON gm.id = ce.group_membership_id JOIN event e ON e.id = ce.event_id
       WHERE gm.group_id IN (${placeholders}) AND gm.start_date <= e.event_date AND (gm.end_date IS NULL OR e.event_date <= gm.end_date) AND ce.deleted_at IS NULL AND e.deleted_at IS NULL
       GROUP BY gm.group_id, ce.currency`,
      ...ids,
    );
    const statsByGroup = new Map<string, { eventCount: number; chekiCount: number; spendTotals: Record<CurrencyCode, number> }>();
    for (const row of countRows) statsByGroup.set(row.groupId, { eventCount: row.eventCount, chekiCount: row.chekiCount, spendTotals: { ...ZERO_TOTALS } });
    for (const row of spendRows) {
      const stats = statsByGroup.get(row.groupId) ?? { eventCount: 0, chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
      stats.spendTotals[row.currency] = row.spend;
      statsByGroup.set(row.groupId, stats);
    }
    const resultRows: GroupListRow[] = pageRows.map((g) => {
      const stats = statsByGroup.get(g.id) ?? { eventCount: 0, chekiCount: 0, spendTotals: { ...ZERO_TOTALS } };
      return { ...(g as unknown as Group), isFavorite: !!(g as unknown as {isFavorite:number|boolean}).isFavorite, ...stats };
    });
    return { rows: resultRows, nextCursor, hasMore };
  }

  function countGroups(filters: { q?: string; country?: string; region?: string; favoritesOnly?: boolean } = {}): number {
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    const q = (filters.q ?? '').trim();
    if (q) { where.push(`(instr(lower(name), lower(?)) > 0 OR instr(lower(COALESCE(region,'')), lower(?)) > 0 OR instr(lower(country), lower(?)) > 0)`); params.push(q,q,q); }
    if (filters.favoritesOnly) where.push(`is_favorite = 1`);
    if (filters.country && filters.country !== 'all') {
      const code = mapCountryNameToCode(filters.country) ?? filters.country;
      where.push(`country = ?`); params.push(code);
    }
    if (filters.region && filters.region !== 'all') { where.push(`region = ?`); params.push(filters.region); }
    const row = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM groups WHERE ${where.join(' AND ')}`, ...params);
    return row?.c ?? 0;
  }

  function groupOrderBy(sort: IdolGroupSort): string {
    const dir = sort.endsWith('-asc') ? 'ASC' : 'DESC';
    if (sort.startsWith('name-')) return `ORDER BY g.name COLLATE NOCASE ${dir}, g.id ${dir}`;
    if (sort.startsWith('recently-added')) return `ORDER BY g.created_at ${dir}, g.id ${dir}`;
    if (sort.startsWith('events-')) return `ORDER BY COALESCE(stats.eventCount,0) ${dir}, g.name COLLATE NOCASE ASC, g.id ASC`;
    if (sort.startsWith('cheki-')) return `ORDER BY COALESCE(stats.chekiCount,0) ${dir}, g.name COLLATE NOCASE ASC, g.id ASC`;
    return `ORDER BY g.name COLLATE NOCASE ASC, g.id ASC`;
  }

  function appendGroupCursor(sort: IdolGroupSort, cursor: PageCursor, where: string[], params: unknown[]): void {
    if (!cursor) return;
    const decoded = decodeCursor(cursor);
    if (!decoded) return;
    const isAsc = sort.endsWith('-asc');
    const cmp = isAsc ? '>' : '<';
    if (sort.startsWith('name-')) {
      if (decoded.length !== 2) return;
      const [name, id] = decoded as [string, string];
      where.push(`((g.name COLLATE NOCASE ${cmp} ?) OR (g.name COLLATE NOCASE = ? AND g.id ${cmp} ?))`);
      params.push(name, name, id);
    } else if (sort.startsWith('recently-added')) {
      if (decoded.length !== 2) return;
      const [createdAt, id] = decoded as [string, string];
      where.push(`((g.created_at ${cmp} ?) OR (g.created_at = ? AND g.id ${cmp} ?))`);
      params.push(createdAt, createdAt, id);
    } else if (sort.startsWith('events-') || sort.startsWith('cheki-')) {
      if (decoded.length !== 3) return;
      const [primary, name, id] = decoded as [number, string, string];
      const col = sort.startsWith('events-') ? 'COALESCE(stats.eventCount,0)' : 'COALESCE(stats.chekiCount,0)';
      where.push(`((${col} ${cmp} ?) OR (${col} = ? AND g.name COLLATE NOCASE ${cmp} ?) OR (${col} = ? AND g.name COLLATE NOCASE = ? AND g.id ${cmp} ?))`);
      params.push(primary, primary, name, primary, name, id);
    }
  }

  function encodeGroupCursor(sort: IdolGroupSort, row: { name: string; createdAt: string; id: string; eventCount?: number; chekiCount?: number }): string {
    if (sort.startsWith('events-')) return encodeCursor([row.eventCount ?? 0, row.name, row.id]);
    if (sort.startsWith('cheki-')) return encodeCursor([row.chekiCount ?? 0, row.name, row.id]);
    if (sort.startsWith('recently-added')) return encodeCursor([row.createdAt, row.id]);
    return encodeCursor([row.name, row.id]);
  }

  // --- Trip & Venue paginated ---

  function tripOrderBy(sort: TripSort): string {
    const dir = sort.endsWith('-asc') ? 'ASC' : 'DESC';
    if (sort.startsWith('start-')) return `ORDER BY t.start_date ${dir}, t.id ${dir}`;
    if (sort.startsWith('recently-added')) return `ORDER BY t.created_at ${dir}, t.id ${dir}`;
    if (sort.startsWith('events-')) return `ORDER BY COALESCE(stats.eventCount,0) ${dir}, t.title COLLATE NOCASE ASC, t.id ASC`;
    return `ORDER BY t.start_date DESC, t.id DESC`;
  }

  function appendTripCursor(sort: TripSort, cursor: PageCursor, where: string[], params: unknown[]): void {
    if (!cursor) return;
    const decoded = decodeCursor(cursor);
    if (!decoded) return;
    const isAsc = sort.endsWith('-asc');
    const cmp = isAsc ? '>' : '<';
    if (sort.startsWith('start-')) {
      if (decoded.length !== 2) return;
      const [startDate, id] = decoded as [string, string];
      where.push(`((t.start_date ${cmp} ?) OR (t.start_date = ? AND t.id ${cmp} ?))`);
      params.push(startDate, startDate, id);
    } else if (sort.startsWith('recently-added')) {
      if (decoded.length !== 2) return;
      const [createdAt, id] = decoded as [string, string];
      where.push(`((t.created_at ${cmp} ?) OR (t.created_at = ? AND t.id ${cmp} ?))`);
      params.push(createdAt, createdAt, id);
    } else if (sort.startsWith('events-')) {
      if (decoded.length !== 3) return;
      const [eventCount, title, id] = decoded as [number, string, string];
      where.push(`((COALESCE(stats.eventCount,0) ${cmp} ?) OR (COALESCE(stats.eventCount,0) = ? AND t.title COLLATE NOCASE ${cmp} ?) OR (COALESCE(stats.eventCount,0) = ? AND t.title COLLATE NOCASE = ? AND t.id ${cmp} ?))`);
      params.push(eventCount, eventCount, title, eventCount, title, id);
    }
  }

  function encodeTripCursor(sort: TripSort, row: { startDate: string; createdAt: string; title: string; id: string; eventCount?: number }): string {
    if (sort.startsWith('events-')) return encodeCursor([row.eventCount ?? 0, row.title, row.id]);
    if (sort.startsWith('recently-added')) return encodeCursor([row.createdAt, row.id]);
    return encodeCursor([row.startDate, row.id]);
  }

  function countTrips(filters: { q?: string; country?: string; status?: string } = {}): number {
    const where: string[] = ['t.deleted_at IS NULL'];
    const params: unknown[] = [];
    const q = (filters.q ?? '').trim();
    if (q) { where.push(`instr(lower(t.title), lower(?)) > 0`); params.push(q); }
    if (filters.country && filters.country !== 'all') {
      where.push(`EXISTS (SELECT 1 FROM trip_country tc WHERE tc.trip_id = t.id AND tc.deleted_at IS NULL AND tc.country = ?)`);
      params.push(filters.country);
    }
    if (filters.status && filters.status !== 'all') {
      const today = todayISO();
      if (filters.status === 'on-going') where.push(`t.start_date <= ? AND t.end_date >= ?`);
      else if (filters.status === 'upcoming') where.push(`t.start_date > ?`);
      else if (filters.status === 'passed') where.push(`t.end_date < ?`);
      if (filters.status === 'on-going') params.push(today, today);
      else params.push(today);
    }
    const row = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM trip t WHERE ${where.join(' AND ')}`, ...params);
    return row?.c ?? 0;
  }

  function listTripsPage(args: { filters?: { q?: string; country?: string; status?: string }; sort?: TripSort; limit?: number; cursor?: PageCursor } = {}): { rows: TripListRow[]; nextCursor: PageCursor; hasMore: boolean } {
    const sort: TripSort = args.sort ?? 'start-desc';
    const limit = clampLimit(args.limit);
    const fetchLimit = limit + 1;
    const where: string[] = ['t.deleted_at IS NULL'];
    const params: unknown[] = [];
    const q = (args.filters?.q ?? '').trim();
    if (q) { where.push(`instr(lower(t.title), lower(?)) > 0`); params.push(q); }
    if (args.filters?.country && args.filters.country !== 'all') {
      where.push(`EXISTS (SELECT 1 FROM trip_country tc WHERE tc.trip_id = t.id AND tc.deleted_at IS NULL AND tc.country = ?)`);
      params.push(args.filters.country);
    }
    if (args.filters?.status && args.filters.status !== 'all') {
      const today = todayISO();
      if (args.filters.status === 'on-going') where.push(`t.start_date <= ? AND t.end_date >= ?`);
      else if (args.filters.status === 'upcoming') where.push(`t.start_date > ?`);
      else if (args.filters.status === 'passed') where.push(`t.end_date < ?`);
      if (args.filters.status === 'on-going') params.push(today, today);
      else params.push(today);
    }
    const needsStats = sort.startsWith('events-');
    const joinStats = needsStats ? `LEFT JOIN (SELECT e.trip_id AS tripId, COUNT(DISTINCT e.id) AS eventCount FROM event e WHERE e.deleted_at IS NULL AND e.trip_id IS NOT NULL GROUP BY e.trip_id) stats ON stats.tripId = t.id` : '';
    appendTripCursor(sort, args.cursor ?? null, where, params);
    const whereClause = where.join(' AND ');
    const orderBy = tripOrderBy(sort);
    const rows = needsStats
      ? db.getAllSync<Trip & { eventCount?: number }>(
          `SELECT t.id, t.title, t.start_date AS startDate, t.end_date AS endDate, t.description, t.is_favorite AS isFavorite, t.schema_version AS schemaVersion, t.created_at AS createdAt, t.updated_at AS updatedAt, t.deleted_at AS deletedAt,
        COALESCE(stats.eventCount,0) AS eventCount
       FROM trip t ${joinStats}
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
          ...params,
          fetchLimit,
        )
      : db.getAllSync<Trip & { eventCount?: number }>(
          `SELECT t.id, t.title, t.start_date AS startDate, t.end_date AS endDate, t.description, t.is_favorite AS isFavorite, t.schema_version AS schemaVersion, t.created_at AS createdAt, t.updated_at AS updatedAt, t.deleted_at AS deletedAt,
        0 AS eventCount
       FROM trip t
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
          ...params,
          fetchLimit,
        );
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    if (pageRows.length === 0) return { rows: [], nextCursor: null, hasMore: false };
    const nextCursor = hasMore ? encodeTripCursor(sort, { startDate: pageRows[pageRows.length-1].startDate, createdAt: pageRows[pageRows.length-1].createdAt, title: pageRows[pageRows.length-1].title, id: pageRows[pageRows.length-1].id, eventCount: (pageRows[pageRows.length-1] as unknown as {eventCount:number}).eventCount }) : null;
    const ids = pageRows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const countryRows = db.getAllSync<{ tripId: string; country: CountryCode }>(`SELECT trip_id AS tripId, country FROM trip_country WHERE trip_id IN (${placeholders}) AND deleted_at IS NULL`, ...ids);
    const countriesByTrip = new Map<string, CountryCode[]>();
    for (const row of countryRows) { const list = countriesByTrip.get(row.tripId) ?? []; list.push(row.country); countriesByTrip.set(row.tripId, list); }
    const expenseRows = db.getAllSync<{ tripId: string; currency: string; amount: number }>(`SELECT trip_id AS tripId, currency, amount FROM trip_expense WHERE trip_id IN (${placeholders}) AND deleted_at IS NULL`, ...ids);
    const expensesByTrip = new Map<string, { amount: number; currency: CurrencyCode }[]>();
    for (const row of expenseRows) { const list = expensesByTrip.get(row.tripId) ?? []; list.push({ amount: row.amount, currency: row.currency as CurrencyCode }); expensesByTrip.set(row.tripId, list); }
    const eventCountRows = db.getAllSync<{ tripId: string; eventCount: number; chekiCount: number }>(
      `SELECT e.trip_id AS tripId, COUNT(DISTINCT e.id) AS eventCount, COALESCE(SUM(ce.quantity),0) AS chekiCount FROM event e LEFT JOIN cheki_entry ce ON ce.event_id = e.id AND ce.deleted_at IS NULL WHERE e.deleted_at IS NULL AND e.trip_id IN (${placeholders}) GROUP BY e.trip_id`,
      ...ids,
    );
    const eventAmountRows = db.getAllSync<{ tripId: string; currency: CurrencyCode; amount: number }>(
      `SELECT trip_id AS tripId, ticket_currency AS currency, SUM(ticket_amount) AS amount FROM event WHERE deleted_at IS NULL AND trip_id IN (${placeholders}) AND ticket_currency IS NOT NULL AND ticket_amount IS NOT NULL GROUP BY trip_id, ticket_currency UNION ALL SELECT trip_id AS tripId, drink_currency AS currency, SUM(drink_amount) AS amount FROM event WHERE deleted_at IS NULL AND trip_id IN (${placeholders}) AND drink_currency IS NOT NULL AND drink_amount IS NOT NULL GROUP BY trip_id, drink_currency UNION ALL SELECT e.trip_id AS tripId, ce.currency, SUM(ce.subtotal) AS amount FROM event e JOIN cheki_entry ce ON ce.event_id = e.id WHERE e.deleted_at IS NULL AND ce.deleted_at IS NULL AND e.trip_id IN (${placeholders}) GROUP BY e.trip_id, ce.currency`,
      ...ids, ...ids, ...ids,
    );
    const rowsByTrip = new Map<string, { eventTotals: Record<CurrencyCode, number>; eventCount: number; chekiCount: number }>();
    for (const row of eventCountRows) rowsByTrip.set(row.tripId, { eventTotals: { ...ZERO_TOTALS }, eventCount: row.eventCount, chekiCount: row.chekiCount });
    for (const row of eventAmountRows) {
      const agg = rowsByTrip.get(row.tripId) ?? { eventTotals: { ...ZERO_TOTALS }, eventCount: 0, chekiCount: 0 };
      agg.eventTotals[row.currency] += row.amount;
      rowsByTrip.set(row.tripId, agg);
    }
    const resultRows: TripListRow[] = pageRows.map((trip) => {
      const agg = rowsByTrip.get(trip.id) ?? { eventTotals: { ...ZERO_TOTALS }, eventCount: 0, chekiCount: 0 };
      const expenses = expensesByTrip.get(trip.id) ?? [];
      return {
        ...(trip as unknown as Trip),
        isFavorite: !!(trip as unknown as {isFavorite:number|boolean}).isFavorite,
        countries: countriesByTrip.get(trip.id) ?? [],
        eventCount: agg.eventCount,
        chekiCount: agg.chekiCount,
        expenseCount: expenses.length,
        eventTotals: agg.eventTotals,
      };
    });
    return { rows: resultRows, nextCursor, hasMore };
  }

  function venueOrderBy(sort: VenueSort): string {
    const dir = sort.endsWith('-asc') ? 'ASC' : 'DESC';
    if (sort.startsWith('name-')) return `ORDER BY v.name COLLATE NOCASE ${dir}, v.id ${dir}`;
    if (sort.startsWith('recently-added')) return `ORDER BY v.created_at ${dir}, v.id ${dir}`;
    if (sort.startsWith('visits-')) return `ORDER BY COALESCE(stats.visitCount,0) ${dir}, v.name COLLATE NOCASE ASC, v.id ASC`;
    return `ORDER BY v.name COLLATE NOCASE ASC, v.id ASC`;
  }

  function appendVenueCursor(sort: VenueSort, cursor: PageCursor, where: string[], params: unknown[]): void {
    if (!cursor) return;
    const decoded = decodeCursor(cursor);
    if (!decoded) return;
    const isAsc = sort.endsWith('-asc');
    const cmp = isAsc ? '>' : '<';
    if (sort.startsWith('name-')) {
      if (decoded.length !== 2) return;
      const [name, id] = decoded as [string,string];
      where.push(`((v.name COLLATE NOCASE ${cmp} ?) OR (v.name COLLATE NOCASE = ? AND v.id ${cmp} ?))`);
      params.push(name,name,id);
    } else if (sort.startsWith('recently-added')) {
      if (decoded.length !== 2) return;
      const [createdAt, id] = decoded as [string,string];
      where.push(`((v.created_at ${cmp} ?) OR (v.created_at = ? AND v.id ${cmp} ?))`);
      params.push(createdAt, createdAt, id);
    } else if (sort.startsWith('visits-')) {
      if (decoded.length !== 3) return;
      const [visits, name, id] = decoded as [number,string,string];
      where.push(`((COALESCE(stats.visitCount,0) ${cmp} ?) OR (COALESCE(stats.visitCount,0) = ? AND v.name COLLATE NOCASE ${cmp} ?) OR (COALESCE(stats.visitCount,0) = ? AND v.name COLLATE NOCASE = ? AND v.id ${cmp} ?))`);
      params.push(visits, visits, name, visits, name, id);
    }
  }

  function encodeVenueCursor(sort: VenueSort, row: { name: string; createdAt: string; id: string; visitCount?: number }): string {
    if (sort.startsWith('visits-')) return encodeCursor([row.visitCount ?? 0, row.name, row.id]);
    if (sort.startsWith('recently-added')) return encodeCursor([row.createdAt, row.id]);
    return encodeCursor([row.name, row.id]);
  }

  function countVenues(filters: { q?: string; country?: string; region?: string } = {}): number {
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    const q = (filters.q ?? '').trim();
    if (q) { where.push(`(instr(lower(name), lower(?)) > 0 OR instr(lower(COALESCE(region,'')), lower(?)) > 0)`); params.push(q,q); }
    if (filters.country && filters.country !== 'all') {
      const code = mapCountryNameToCode(filters.country) ?? filters.country;
      where.push(`country = ?`); params.push(code);
    }
    if (filters.region && filters.region !== 'all') { where.push(`region = ?`); params.push(filters.region); }
    const row = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM venue WHERE ${where.join(' AND ')}`, ...params);
    return row?.c ?? 0;
  }

  function listVenuesPage(args: { filters?: { q?: string; country?: string; region?: string }; sort?: VenueSort; limit?: number; cursor?: PageCursor } = {}): { rows: VenueListRow[]; nextCursor: PageCursor; hasMore: boolean } {
    const sort: VenueSort = args.sort ?? 'name-asc';
    const limit = clampLimit(args.limit);
    const fetchLimit = limit + 1;
    const where: string[] = ['v.deleted_at IS NULL'];
    const params: unknown[] = [];
    const q = (args.filters?.q ?? '').trim();
    if (q) { where.push(`(instr(lower(v.name), lower(?)) > 0 OR instr(lower(COALESCE(v.region,'')), lower(?)) > 0)`); params.push(q,q); }
    if (args.filters?.country && args.filters.country !== 'all') {
      const code = mapCountryNameToCode(args.filters.country) ?? args.filters.country;
      where.push(`v.country = ?`); params.push(code);
    }
    if (args.filters?.region && args.filters.region !== 'all') { where.push(`v.region = ?`); params.push(args.filters.region); }
    const needsStats = sort.startsWith('visits-');
    const joinStats = needsStats ? `LEFT JOIN (SELECT venue_id AS venueId, COUNT(*) AS visitCount FROM event WHERE deleted_at IS NULL AND venue_id IS NOT NULL GROUP BY venue_id) stats ON stats.venueId = v.id` : '';
    appendVenueCursor(sort, args.cursor ?? null, where, params);
    const whereClause = where.join(' AND ');
    const orderBy = venueOrderBy(sort);
    const rows = needsStats
      ? db.getAllSync<Venue & { visitCount?: number }>(
          `SELECT v.id, v.name, v.country, v.region, v.address, v.is_favorite AS isFavorite, v.notes, v.schema_version AS schemaVersion, v.created_at AS createdAt, v.updated_at AS updatedAt, v.deleted_at AS deletedAt,
        COALESCE(stats.visitCount,0) AS visitCount
       FROM venue v ${joinStats}
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
          ...params,
          fetchLimit,
        )
      : db.getAllSync<Venue & { visitCount?: number }>(
          `SELECT v.id, v.name, v.country, v.region, v.address, v.is_favorite AS isFavorite, v.notes, v.schema_version AS schemaVersion, v.created_at AS createdAt, v.updated_at AS updatedAt, v.deleted_at AS deletedAt,
        0 AS visitCount
       FROM venue v
       WHERE ${whereClause}
       ${orderBy}
       LIMIT ?`,
          ...params,
          fetchLimit,
        );
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    if (pageRows.length === 0) return { rows: [], nextCursor: null, hasMore: false };
    const nextCursor = hasMore ? encodeVenueCursor(sort, { name: pageRows[pageRows.length-1].name, createdAt: pageRows[pageRows.length-1].createdAt, id: pageRows[pageRows.length-1].id, visitCount: (pageRows[pageRows.length-1] as unknown as {visitCount:number}).visitCount }) : null;
    const ids = pageRows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const visitRows = db.getAllSync<{ venueId: string; c: number }>(`SELECT venue_id AS venueId, COUNT(*) AS c FROM event WHERE deleted_at IS NULL AND venue_id IN (${placeholders}) GROUP BY venue_id`, ...ids);
    const visitsByVenue = new Map(visitRows.map((r) => [r.venueId, r.c]));
    const drinkRows = db.getAllSync<{ venueId: string; currency: string; amount: number }>(`SELECT venue_id AS venueId, drink_currency AS currency, SUM(drink_amount) AS amount FROM event WHERE deleted_at IS NULL AND venue_id IN (${placeholders}) AND drink_amount IS NOT NULL GROUP BY venue_id, drink_currency`, ...ids);
    const drinksByVenue = new Map<string, Record<CurrencyCode, number>>();
    for (const row of drinkRows) {
      const totals = drinksByVenue.get(row.venueId) ?? { ...ZERO_TOTALS };
      totals[row.currency as CurrencyCode] = (totals[row.currency as CurrencyCode] ?? 0) + row.amount;
      drinksByVenue.set(row.venueId, totals);
    }
    const resultRows: VenueListRow[] = pageRows.map((venue) => ({
      ...(venue as unknown as Venue),
      isFavorite: !!(venue as unknown as {isFavorite:number|boolean}).isFavorite,
      visitCount: visitsByVenue.get(venue.id) ?? 0,
      drinkSpendTotals: drinksByVenue.get(venue.id) ?? { ...ZERO_TOTALS },
    }));
    return { rows: resultRows, nextCursor, hasMore };
  }

  return {
    getIdolStats,
    getIdolSpendByIdolIds,
    getGroupStats,
    getGroupMemberStats,
    getVenueStats,
    getTripStats,
    getHomeStats,
    listTripsWithStats,
    listVenuesWithStats,
    listIdolsWithStats,
    listGroupsWithStats,
    countIdols,
    listIdolsPage,
    countGroups,
    listGroupsPage,
    countTrips,
    listTripsPage,
    countVenues,
    listVenuesPage,
    totalsToSortedList,
  };
}

export type AggregationService = ReturnType<typeof createAggregationService>;

import type { SqliteLike } from '@/db/types';
import { withSavepointSync } from '@/db/transaction';
import type { CountryCode, CurrencyCode, ExpenseCategory, Trip, TripExpense } from '@/types/domain';
import { nowUTCISO } from '@/utils/date';
import { uuid } from '@/utils/id';
import { cachedQuery, invalidateQueries } from '@/utils/queryCache';

export interface TripInput {
  title: string;
  startDate: string;
  endDate: string;
  description?: string | null;
  isFavorite?: boolean;
  countries: CountryCode[];
}

export interface ExpenseInput {
  tripId: string;
  title: string;
  category: ExpenseCategory;
  customCategoryLabel?: string | null;
  currency: CurrencyCode;
  amount: number;
  date: string;
  note?: string | null;
}

const TRIP_COLS = `
  id, title, start_date AS startDate, end_date AS endDate, description, is_favorite AS isFavorite,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const EXPENSE_COLS = `
  id, trip_id AS tripId, title, category, custom_category_label AS customCategoryLabel, currency, amount,
  expense_date AS date, note,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

export function createTripRepo(db: SqliteLike) {
  function listTrips(): Trip[] {
    return cachedQuery(db, 'trip:list', () => {
      const rows = db.getAllSync<Trip>(`SELECT ${TRIP_COLS} FROM trip WHERE deleted_at IS NULL ORDER BY start_date DESC`);
      return rows.map((r) => ({ ...r, isFavorite: !!r.isFavorite }));
    });
  }

  function getTrip(id: string): Trip | null {
    const row = db.getFirstSync<Trip>(`SELECT ${TRIP_COLS} FROM trip WHERE id = ? AND deleted_at IS NULL`, id);
    return row ? { ...row, isFavorite: !!row.isFavorite } : null;
  }

  function createTrip(input: TripInput): Trip {
    const now = nowUTCISO();
    const id = uuid();
    withSavepointSync(db, () => {
      db.runSync(
        `INSERT INTO trip (id, title, start_date, end_date, description, is_favorite, schema_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        id,
        input.title,
        input.startDate,
        input.endDate,
        input.description ?? null,
        input.isFavorite ? 1 : 0,
        now,
        now,
      );
      for (const country of new Set(input.countries)) {
        db.runSync(
          `INSERT INTO trip_country (id, trip_id, country, schema_version, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, 1, ?, ?, NULL)`,
          uuid(),
          id,
          country,
          now,
          now,
        );
      }
    });
    invalidateQueries(db);
    return getTrip(id)!;
  }

  function updateTrip(id: string, input: Partial<TripInput>): Trip {
    const current = getTrip(id);
    if (!current) throw new Error(`Trip not found: ${id}`);
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      db.runSync(
        `UPDATE trip SET title = ?, start_date = ?, end_date = ?, description = ?, is_favorite = ?, updated_at = ? WHERE id = ?`,
        input.title ?? current.title,
        input.startDate ?? current.startDate,
        input.endDate ?? current.endDate,
        input.description !== undefined ? input.description : current.description,
        input.isFavorite !== undefined ? (input.isFavorite ? 1 : 0) : current.isFavorite ? 1 : 0,
        now,
        id,
      );
      if (input.countries) {
        db.runSync(`DELETE FROM trip_country WHERE trip_id = ?`, id);
        for (const country of new Set(input.countries)) {
          db.runSync(
            `INSERT INTO trip_country (id, trip_id, country, schema_version, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, 1, ?, ?, NULL)`,
            uuid(),
            id,
            country,
            now,
            now,
          );
        }
      }
    });
    invalidateQueries(db);
    return getTrip(id)!;
  }

  function deleteTrip(id: string): void {
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      db.runSync(`UPDATE event SET trip_id = NULL, updated_at = ? WHERE trip_id = ? AND deleted_at IS NULL`, now, id);
      db.runSync(`UPDATE trip_expense SET deleted_at = ?, updated_at = ? WHERE trip_id = ? AND deleted_at IS NULL`, now, now, id);
      db.runSync(`UPDATE trip_country SET deleted_at = ?, updated_at = ? WHERE trip_id = ? AND deleted_at IS NULL`, now, now, id);
      db.runSync(`UPDATE trip SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id);
    });
    invalidateQueries(db);
  }

  function listTripCountries(tripId: string): CountryCode[] {
    const rows = db.getAllSync<{ country: CountryCode }>(
      `SELECT country FROM trip_country WHERE trip_id = ? AND deleted_at IS NULL ORDER BY country`,
      tripId,
    );
    return rows.map((r) => r.country);
  }

  // --- Expenses ---

  function listExpenses(tripId: string): TripExpense[] {
    const rows = db.getAllSync<TripExpense>(
      `SELECT ${EXPENSE_COLS} FROM trip_expense WHERE trip_id = ? AND deleted_at IS NULL ORDER BY expense_date DESC, created_at DESC`,
      tripId,
    );
    return rows.map((r) => r as TripExpense);
  }

  function getExpense(id: string): TripExpense | null {
    const row = db.getFirstSync<TripExpense>(`SELECT ${EXPENSE_COLS} FROM trip_expense WHERE id = ? AND deleted_at IS NULL`, id);
    return row ?? null;
  }

  function createExpense(input: ExpenseInput): TripExpense {
    const now = nowUTCISO();
    const id = uuid();
    db.runSync(
      `INSERT INTO trip_expense (id, trip_id, title, category, custom_category_label, currency, amount, expense_date, note,
        schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      id,
      input.tripId,
      input.title,
      input.category,
      input.customCategoryLabel ?? null,
      input.currency,
      input.amount,
      input.date,
      input.note ?? null,
      now,
      now,
    );
    invalidateQueries(db);
    return getExpense(id)!;
  }

  function updateExpense(id: string, input: Partial<ExpenseInput>): TripExpense {
    const current = getExpense(id);
    if (!current) throw new Error(`Expense not found: ${id}`);
    const now = nowUTCISO();
    db.runSync(
      `UPDATE trip_expense SET title = ?, category = ?, custom_category_label = ?, currency = ?, amount = ?,
        expense_date = ?, note = ?, updated_at = ? WHERE id = ?`,
      input.title ?? current.title,
      input.category ?? current.category,
      input.customCategoryLabel !== undefined ? input.customCategoryLabel : current.customCategoryLabel,
      input.currency ?? current.currency,
      input.amount ?? current.amount,
      input.date ?? current.date,
      input.note !== undefined ? input.note : current.note,
      now,
      id,
    );
    invalidateQueries(db);
    return getExpense(id)!;
  }

  function deleteExpense(id: string): void {
    db.runSync(`UPDATE trip_expense SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowUTCISO(), nowUTCISO(), id);
    invalidateQueries(db);
  }

  return {
    listTrips,
    getTrip,
    createTrip,
    updateTrip,
    deleteTrip,
    listTripCountries,
    listExpenses,
    getExpense,
    createExpense,
    updateExpense,
    deleteExpense,
  };
}

export type TripRepo = ReturnType<typeof createTripRepo>;

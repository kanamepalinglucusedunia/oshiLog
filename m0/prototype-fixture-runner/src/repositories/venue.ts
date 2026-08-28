import type { SqliteLike } from '@/db/types';
import { withSavepointSync } from '@/db/transaction';
import type { CountryCode, CurrencyCode, Venue, VenueDrinkPrice } from '@/types/domain';
import { nowUTCISO } from '@/utils/date';
import { uuid } from '@/utils/id';
import { cachedQuery, invalidateQueries } from '@/utils/queryCache';

export interface VenueInput {
  name: string;
  country: CountryCode;
  region?: string | null;
  address?: string | null;
  isFavorite?: boolean;
  notes?: string | null;
}

export interface DrinkPriceInput {
  venueId: string;
  label?: string | null;
  currency: CurrencyCode;
  price: number;
  isArchived?: boolean;
  isDefault?: boolean;
}

export interface DrinkPriceUpdate {
  label?: string | null;
  currency?: CurrencyCode;
  price?: number;
  isArchived?: boolean;
  isDefault?: boolean;
}

const VENUE_COLS = `
  id, name, country, region, address, is_favorite AS isFavorite, notes,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const PRICE_COLS = `
  id, venue_id AS venueId, label, currency, price, is_archived AS isArchived, is_default AS isDefault,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

export function createVenueRepo(db: SqliteLike) {
  function insertVenue(input: VenueInput): string {
    const now = nowUTCISO();
    const id = uuid();
    db.runSync(
      `INSERT INTO venue (id, name, country, region, address, is_favorite, notes, schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      id,
      input.name,
      input.country,
      input.region ?? null,
      input.address ?? null,
      input.isFavorite ? 1 : 0,
      input.notes ?? null,
      now,
      now,
    );
    return id;
  }

  function listVenues(): Venue[] {
    return cachedQuery(db, 'venue:list', () => {
      const rows = db.getAllSync<Venue>(`SELECT ${VENUE_COLS} FROM venue WHERE deleted_at IS NULL ORDER BY is_favorite DESC, name COLLATE NOCASE`);
      return rows.map((r) => ({ ...r, isFavorite: !!r.isFavorite }));
    });
  }

  function getVenue(id: string): Venue | null {
    const row = db.getFirstSync<Venue>(`SELECT ${VENUE_COLS} FROM venue WHERE id = ? AND deleted_at IS NULL`, id);
    return row ? { ...row, isFavorite: !!row.isFavorite } : null;
  }

  function createVenue(input: VenueInput): Venue {
    const id = insertVenue(input);
    invalidateQueries(db);
    return getVenue(id)!;
  }

  function updateVenue(id: string, input: Partial<VenueInput>): Venue {
    const current = getVenue(id);
    if (!current) throw new Error(`Venue not found: ${id}`);
    const now = nowUTCISO();
    db.runSync(
      `UPDATE venue SET name = ?, country = ?, region = ?, address = ?, is_favorite = ?, notes = ?, updated_at = ? WHERE id = ?`,
      input.name ?? current.name,
      input.country ?? current.country,
      input.region !== undefined ? input.region : current.region,
      input.address !== undefined ? input.address : current.address,
      input.isFavorite !== undefined ? (input.isFavorite ? 1 : 0) : current.isFavorite ? 1 : 0,
      input.notes !== undefined ? input.notes : current.notes,
      now,
      id,
    );
    invalidateQueries(db);
    return getVenue(id)!;
  }

  function deleteVenue(id: string): void {
    db.runSync(`UPDATE venue SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowUTCISO(), nowUTCISO(), id);
    invalidateQueries(db);
  }

  // --- Drink prices ---

  function listDrinkPrices(venueId: string, includeArchived = true): VenueDrinkPrice[] {
    const rows = db.getAllSync<VenueDrinkPrice>(
      `SELECT ${PRICE_COLS} FROM venue_drink_price WHERE venue_id = ? AND deleted_at IS NULL AND (? = 1 OR is_archived = 0) ORDER BY is_default DESC, price`,
      venueId,
      includeArchived ? 1 : 0,
    );
    return rows.map((r) => ({ ...r, isArchived: !!r.isArchived, isDefault: !!r.isDefault }));
  }

  function getDrinkPrice(id: string): VenueDrinkPrice | null {
    const row = db.getFirstSync<VenueDrinkPrice>(`SELECT ${PRICE_COLS} FROM venue_drink_price WHERE id = ? AND deleted_at IS NULL`, id);
    return row ? { ...row, isArchived: !!row.isArchived, isDefault: !!row.isDefault } : null;
  }

  function createDrinkPrice(input: DrinkPriceInput): VenueDrinkPrice {
    let id = '';
    withSavepointSync(db, () => {
      if (input.isDefault) clearDefaultForVenue(input.venueId);
      id = insertDrinkPrice(input);
    });
    invalidateQueries(db);
    return getDrinkPrice(id)!;
  }

  function clearDefaultForVenue(venueId: string, exceptId?: string): void {
    const now = nowUTCISO();
    db.runSync(
      `UPDATE venue_drink_price
       SET is_default = 0, updated_at = ?
       WHERE venue_id = ? AND deleted_at IS NULL AND is_default = 1 AND (? IS NULL OR id != ?)`,
      now,
      venueId,
      exceptId ?? null,
      exceptId ?? null,
    );
  }

  function insertDrinkPrice(input: DrinkPriceInput): string {
    if (input.isDefault && input.isArchived) throw new Error('An archived drink cannot be the default.');
    const now = nowUTCISO();
    const id = uuid();
    db.runSync(
      `INSERT INTO venue_drink_price (id, venue_id, label, currency, price, is_archived, is_default, schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      id,
      input.venueId,
      input.label ?? null,
      input.currency,
      input.price,
      input.isArchived ? 1 : 0,
      input.isDefault ? 1 : 0,
      now,
      now,
    );
    return id;
  }

  function updateDrinkPrice(id: string, input: DrinkPriceUpdate): VenueDrinkPrice {
    const current = getDrinkPrice(id);
    if (!current) throw new Error(`Drink price not found: ${id}`);
    const now = nowUTCISO();
    const isArchived = input.isArchived !== undefined ? input.isArchived : current.isArchived;
    const isDefault = isArchived ? false : input.isDefault !== undefined ? input.isDefault : current.isDefault;
    withSavepointSync(db, () => {
      if (isDefault) clearDefaultForVenue(current.venueId, id);
      db.runSync(
        `UPDATE venue_drink_price SET label = ?, currency = ?, price = ?, is_archived = ?, is_default = ?, updated_at = ? WHERE id = ?`,
        input.label !== undefined ? input.label : current.label,
        input.currency ?? current.currency,
        input.price !== undefined ? input.price : current.price,
        isArchived ? 1 : 0,
        isDefault ? 1 : 0,
        now,
        id,
      );
    });
    invalidateQueries(db);
    return getDrinkPrice(id)!;
  }

  function setDefaultDrinkPrice(id: string): VenueDrinkPrice {
    const current = getDrinkPrice(id);
    if (!current) throw new Error(`Drink price not found: ${id}`);
    if (current.isArchived) throw new Error('An archived drink cannot be the default.');
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      clearDefaultForVenue(current.venueId, id);
      db.runSync(`UPDATE venue_drink_price SET is_default = 1, updated_at = ? WHERE id = ?`, now, id);
    });
    invalidateQueries(db);
    return getDrinkPrice(id)!;
  }

  function isDrinkPriceUsed(price: VenueDrinkPrice): boolean {
    const row = db.getFirstSync<{ used: number }>(
      `SELECT 1 AS used FROM event
       WHERE venue_id = ? AND drink_currency = ? AND drink_amount = ? AND deleted_at IS NULL
       LIMIT 1`,
      price.venueId,
      price.currency,
      price.price,
    );
    return Boolean(row?.used);
  }

  function deleteDrinkPrice(id: string): void {
    const current = getDrinkPrice(id);
    if (!current) return;
    if (isDrinkPriceUsed(current)) {
      throw new Error('Cannot delete a drink price that is already used by a venue visit.');
    }
    const now = nowUTCISO();
    db.runSync(`UPDATE venue_drink_price SET is_default = 0, deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id);
    invalidateQueries(db);
  }

  function migrateVenueWithinSavepoint(sourceId: string, targetId: string): void {
    if (sourceId === targetId) throw new Error('A venue cannot be migrated to itself.');

    const source = getVenue(sourceId);
    const target = getVenue(targetId);
    if (!source) throw new Error('Source venue not found.');
    if (!target) throw new Error('Target venue not found.');

    const now = nowUTCISO();
    db.runSync(
      `UPDATE event SET venue_id = ?, updated_at = ? WHERE venue_id = ? AND deleted_at IS NULL`,
      targetId,
      now,
      sourceId,
    );

    const sourcePrices = db.getAllSync<{ id: string; currency: CurrencyCode; price: number; isDefault: number }>(
      `SELECT id, currency, price, is_default AS isDefault FROM venue_drink_price
       WHERE venue_id = ? AND deleted_at IS NULL AND is_archived = 0`,
      sourceId,
    );
    const targetPrices = db.getAllSync<{ id: string; currency: CurrencyCode; price: number; isDefault: number }>(
      `SELECT id, currency, price, is_default AS isDefault FROM venue_drink_price
       WHERE venue_id = ? AND deleted_at IS NULL AND is_archived = 0`,
      targetId,
    );
    const targetPriceKeys = new Set(targetPrices.map((price) => `${price.currency}:${price.price}`));
    let targetHasDefault = targetPrices.some((price) => !!price.isDefault);

    for (const price of sourcePrices) {
      const key = `${price.currency}:${price.price}`;
      if (targetPriceKeys.has(key)) {
        if (price.isDefault && !targetHasDefault) {
          const targetPrice = targetPrices.find((candidate) => `${candidate.currency}:${candidate.price}` === key);
          if (targetPrice) {
            db.runSync(`UPDATE venue_drink_price SET is_default = 1, updated_at = ? WHERE id = ?`, now, targetPrice.id);
            targetHasDefault = true;
          }
        }
        db.runSync(`UPDATE venue_drink_price SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, price.id);
        continue;
      }
      const keepAsDefault = !!price.isDefault && !targetHasDefault;
      db.runSync(`UPDATE venue_drink_price SET venue_id = ?, is_default = ?, updated_at = ? WHERE id = ?`, targetId, keepAsDefault ? 1 : 0, now, price.id);
      if (keepAsDefault) targetHasDefault = true;
      targetPriceKeys.add(key);
    }

    db.runSync(`UPDATE venue SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, sourceId);
  }

  function migrateVenue(sourceId: string, targetId: string): void {
    withSavepointSync(db, () => migrateVenueWithinSavepoint(sourceId, targetId));
    invalidateQueries(db);
  }

  function createVenueAndMigrate(input: VenueInput, sourceId: string, initialDrinkPrice?: Omit<DrinkPriceInput, 'venueId'>): Venue {
    let targetId = '';
    withSavepointSync(db, () => {
      targetId = insertVenue(input);
      if (initialDrinkPrice) {
        insertDrinkPrice({ ...initialDrinkPrice, venueId: targetId });
      }
      migrateVenueWithinSavepoint(sourceId, targetId);
    });
    invalidateQueries(db);
    return getVenue(targetId)!;
  }

  return {
    listVenues,
    getVenue,
    createVenue,
    updateVenue,
    deleteVenue,
    listDrinkPrices,
    getDrinkPrice,
    createDrinkPrice,
    updateDrinkPrice,
    setDefaultDrinkPrice,
    deleteDrinkPrice,
    migrateVenue,
    createVenueAndMigrate,
  };
}

export type VenueRepo = ReturnType<typeof createVenueRepo>;

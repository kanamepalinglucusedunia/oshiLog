import type { SqliteLike } from '@/db/types';
import type { CountryCode, Region } from '@/types/domain';
import { nowUTCISO } from '@/utils/date';
import { uuid } from '@/utils/id';
import { invalidateQueries } from '@/utils/queryCache';

export interface RegionInput {
  country: CountryCode;
  name: string;
}

const REGION_COLS = `
  id, country, name,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

export function createRegionRepo(db: SqliteLike) {
  function listRegions(country?: CountryCode | null): Region[] {
    const rows = db.getAllSync<Region>(
      country
        ? `SELECT ${REGION_COLS} FROM region WHERE deleted_at IS NULL AND country = ? ORDER BY name COLLATE NOCASE`
        : `SELECT ${REGION_COLS} FROM region WHERE deleted_at IS NULL ORDER BY country, name COLLATE NOCASE`,
      ...(country ? [country] : []),
    );
    return rows;
  }

  function getRegion(id: string): Region | null {
    const row = db.getFirstSync<Region>(`SELECT ${REGION_COLS} FROM region WHERE id = ? AND deleted_at IS NULL`, id);
    return row ?? null;
  }

  function findRegion(country: CountryCode, name: string): Region | null {
    const row = db.getFirstSync<Region>(
      `SELECT ${REGION_COLS} FROM region WHERE country = ? AND name = ? COLLATE NOCASE AND deleted_at IS NULL`,
      country,
      name,
    );
    return row ?? null;
  }

  function createRegion(input: RegionInput): Region {
    const existing = findRegion(input.country, input.name);
    if (existing) return existing;
    const now = nowUTCISO();
    const id = uuid();
    db.runSync(
      `INSERT INTO region (id, country, name, schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, 1, ?, ?, NULL)`,
      id,
      input.country,
      input.name.trim(),
      now,
      now,
    );
    invalidateQueries(db);
    return getRegion(id)!;
  }

  function ensureRegion(input: RegionInput): Region {
    return createRegion(input);
  }

  function deleteRegion(id: string): void {
    db.runSync(`DELETE FROM region WHERE id = ?`, id);
    invalidateQueries(db);
  }

  return { listRegions, getRegion, findRegion, createRegion, ensureRegion, deleteRegion };
}

export type RegionRepo = ReturnType<typeof createRegionRepo>;

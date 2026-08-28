import { Directory, File, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import { z } from 'zod';
import type { SqliteLike } from '@/db/types';
import { MIGRATIONS } from '@/db/schema';
import { nowUTCISO } from '@/utils/date';
import { sha256Hex } from '@/utils/id';
import { invalidateQueries } from '@/utils/queryCache';
import { createEventRepo } from '@/repositories/event';
import { createSettingsRepo } from '@/repositories/settings';
import { COUNTRIES } from '@/types/domain';
import { CURRENCY_CODES } from '@/utils/money';
import { ORIGINALS_DIR, ensureAppDirs } from './media';

export const BACKUPS_DIR = new Directory(Paths.document, 'oshilog', 'backups');
export const DATA_BACKUP_PREFIX = 'oshilog-data-';
export const MEDIA_BACKUP_PREFIX = 'oshilog-media-';
export const SAFETY_PREFIX = 'oshilog-safety-';
export const MAX_SNAPSHOTS_PER_CATEGORY = 5;
export const BACKUP_FORMAT_VERSION = 2;
export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 1;
const MAX_BACKUP_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BACKUP_RECORDS = 250_000;
const MAX_BACKUP_STRING_LENGTH = 100_000;
const SAFE_MEDIA_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const COUNTRY_CODES = new Set<string>(COUNTRIES.map((country) => country.code));
const CURRENCIES = new Set<string>(CURRENCY_CODES);

const TABLE_COLUMNS: Record<string, readonly string[]> = {
  app_settings: ['id', 'surface_style', 'theme_mode', 'accent_color', 'home_header_label', 'onboarding_completed', 'data_reminder_frequency', 'media_reminder_frequency', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  country_preference: ['id', 'country', 'is_active', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  region: ['id', 'country', 'name', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  member_color: ['id', 'name', 'hex', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  media_asset: ['id', 'kind', 'content_hash', 'mime_type', 'file_size', 'width', 'height', 'duration_ms', 'local_path', 'thumbnail_path', 'instax_preset', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  idol: ['id', 'name', 'photo_media_id', 'x_profile_url', 'instagram_profile_url', 'tiktok_profile_url', 'country', 'region', 'birth_date', 'member_color', 'status', 'is_favorite', 'notes', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  groups: ['id', 'name', 'photo_media_id', 'x_profile_url', 'instagram_profile_url', 'tiktok_profile_url', 'country', 'region', 'debut_date', 'end_date', 'is_favorite', 'notes', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  group_membership: ['id', 'idol_id', 'group_id', 'start_date', 'end_date', 'name', 'member_color', 'status', 'hiatus_start_date', 'hiatus_end_date', 'is_main', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  group_membership_status_period: ['id', 'group_membership_id', 'status', 'start_date', 'end_date', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  idol_name_history: ['id', 'idol_id', 'group_membership_id', 'name', 'effective_at', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  cheki_type: ['id', 'idol_id', 'label', 'currency', 'unit_price', 'is_archived', 'is_default', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  venue: ['id', 'name', 'country', 'region', 'address', 'is_favorite', 'notes', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  venue_drink_price: ['id', 'venue_id', 'label', 'currency', 'price', 'is_archived', 'is_default', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  trip: ['id', 'title', 'start_date', 'end_date', 'description', 'is_favorite', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  trip_country: ['id', 'trip_id', 'country', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  trip_expense: ['id', 'trip_id', 'title', 'category', 'custom_category_label', 'currency', 'amount', 'expense_date', 'note', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  event: ['id', 'title', 'event_date', 'country', 'venue_id', 'trip_id', 'ticket_currency', 'ticket_amount', 'drink_currency', 'drink_amount', 'notes', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  cheki_entry: ['id', 'event_id', 'idol_id', 'group_membership_id', 'cheki_type_id', 'quantity', 'currency', 'unit_price', 'subtotal', 'idol_name_snapshot', 'group_name_snapshot', 'cheki_type_label_snapshot', 'schema_version', 'created_at', 'updated_at', 'deleted_at'],
  idol_media: ['media_asset_id', 'idol_id', 'sort_order', 'idol_name_snapshot', 'group_name_snapshot', 'created_at', 'updated_at'],
  group_media: ['media_asset_id', 'group_id', 'sort_order', 'created_at', 'updated_at'],
  cheki_entry_media: ['media_asset_id', 'cheki_entry_id', 'position', 'created_at', 'updated_at'],
};

/** Parent tables precede every table that references them. */
export const BACKUP_TABLES = [
  'app_settings',
  'country_preference',
  'region',
  'member_color',
  'media_asset',
  'idol',
  'groups',
  'group_membership',
  'group_membership_status_period',
  'idol_name_history',
  'cheki_type',
  'venue',
  'venue_drink_price',
  'trip',
  'trip_country',
  'trip_expense',
  'event',
  'cheki_entry',
  'idol_media',
  'group_media',
  'cheki_entry_media',
] as const;

export interface BackupManifest {
  formatVersion: 1 | 2;
  category: 'data' | 'media';
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  deviceLabel: string;
  recordCounts: Record<string, number>;
  checksums: Record<string, string>;
  records: Record<string, Record<string, unknown>[]>;
  media?: {
    id: string;
    kind: string;
    contentHash: string | null;
    mimeType: string | null;
    size: number | null;
    fileName: string | null;
  }[];
}

export interface RestorePreview {
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
  missingMedia: number;
}

export interface RestoreResult extends RestorePreview {
  safetySnapshotPath: string;
}

const manifestEnvelopeSchema = z.object({
  formatVersion: z.number().int(),
  category: z.enum(['data', 'media']),
  appVersion: z.string().min(1).max(100),
  schemaVersion: z.number().int().positive(),
  createdAt: z.string().min(1).max(100),
  deviceLabel: z.string().max(500),
  recordCounts: z.record(z.string(), z.number().int().nonnegative()),
  checksums: z.record(z.string(), z.string()),
  records: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  media: z.array(z.object({
    id: z.string().min(1),
    kind: z.string().min(1),
    contentHash: z.string().nullable(),
    mimeType: z.string().nullable(),
    size: z.number().nullable(),
    fileName: z.string().nullable(),
  }).strict()).optional(),
}).strict();

function ensureBackupsDir(): void {
  ensureAppDirs();
  if (!BACKUPS_DIR.exists) BACKUPS_DIR.create({ intermediates: true, idempotent: true });
}

/** Exports every sync-able table as raw rows into a normalized manifest. */
export function exportDataManifest(db: SqliteLike, deviceLabel = 'this device'): BackupManifest {
  return collectDataManifest(db, deviceLabel, true);
}

function collectDataManifest(db: SqliteLike, deviceLabel: string, ensureSettings: boolean): BackupManifest {
  if (ensureSettings) createSettingsRepo(db).getSettings();
  const now = nowUTCISO();
  const records: Record<string, Record<string, unknown>[]> = {};
  const recordCounts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = db.getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`);
    records[table] = rows;
    recordCounts[table] = rows.length;
  }
  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    category: 'data',
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now,
    deviceLabel,
    recordCounts,
    checksums: {},
    records,
  };
  return manifest;
}

async function manifestChecksum(manifest: BackupManifest): Promise<string> {
  return sha256Hex(JSON.stringify({ ...manifest, checksums: {} }));
}

export async function sealManifest(manifest: BackupManifest): Promise<BackupManifest> {
  manifest.checksums = {};
  manifest.checksums.all = await manifestChecksum(manifest);
  return manifest;
}

export async function verifyManifestChecksum(manifest: BackupManifest): Promise<void> {
  const expected = manifest.checksums.all;
  if (!expected) throw new Error('Backup checksum is missing');
  const actual = await manifestChecksum(manifest);
  if (actual !== expected) throw new Error('Backup checksum mismatch; the file may be corrupted or modified');
}

/** Serializes the manifest to a file and returns its path. */
export async function writeDataBackup(db: SqliteLike, deviceLabel?: string): Promise<{ path: string; manifest: BackupManifest }> {
  ensureBackupsDir();
  const manifest = await sealManifest(exportDataManifest(db, deviceLabel));
  const path = `${BACKUPS_DIR.uri}/${DATA_BACKUP_PREFIX}${Date.now()}.json`;
  const file = new File(path);
  file.create({ intermediates: true, overwrite: true });
  file.write(JSON.stringify(manifest, null, 2));
  recordSnapshot(db, 'data', path, manifest);
  pruneSnapshots(db, 'data');
  return { path, manifest };
}

function recordSnapshot(
  db: SqliteLike,
  category: 'data' | 'media',
  path: string,
  manifest: BackupManifest,
  status: 'ok' | 'partial' = 'ok',
  size: number | null = null,
): void {
  const now = nowUTCISO();
  db.runSync(
    `INSERT INTO backup_snapshot (id, category, device_label, manifest, status, file_id, size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    manifest.deviceLabel,
    JSON.stringify(manifest.checksums),
    status,
    path,
    size,
    now,
    now,
  );
}

export function pruneSnapshots(db: SqliteLike, category: 'data' | 'media'): void {
  const rows = db.getAllSync<{ id: string; file_id: string | null }>(
    `SELECT id, file_id FROM backup_snapshot WHERE category = ? ORDER BY created_at DESC`,
    category,
  );
  const keep = rows.slice(0, MAX_SNAPSHOTS_PER_CATEGORY);
  for (const old of rows.slice(MAX_SNAPSHOTS_PER_CATEGORY)) {
    try {
      if (old.file_id) new File(old.file_id).delete();
    } catch {
      // ignore missing files
    }
    db.runSync(`DELETE FROM backup_snapshot WHERE id = ?`, old.id);
  }
  void keep;
}

export interface BackupSnapshotRow {
  id: string;
  category: string;
  device_label: string;
  created_at: string;
  status: string;
  file_id: string | null;
}

export function listSnapshots(db: SqliteLike, category: 'data' | 'media'): BackupSnapshotRow[] {
  return db.getAllSync<BackupSnapshotRow>(
    `SELECT id, category, device_label, created_at, status, file_id FROM backup_snapshot WHERE category = ? ORDER BY created_at DESC`,
    category,
  );
}

/** Removes the artifact first, then its history row so the UI never reports a deleted backup that still exists. */
export function deleteSnapshot(db: SqliteLike, snapshotId: string): void {
  const snapshot = db.getFirstSync<{ category: 'data' | 'media'; file_id: string | null }>(
    `SELECT category, file_id FROM backup_snapshot WHERE id = ?`,
    snapshotId,
  );
  if (!snapshot) return;
  if (snapshot.file_id) {
    if (snapshot.category === 'media') {
      const directory = new Directory(snapshot.file_id);
      if (directory.exists) directory.delete();
    } else {
      const file = new File(snapshot.file_id);
      if (file.exists) file.delete();
    }
  }
  db.runSync(`DELETE FROM backup_snapshot WHERE id = ?`, snapshotId);
}

export function readManifest(path: string): BackupManifest {
  const file = new File(path);
  if (!file.exists) throw new Error('Backup file does not exist');
  if (file.size > MAX_BACKUP_FILE_BYTES) throw new Error('Backup file exceeds the 50 MB safety limit');
  const parsed: unknown = JSON.parse(file.textSync());
  const validation = validateManifest(parsed);
  if (!validation.ok) throw new Error(validation.error);
  return parsed as BackupManifest;
}

export function validateManifest(manifest: unknown): { ok: boolean; error?: string } {
  const parsed = manifestEnvelopeSchema.safeParse(manifest);
  if (!parsed.success) return { ok: false, error: `Invalid backup structure: ${parsed.error.issues[0]?.message ?? 'unknown error'}` };
  const data = parsed.data;
  if (data.formatVersion !== 1 && data.formatVersion !== BACKUP_FORMAT_VERSION) {
    return { ok: false, error: `Unsupported format version ${data.formatVersion}` };
  }
  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: `Backup schema ${data.schemaVersion} is newer than supported schema ${CURRENT_SCHEMA_VERSION}` };
  }

  let totalRecords = 0;
  for (const [table, rows] of Object.entries(data.records)) {
    const allowedColumns = TABLE_COLUMNS[table];
    if (!allowedColumns) return { ok: false, error: `Unknown backup table: ${table}` };
    totalRecords += rows.length;
    if (totalRecords > MAX_BACKUP_RECORDS) return { ok: false, error: 'Backup contains too many records' };
    const allowed = new Set(allowedColumns);
    for (const row of rows) {
      const unknownColumn = Object.keys(row).find((column) => !allowed.has(column));
      if (unknownColumn) return { ok: false, error: `Unknown column ${table}.${unknownColumn}` };
      const identity = row[identityColumn(table)];
      if (typeof identity !== 'string' || identity.length === 0) {
        return { ok: false, error: `Missing record identity for ${table}` };
      }
      if (identity.length > 500) return { ok: false, error: `Record identity is too long for ${table}` };
      for (const [column, value] of Object.entries(row)) {
        if (value === null) continue;
        if (typeof value === 'string') {
          if (value.length > MAX_BACKUP_STRING_LENGTH) return { ok: false, error: `Value is too long for ${table}.${column}` };
        } else if (typeof value === 'number') {
          if (!Number.isSafeInteger(value)) return { ok: false, error: `Invalid number for ${table}.${column}` };
        } else {
          return { ok: false, error: `Invalid value type for ${table}.${column}` };
        }
        if (column === 'country' && typeof value === 'string' && !COUNTRY_CODES.has(value)) {
          return { ok: false, error: `Invalid country for ${table}.${column}` };
        }
        if (column.endsWith('currency') && typeof value === 'string' && !CURRENCIES.has(value)) {
          return { ok: false, error: `Invalid currency for ${table}.${column}` };
        }
      }
    }
    if (data.recordCounts[table] !== undefined && data.recordCounts[table] !== rows.length) {
      return { ok: false, error: `Record count mismatch for ${table}` };
    }
  }
  for (const entry of data.media ?? []) {
    if (!SAFE_MEDIA_ID.test(entry.id)) return { ok: false, error: `Unsafe media identity: ${entry.id}` };
    if (entry.size !== null && (!Number.isSafeInteger(entry.size) || entry.size < 0)) {
      return { ok: false, error: `Invalid media size for ${entry.id}` };
    }
    for (const value of [entry.kind, entry.contentHash, entry.mimeType, entry.fileName]) {
      if (value !== null && value.length > 1_000) return { ok: false, error: `Media metadata is too long for ${entry.id}` };
    }
  }
  return { ok: true };
}

/**
 * Merge decision for a single record (PRD 9.6):
 * - Same UUID → the record with the newer updatedAt wins.
 * - Equal timestamps → local wins.
 * - The newest tombstone wins and prevents old data from reappearing.
 * Returns the row to persist, or null when the local row must stay untouched.
 */
export function pickWinner(
  local: Record<string, unknown> | null,
  backup: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!local) return backup;
  if (!backup) return null;

  const localDeleted = !!local.deleted_at;
  const backupDeleted = !!backup.deleted_at;
  const backupNewer = String(backup.updated_at ?? '') > String(local.updated_at ?? '');

  if (backupDeleted && !localDeleted) return backupNewer ? backup : null;
  if (!backupDeleted && localDeleted) return backupNewer ? backup : null;
  if (backupDeleted && localDeleted) return backupNewer ? backup : null;
  return backupNewer ? backup : null;
}

function buildRestorePreviewForTable(local: Record<string, unknown> | null, backup: Record<string, unknown> | null): 'added' | 'updated' | 'deleted' | 'skipped' {
  const winner = pickWinner(local, backup);
  if (!local && winner) return 'added';
  if (local && !winner) return 'skipped';
  if (winner && !!winner.deleted_at) return 'deleted';
  if (winner && local && String(winner.updated_at) !== String(local.updated_at)) return 'updated';
  if (winner && !local) return 'added';
  return 'skipped';
}

export function buildRestorePreview(db: SqliteLike, manifest: BackupManifest): RestorePreview {
  const validation = validateManifest(manifest);
  if (!validation.ok) throw new Error(validation.error);
  const preview: RestorePreview = { added: 0, updated: 0, deleted: 0, skipped: 0, missingMedia: 0 };
  for (const table of BACKUP_TABLES) {
    for (const backupRow of manifest.records[table] ?? []) {
      const idColumn = identityColumn(table);
      const id = String(backupRow[idColumn]);
      const local = db.getFirstSync<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${idColumn} = ?`, id);
      const kind = buildRestorePreviewForTable(local, backupRow);
      preview[kind] += 1;
    }
  }
  // Missing media: media_asset rows whose local file is not on disk.
  const mediaRows = db.getAllSync<{ local_path: string | null }>(`SELECT local_path FROM media_asset WHERE deleted_at IS NULL`);
  for (const row of mediaRows) {
    if (!row.local_path) {
      preview.missingMedia += 1;
      continue;
    }
    try {
      if (!new File(row.local_path).exists) preview.missingMedia += 1;
    } catch {
      preview.missingMedia += 1;
    }
  }
  return preview;
}

/** Rejects corrupted or modified backups before their contents reach the preview UI. */
export async function buildVerifiedRestorePreview(db: SqliteLike, manifest: BackupManifest): Promise<RestorePreview> {
  await verifyManifestChecksum(manifest);
  return buildRestorePreview(db, manifest);
}

function identityColumn(table: string): 'id' | 'media_asset_id' {
  return table.endsWith('_media') ? 'media_asset_id' : 'id';
}

function upsertRow(db: SqliteLike, table: string, row: Record<string, unknown>): void {
  const columns = TABLE_COLUMNS[table].filter((column) => Object.prototype.hasOwnProperty.call(row, column));
  const idColumn = identityColumn(table);
  const idValue = row[idColumn];

  // A restore can merge a backup default with a different local default.
  // Reconcile the default invariant before the unique partial index sees the
  // incoming row; older backups simply omit is_default and keep the DB default.
  if (
    table === 'venue_drink_price'
    && row.is_default === 1
    && row.is_archived !== 1
    && !row.deleted_at
    && typeof row.venue_id === 'string'
    && typeof idValue === 'string'
  ) {
    db.runSync(
      `UPDATE venue_drink_price SET is_default = 0 WHERE venue_id = ? AND id != ? AND deleted_at IS NULL`,
      row.venue_id,
      idValue,
    );
  }
  if (
    table === 'cheki_type'
    && row.is_default === 1
    && row.is_archived !== 1
    && !row.deleted_at
    && typeof row.idol_id === 'string'
    && typeof idValue === 'string'
  ) {
    db.runSync(
      `UPDATE cheki_type SET is_default = 0 WHERE idol_id = ? AND id != ? AND deleted_at IS NULL`,
      row.idol_id,
      idValue,
    );
  }

  const setClause = columns
    .filter((c) => c !== idColumn)
    .map((c) => `${c} = ?`)
    .join(', ');
  db.runSync(`UPDATE ${table} SET ${setClause} WHERE ${idColumn} = ?`, ...columns.filter((c) => c !== idColumn).map((c) => row[c]), idValue);
  const exists = db.getFirstSync<Record<string, unknown>>(`SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ?`, idValue);
  if (!exists) {
    const placeholders = columns.map(() => '?').join(', ');
    db.runSync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, ...columns.map((c) => row[c]));
  }
}

function applyRow(db: SqliteLike, table: string, row: Record<string, unknown> | null, id: string): void {
  if (!row) return;
  const idColumn = identityColumn(table);
  if (row.deleted_at !== undefined && !!row.deleted_at) {
    const existing = db.getFirstSync<Record<string, unknown>>(`SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ?`, id);
    if (existing) {
      db.runSync(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE ${idColumn} = ?`, row.deleted_at, row.updated_at ?? nowUTCISO(), id);
    } else {
      upsertRow(db, table, row);
    }
    return;
  }
  upsertRow(db, table, row);
}

/**
 * Applies a data restore merge in a single transaction. A safety snapshot of
 * the current database is created first; the path is returned with the result.
 */
export async function applyDataRestore(db: SqliteLike, manifest: BackupManifest): Promise<RestoreResult> {
  const validation = validateManifest(manifest);
  if (!validation.ok) throw new Error(validation.error);
  await verifyManifestChecksum(manifest);

  ensureBackupsDir();
  const safety = await sealManifest(collectDataManifest(db, 'safety-before-restore', false));
  const safetyPath = `${BACKUPS_DIR.uri}/${SAFETY_PREFIX}${Date.now()}.json`;
  const safetyFile = new File(safetyPath);
  safetyFile.create({ intermediates: true, overwrite: true });
  safetyFile.write(JSON.stringify(safety, null, 2));

  const preview = { added: 0, updated: 0, deleted: 0, skipped: 0, missingMedia: 0 };
  db.withTransactionSync(() => {
    for (const table of BACKUP_TABLES) {
      for (const backupRow of manifest.records[table] ?? []) {
        const idColumn = identityColumn(table);
        const id = String(backupRow[idColumn]);
        const local = db.getFirstSync<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${idColumn} = ?`, id);
        const winner = pickWinner(local, backupRow);
        const kind = buildRestorePreviewForTable(local, backupRow);
        if (winner) applyRow(db, table, winner, id);
        preview[kind] += 1;
      }
    }
  });

  invalidateQueries(db);

  const mediaRows = db.getAllSync<{ local_path: string | null }>(`SELECT local_path FROM media_asset WHERE deleted_at IS NULL`);
  for (const row of mediaRows) {
    if (!row.local_path) {
      preview.missingMedia += 1;
      continue;
    }
    try {
      if (!new File(row.local_path).exists) preview.missingMedia += 1;
    } catch {
      preview.missingMedia += 1;
    }
  }

  return { ...preview, safetySnapshotPath: safetyPath };
}

// --- Media backup ---

export interface MediaSnapshotEntry {
  id: string;
  kind: string;
  contentHash: string | null;
  mimeType: string | null;
  size: number | null;
  fileName: string | null;
}

export async function createMediaSnapshot(db: SqliteLike): Promise<{ path: string; manifest: BackupManifest; count: number; missing: number }> {
  ensureBackupsDir();
  const rows = db.getAllSync<MediaSnapshotEntry>(
    `SELECT id, kind, content_hash AS contentHash, mime_type AS mimeType, file_size AS size, local_path AS fileName
     FROM media_asset WHERE deleted_at IS NULL AND local_path IS NOT NULL`,
  );
  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    category: 'media',
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: nowUTCISO(),
    deviceLabel: 'this device',
    recordCounts: { media_asset: rows.length },
    checksums: {},
    records: {},
    media: rows.map((r) => ({ ...r, fileName: r.fileName ? r.fileName.split('/').pop() ?? null : null })),
  };

  const dir = new Directory(BACKUPS_DIR, `${MEDIA_BACKUP_PREFIX}${Date.now()}`);
  dir.create({ intermediates: true });
  let copied = 0;
  let missing = 0;
  for (const row of rows) {
    if (!row.fileName) {
      missing += 1;
      continue;
    }
    try {
      const src = new File(row.fileName);
      if (src.exists) {
        src.copy(new File(dir, row.id));
        copied += 1;
      } else {
        missing += 1;
      }
    } catch {
      missing += 1;
    }
  }
  await sealManifest(manifest);
  const manifestPath = `${dir.uri}/manifest.json`;
  new File(manifestPath).write(JSON.stringify(manifest, null, 2));
  recordSnapshot(db, 'media', dir.uri, manifest, missing > 0 ? 'partial' : 'ok', copied);
  pruneSnapshots(db, 'media');
  return { path: dir.uri, manifest, count: copied, missing };
}

export interface MediaRestoreResult {
  restored: number;
  skipped: number;
}

/** Copies backed-up media files into the app originals dir and relinks rows. */
export async function applyMediaRestore(db: SqliteLike, backupDir: string): Promise<MediaRestoreResult> {
  const manifest = readManifest(`${backupDir}/manifest.json`);
  const validation = validateManifest(manifest);
  if (!validation.ok) throw new Error(validation.error);
  if (manifest.category !== 'media') throw new Error('Not a media backup');
  await verifyManifestChecksum(manifest);

  ensureAppDirs();
  let restored = 0;
  let skipped = 0;
  for (const entry of manifest.media ?? []) {
    const srcFile = new File(new Directory(backupDir), entry.id);
    if (!srcFile.exists) {
      skipped += 1;
      continue;
    }
    const destFile = new File(ORIGINALS_DIR, entry.id);
    srcFile.copy(destFile);
    createEventRepo(db).relinkMedia(entry.id, destFile.uri);
    restored += 1;
  }
  return { restored, skipped };
}

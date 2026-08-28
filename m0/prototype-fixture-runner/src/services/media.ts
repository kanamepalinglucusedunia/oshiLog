import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageManipulatorContext, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { SqliteLike } from '@/db/types';
import { uuid, sha256Hex } from '@/utils/id';
import { createEventRepo } from '@/repositories/event';
import { nowUTCISO } from '@/utils/date';
import { invalidateQueries } from '@/utils/queryCache';
import { type PerspectiveQuad } from '@/utils/geometry';
import type { StoredInstaxPreset } from '@/types/domain';
import { perspectiveWarpUri } from './perspective';

export const APP_ROOT = new Directory(Paths.document, 'oshilog');
export const ORIGINALS_DIR = new Directory(APP_ROOT, 'originals');
export const THUMBNAILS_DIR = new Directory(APP_ROOT, 'thumbnails');
export const STAGING_DIR = new Directory(APP_ROOT, 'staging');

export function ensureAppDirs(): void {
  for (const dir of [APP_ROOT, ORIGINALS_DIR, THUMBNAILS_DIR, STAGING_DIR]) {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  }
}

/** Deletes local files for soft-deleted media while retaining their database tombstones for restore merge safety. */
export function cleanupTombstonedMedia(db: SqliteLike): { cleaned: number; failed: number } {
  const rows = db.getAllSync<{ id: string; localPath: string | null; thumbnailPath: string | null }>(
    `SELECT id, local_path AS localPath, thumbnail_path AS thumbnailPath
     FROM media_asset
     WHERE deleted_at IS NOT NULL AND (local_path IS NOT NULL OR thumbnail_path IS NOT NULL)`,
  );
  let cleaned = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      for (const path of new Set([row.localPath, row.thumbnailPath].filter((value): value is string => !!value))) {
        const file = new File(path);
        if (file.exists) file.delete();
      }
      db.runSync(
        `UPDATE media_asset SET local_path = NULL, thumbnail_path = NULL, file_size = NULL, updated_at = ? WHERE id = ?`,
        nowUTCISO(),
        row.id,
      );
      cleaned += 1;
    } catch {
      failed += 1;
    }
  }
  if (cleaned > 0) invalidateQueries(db);
  return { cleaned, failed };
}

export const THUMBNAIL_MAX_SIZE = 480;

/**
 * Hashing bound for large media: only the first few MB are read into memory
 * (videos can be hundreds of MB; reading them fully would spike JS memory).
 * Combined with a file-size comparison in dedup this is collision-safe for
 * practical purposes.
 */
const HASH_SAMPLE_MAX_BYTES = 4 * 1024 * 1024;
const HASH_CHUNK_BYTES = 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Hashes a file without loading it entirely into JS memory. Small files
 * (photos after sanitization) are hashed whole; large files (videos) are
 * hashed from a bounded sample of the first bytes.
 */
async function fileHash(file: File): Promise<string> {
  if (file.size <= HASH_SAMPLE_MAX_BYTES) {
    return sha256Hex(await file.base64());
  }
  const handle = file.open();
  try {
    const chunks: Uint8Array[] = [];
    let remaining = HASH_SAMPLE_MAX_BYTES;
    while (remaining > 0) {
      const bytes = handle.readBytes(Math.min(remaining, HASH_CHUNK_BYTES));
      if (bytes.length === 0) break;
      chunks.push(bytes);
      remaining -= bytes.length;
    }
    const merged = new Uint8Array(chunks.reduce((total, c) => total + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return sha256Hex(bytesToBase64(merged));
  } finally {
    handle.close();
  }
}

export function extFromMime(mimeType: string | null, fallback: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'jpg',
    'image/heif': 'jpg',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  if (mimeType && map[mimeType]) return map[mimeType];
  return fallback;
}

/**
 * Regenerates a best-effort JPEG thumbnail for a restored media asset. Used by
 * cloud restore because thumbnails are intentionally not part of the canonical
 * blob set (they are always regenerable locally).
 */
export async function regenerateThumbnail(db: SqliteLike, assetId: string, sourcePath: string): Promise<boolean> {
  try {
    const rendered = await ImageManipulator.manipulate(sourcePath).renderAsync();
    const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(rendered.width, rendered.height));
    let context = ImageManipulator.manipulate(rendered);
    if (scale < 1) {
      context = context.resize({
        width: Math.max(1, Math.round(rendered.width * scale)),
        height: Math.max(1, Math.round(rendered.height * scale)),
      });
    }
    const thumbRendered = await context.renderAsync();
    const thumb = await thumbRendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    const thumbFile = new File(thumb.uri);
    const dest = new File(THUMBNAILS_DIR, `${assetId}.jpg`);
    await thumbFile.copy(dest);
    thumbFile.delete();
    createEventRepo(db).updateMediaAsset(assetId, { thumbnailPath: dest.uri });
    return true;
  } catch {
    return false;
  }
}

/**
 * Imports an image into app-owned storage:
 * 1. Re-encodes via ImageManipulator to strip EXIF (including GPS).
 * 2. Hashes content and deduplicates against existing media.
 * 3. Generates a thumbnail from the same in-memory render (single decode).
 */
export async function importImageFromUri(
  db: SqliteLike,
  uri: string,
  kind: 'cheki' | 'photo',
  options?: ImportOptions,
): Promise<ImportedMedia> {
  const repo = createEventRepo(db);
  const instaxPreset = kind === 'cheki' ? options?.instaxPreset ?? 'mini' : null;
  ensureAppDirs();

  const context = ImageManipulator.manipulate(uri);
  const rendered = await (options?.transform ? applyImageTransform(context, options.transform) : context).renderAsync();
  const sanitized = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.92,
  });
  const { width, height } = rendered;

  const sanitizedFile = new File(sanitized.uri);
  const hash = await fileHash(sanitizedFile);

  const existing = repo.findByContentHash(hash, kind);
  if (existing) {
    sanitizedFile.delete();
    // Honor a user-supplied date even for duplicates: the photo is considered
    // taken on that date and the album should group it there.
    if (options?.createdAt) {
      repo.updateMediaAsset(existing.id, { createdAt: options.createdAt });
    }
    options?.onImported?.(existing.id, { deduplicated: true });
    return { assetId: existing.id, deduplicated: true, thumbnailGenerated: !!existing.thumbnailPath, width, height };
  }

  const assetId = uuid();
  const destName = `${assetId}.jpg`;
  const destFile = new File(ORIGINALS_DIR, destName);
  let asset;
  try {
    await sanitizedFile.copy(destFile);
    sanitizedFile.delete();

    asset = repo.insertMediaAsset({
      id: assetId,
      kind,
      contentHash: hash,
      // ImageManipulator always re-encodes the persisted original as JPEG.
      mimeType: 'image/jpeg',
      fileSize: destFile.size,
      width,
      height,
      localPath: destFile.uri,
      instaxPreset,
      createdAt: options?.createdAt,
    });
  } catch (error) {
    try {
      if (destFile.exists) destFile.delete();
    } catch {
      // Preserve the original import error; a later orphan sweep can retry cleanup.
    }
    throw error;
  }

  options?.onImported?.(asset.id, { deduplicated: false });

  const thumbnailGenerated = await generateThumbnailFromRender(db, asset.id, rendered, width, height);
  return { assetId: asset.id, deduplicated: false, thumbnailGenerated, width, height };
}

/**
 * Generates a grid thumbnail (max 480px on the longest side) reusing the
 * already-decoded image from the import pipeline (no second full-size decode).
 */
async function generateThumbnailFromRender(
  db: SqliteLike,
  assetId: string,
  rendered: ImageRef,
  width: number,
  height: number,
): Promise<boolean> {
  try {
    const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height));
    let context = ImageManipulator.manipulate(rendered);
    if (scale < 1) {
      context = context.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) });
    }
    const thumbRendered = await context.renderAsync();
    const thumb = await thumbRendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });

    const thumbFile = new File(thumb.uri);
    const dest = new File(THUMBNAILS_DIR, `${assetId}.jpg`);
    await thumbFile.copy(dest);
    thumbFile.delete();

    createEventRepo(db).updateMediaAsset(assetId, { thumbnailPath: dest.uri });
    return true;
  } catch {
    // Thumbnails are regenerable; a failure is not fatal for import.
    return false;
  }
}

export interface ImportedMedia {
  assetId: string;
  deduplicated: boolean;
  /** False lets callers surface or retry a non-fatal thumbnail failure. */
  thumbnailGenerated?: boolean;
  /** Decoded dimensions of the persisted original (post-sanitization). */
  width?: number;
  height?: number;
}

export interface ImportOptions {
  onImported?: (assetId: string, result: { deduplicated: boolean }) => void;
  /** Records the media under this date (album grouping). Defaults to import time. */
  createdAt?: string;
  /** Preset is stored only for Cheki assets and remains immutable after deduplication. */
  instaxPreset?: StoredInstaxPreset;
  /** Applies flip/rotation/crop before the image is persisted. */
  transform?: ImportTransform;
}

export async function importVideoFromUri(
  db: SqliteLike,
  uri: string,
  options?: ImportOptions,
): Promise<ImportedMedia> {
  const repo = createEventRepo(db);
  ensureAppDirs();

  const tmp = new File(uri);
  const mimeType = tmp.type || null;
  const hash = await fileHash(tmp);

  const existing = repo.findByContentHash(hash, 'video', tmp.size);
  if (existing) {
    if (options?.createdAt) {
      repo.updateMediaAsset(existing.id, { createdAt: options.createdAt });
    }
    options?.onImported?.(existing.id, { deduplicated: true });
    return { assetId: existing.id, deduplicated: true };
  }

  const assetId = uuid();
  const ext = extFromMime(mimeType, 'mp4');
  const destFile = new File(ORIGINALS_DIR, `${assetId}.${ext}`);
  let asset;
  try {
    await tmp.copy(destFile);
    asset = repo.insertMediaAsset({
      id: assetId,
      kind: 'video',
      contentHash: hash,
      mimeType: mimeType ?? 'video/mp4',
      fileSize: destFile.size,
      width: null,
      height: null,
      durationMs: null,
      localPath: destFile.uri,
      createdAt: options?.createdAt,
    });
  } catch (error) {
    try {
      if (destFile.exists) destFile.delete();
    } catch {
      // Preserve the original import error; a later orphan sweep can retry cleanup.
    }
    throw error;
  }

  options?.onImported?.(asset.id, { deduplicated: false });
  return { assetId: asset.id, deduplicated: false };
}

export interface CropTransform {
  /** Clockwise rotation in degrees (90 / 180 / 270). */
  rotateDegrees?: 90 | 180 | 270;
  /** Horizontally mirrors the image before rotation. */
  flipped?: boolean;
  /** Crop rectangle in the image's pixel space AFTER flip and rotation. */
  crop?: { originX: number; originY: number; width: number; height: number };
  /**
   * Perspective correction: normalized corners (0..1) defined in the image's
   * pixel space AFTER flip and rotation. The quadrilateral is warped onto the
   * full frame. Mutually exclusive with `crop` (perspective wins).
   */
  perspective?: PerspectiveQuad;
}

export type ImportTransform = Pick<CropTransform, 'rotateDegrees' | 'flipped' | 'crop'>;

function applyImageTransform(context: ImageManipulatorContext, transform: CropTransform): ImageManipulatorContext {
  if (transform.flipped) context = context.flip('horizontal');
  if (transform.rotateDegrees) context = context.rotate(transform.rotateDegrees);
  if (!transform.perspective && transform.crop) {
    context = context.crop({
      originX: transform.crop.originX,
      originY: transform.crop.originY,
      width: transform.crop.width,
      height: transform.crop.height,
    });
  }
  return context;
}

/**
 * Applies an interactive crop transform (flip → rotate → crop) to a picked
 * image and returns the resulting file URI. Used between picking and import so
 * the hash/dedup pipeline sees the edited content.
 */
export async function cropImageUri(uri: string, transform: CropTransform): Promise<string> {
  const context = applyImageTransform(ImageManipulator.manipulate(uri), transform);

  // Perspective is applied to the oriented (post flip/rotate) image; the
  // corners are defined in that same space. Perspective and crop are exclusive.
  if (transform.perspective) {
    const oriented = await context.renderAsync();
    const orientedFile = await oriented.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
    return perspectiveWarpUri(orientedFile.uri, transform.perspective);
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
  return saved.uri;
}

/**
 * Copies a picked image into the app-owned staging directory so it stays
 * available for re-cropping during a form session (device picker cache files
 * can be evicted at any time).
 */
export async function stageSourceImage(uri: string): Promise<string> {
  ensureAppDirs();
  const staged = new File(STAGING_DIR, `form-photo-${uuid()}.jpg`);
  await new File(uri).copy(staged);
  return staged.uri;
}

/**
 * Best-effort deletion of a staged source file. Files outside the staging
 * directory (e.g. an existing media asset's local path) are never touched.
 */
export function deleteStagedFile(uri: string | null): void {
  if (!uri || !uri.startsWith(STAGING_DIR.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup must never break the caller.
  }
}

export async function pickVideoAndImport(
  db: SqliteLike,
  options?: ImportOptions,
): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    quality: 1,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const { assetId } = await importVideoFromUri(db, asset.uri, options);
  return assetId;
}

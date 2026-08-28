import { File } from 'expo-file-system';
import type { DriveClient } from './client';
import { DriveClientError } from './client';
import type { CloudHistoryItem } from './cloudHistory';
import { mediaManifestSchema, type MediaManifest } from './mediaManifest';
import type { SqliteLike } from '@/db/types';
import {
  applyDataRestore,
  buildVerifiedRestorePreview,
  readManifest,
  type BackupManifest,
  type RestorePreview,
} from '@/services/backup';
import { ensureAppDirs, extFromMime, ORIGINALS_DIR, regenerateThumbnail } from '@/services/media';
import { createEventRepo } from '@/repositories/event';

export type DataRestorePrepared = {
  kind: 'data';
  remoteFileId: string;
  snapshotId?: string;
  deviceLabel?: string;
  createdAt: string;
  manifest: BackupManifest;
  stagingPath: string;
  preview: RestorePreview;
};

export type MediaRestoreEntry = {
  id: string;
  role: string;
  blobSha256: string | null;
  byteSize: number;
  mimeType: string | null;
  missing: boolean;
};

export type MediaRestorePrepared = {
  kind: 'media';
  remoteFileId: string;
  snapshotId: string;
  deviceLabel?: string;
  createdAt: string;
  entries: MediaRestoreEntry[];
  availableCount: number;
  missingCount: number;
};

export type MediaRestoreResult = {
  restored: number;
  skipped: number;
  missingRemote: number;
  failed: number;
};

export type MediaRecommendation = {
  media?: CloudHistoryItem;
  sameDevice: boolean;
  newerThanData: boolean;
};

function invalid(message: string): never {
  throw new DriveClientError('BACKUP_INVALID', message);
}

function safeId(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,500}$/.test(value)) invalid('Invalid Drive file identifier.');
  return value;
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function parseMediaManifest(text: string): MediaManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    invalid('The downloaded Media manifest is not valid JSON.');
  }
  const parsed = mediaManifestSchema.safeParse(value);
  if (!parsed.success) invalid('The downloaded Media manifest failed strict validation.');
  return parsed.data;
}

/**
 * Deterministic recommendation:
 * 1. newest Media snapshot from the same device whose createdAt <= Data createdAt;
 * 2. otherwise the Media snapshot with the smallest absolute time distance
 *    (ties resolved by newest createdAt then remoteFileId), flagged for warnings.
 */
export function recommendMediaSnapshot(
  history: readonly CloudHistoryItem[],
  selectedData: CloudHistoryItem,
): MediaRecommendation {
  const media = history.filter((item) => item.category === 'media' && item.createdAt);
  const selectedAt = Date.parse(selectedData.createdAt);
  const sameBefore = media
    .filter((item) => item.deviceId === selectedData.deviceId && Date.parse(item.createdAt) <= selectedAt)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
      || (right.remoteFileId?.localeCompare(left.remoteFileId ?? '') ?? 0));
  if (sameBefore[0]) {
    return { media: sameBefore[0], sameDevice: true, newerThanData: false };
  }
  let best: CloudHistoryItem | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of media) {
    const distance = Math.abs(Date.parse(item.createdAt) - selectedAt);
    if (distance < bestDistance || (distance === bestDistance && item.createdAt > (best?.createdAt ?? ''))) {
      best = item;
      bestDistance = distance;
    }
  }
  if (!best) return { media: undefined, sameDevice: false, newerThanData: false };
  return {
    media: best,
    sameDevice: best.deviceId === selectedData.deviceId,
    newerThanData: Date.parse(best.createdAt) > selectedAt,
  };
}

export function createDriveRestoreService(dependencies: {
  client: DriveClient;
  listHistory: () => Promise<CloudHistoryItem[]>;
  db: SqliteLike;
  stagingDirectory: string;
  regenerateThumbnail?: (db: SqliteLike, assetId: string, sourcePath: string) => Promise<boolean>;
}) {
  const { client, listHistory, db } = dependencies;

  function writeTextFile(path: string, text: string): void {
    const file = new File(path);
    file.create({ intermediates: true, overwrite: true });
    file.write(text);
  }

  function writeBlobFile(path: string, bytes: Uint8Array): void {
    const file = new File(path);
    file.create({ intermediates: true, overwrite: true });
    file.write(bytes);
  }

  function removeFile(path: string): void {
    const file = new File(path);
    if (file.exists) file.delete();
  }

  async function findHistoryItem(remoteFileId: string, category: 'data' | 'media'): Promise<CloudHistoryItem> {
    const history = await listHistory();
    const item = history.find((candidate) => candidate.remoteFileId === remoteFileId && candidate.category === category);
    if (!item) invalid('The requested snapshot was not found in cloud history.');
    return item;
  }

  function verifiable(item: CloudHistoryItem): { size: number; sha256: string } {
    if (item.byteSize === undefined || !item.contentSha256) invalid('The snapshot has no verifiable size or checksum.');
    return { size: item.byteSize, sha256: item.contentSha256 };
  }

  function stagingPath(remoteFileId: string, suffix: string): string {
    const directory = dependencies.stagingDirectory.replace(/\/$/, '');
    return `${directory}/${suffix}-${safeId(remoteFileId)}`;
  }

  return {
    async prepareDataRestore(remoteFileId: string, signal?: AbortSignal): Promise<DataRestorePrepared> {
      const item = await findHistoryItem(remoteFileId, 'data');
      const bytes = await client.downloadVerified(remoteFileId, verifiable(item), signal);
      const staging = `${stagingPath(remoteFileId, 'drive-restore-data')}.json`;
      writeTextFile(staging, decodeText(bytes));
      const manifest = readManifest(staging);
      const preview = await buildVerifiedRestorePreview(db, manifest);
      return {
        kind: 'data',
        remoteFileId,
        snapshotId: item.snapshotId,
        deviceLabel: item.deviceLabel,
        createdAt: item.createdAt,
        manifest,
        stagingPath: staging,
        preview,
      };
    },

    releasePrepared(stagingPathValue: string): void {
      if (stagingPathValue) removeFile(stagingPathValue);
    },

    async applyPreparedDataRestore(prepared: DataRestorePrepared, signal?: AbortSignal): Promise<Awaited<ReturnType<typeof applyDataRestore>>> {
      try {
        if (signal?.aborted) throw new DriveClientError('CANCELLED', 'Drive restore was cancelled.');
        return await applyDataRestore(db, prepared.manifest);
      } finally {
        this.releasePrepared(prepared.stagingPath);
      }
    },

    async prepareMediaRestore(remoteFileId: string, signal?: AbortSignal): Promise<MediaRestorePrepared> {
      const item = await findHistoryItem(remoteFileId, 'media');
      const bytes = await client.downloadVerified(remoteFileId, verifiable(item), signal);
      const manifest = parseMediaManifest(decodeText(bytes));
      if (manifest.snapshotId !== item.snapshotId && item.snapshotId) invalid('Media manifest identity does not match cloud history.');
      const entries: MediaRestoreEntry[] = manifest.entries.map((entry) => ({
        id: entry.id,
        role: entry.role,
        blobSha256: entry.blobSha256,
        byteSize: entry.byteSize,
        mimeType: entry.mimeType,
        missing: entry.missing,
      }));
      const availableCount = entries.filter((entry) => !entry.missing).length;
      const missingCount = entries.length - availableCount;
      return {
        kind: 'media',
        remoteFileId,
        snapshotId: manifest.snapshotId,
        deviceLabel: manifest.deviceLabel,
        createdAt: manifest.createdAt,
        entries,
        availableCount,
        missingCount,
      };
    },

    async applyMediaRestore(prepared: MediaRestorePrepared, signal?: AbortSignal): Promise<MediaRestoreResult> {
      ensureAppDirs();
      const result: MediaRestoreResult = { restored: 0, skipped: 0, missingRemote: 0, failed: 0 };

      const blobs = await client.listFiles({ artifactType: 'media_blob', category: 'media' }, signal);
      const blobIdByHash = new Map<string, string>();
      for (const blob of blobs) {
        const hash = blob.appProperties?.sha256;
        if (hash && blob.sha256Checksum === hash) blobIdByHash.set(hash, blob.id);
      }

      const available = prepared.entries.filter((entry) => !entry.missing && entry.blobSha256 && entry.byteSize > 0);
      const uniqueByHash = new Map<string, MediaRestoreEntry>();
      for (const entry of available) {
        if (!uniqueByHash.has(entry.blobSha256!)) uniqueByHash.set(entry.blobSha256!, entry);
      }

      const stagedByHash = new Map<string, string>();
      try {
        for (const [hash, entry] of uniqueByHash) {
          if (signal?.aborted) throw new DriveClientError('CANCELLED', 'Drive restore was cancelled.');
          const remoteId = blobIdByHash.get(hash);
          if (!remoteId) {
            result.missingRemote += 1;
            continue;
          }
          try {
            const bytes = await client.downloadVerified(remoteId, { size: entry.byteSize, sha256: hash }, signal);
            const staged = stagingPath(hash, 'drive-restore-blob');
            writeBlobFile(staged, bytes);
            stagedByHash.set(hash, staged);
          } catch {
            result.failed += 1;
          }
        }

        for (const entry of prepared.entries) {
          if (entry.missing) {
            result.missingRemote += 1;
            continue;
          }
          if (!entry.blobSha256 || entry.byteSize <= 0) continue;
          const staged = stagedByHash.get(entry.blobSha256);
          if (!staged) continue; // already counted as missingRemote/failed above.
          const extension = extFromMime(entry.mimeType, 'bin');
          const dest = new File(ORIGINALS_DIR, `${entry.id}.${extension}`);
          const row = db.getFirstSync<{ local_path: string | null }>(`SELECT local_path FROM media_asset WHERE id = ?`, entry.id);
          if (row?.local_path) {
            try {
              if (new File(row.local_path).exists) {
                result.skipped += 1;
                continue;
              }
            } catch {
              // fall through and restore
            }
          }
          try {
            new File(staged).copy(dest);
            createEventRepo(db).relinkMedia(entry.id, dest.uri);
            if (dependencies.regenerateThumbnail) {
              await dependencies.regenerateThumbnail(db, entry.id, dest.uri);
            }
            result.restored += 1;
          } catch {
            result.failed += 1;
          }
        }
      } finally {
        for (const staged of stagedByHash.values()) removeFile(staged);
      }
      return result;
    },
  };
}

export type DriveRestoreService = ReturnType<typeof createDriveRestoreService>;

export { regenerateThumbnail };
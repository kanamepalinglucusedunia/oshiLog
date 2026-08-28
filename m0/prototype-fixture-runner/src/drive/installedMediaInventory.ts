import { File, FileMode } from 'expo-file-system';
import type { SqliteLike } from '@/db/types';
import { buildMediaInventory, type ChunkedFileReader, type MediaSource } from './staging';

type MediaRow = {
  id: string;
  localPath: string | null;
  mimeType: string | null;
  fileSize: number | null;
  updatedAt: string;
  cachedSha256: string | null;
  cachedSize: number | null;
  cachedSourceUpdatedAt: string | null;
};

const FULL_SHA256 = /^[a-f0-9]{64}$/;

const REFERENCED_MEDIA_SQL = `
  SELECT ma.id, ma.local_path AS localPath, ma.mime_type AS mimeType, ma.file_size AS fileSize,
    ma.updated_at AS updatedAt, cache.sha256 AS cachedSha256, cache.source_size AS cachedSize,
    cache.source_updated_at AS cachedSourceUpdatedAt
  FROM media_asset ma
  LEFT JOIN drive_media_hash_cache cache ON cache.media_asset_id = ma.id
  WHERE ma.deleted_at IS NULL AND (
    EXISTS (SELECT 1 FROM idol i WHERE i.photo_media_id = ma.id AND i.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM groups g WHERE g.photo_media_id = ma.id AND g.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM idol_media im JOIN idol i ON i.id = im.idol_id
      WHERE im.media_asset_id = ma.id AND i.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM group_media gm JOIN groups g ON g.id = gm.group_id
      WHERE gm.media_asset_id = ma.id AND g.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM cheki_entry_media cem JOIN cheki_entry ce ON ce.id = cem.cheki_entry_id
      JOIN event e ON e.id = ce.event_id
      WHERE cem.media_asset_id = ma.id AND ce.deleted_at IS NULL AND e.deleted_at IS NULL)
  )
  ORDER BY ma.id`;

export function createExpoChunkedFileReader(): ChunkedFileReader {
  return {
    async stat(path) {
      const file = new File(path);
      return { exists: file.exists, size: file.exists ? file.size : 0 };
    },
    async readChunk(path, offset, length) {
      const handle = new File(path).open(FileMode.ReadOnly);
      try {
        handle.offset = offset;
        return handle.readBytes(length);
      } finally {
        handle.close();
      }
    },
  };
}

export function createInstalledMediaInventory(
  db: SqliteLike,
  reader: ChunkedFileReader = createExpoChunkedFileReader(),
) {
  return {
    async prepare() {
      const rows = db.getAllSync<MediaRow>(REFERENCED_MEDIA_SQL);
      const sources: MediaSource[] = rows.map((row) => {
        const cacheIsCurrent = row.cachedSize === row.fileSize
          && row.cachedSourceUpdatedAt === row.updatedAt
          && typeof row.cachedSha256 === 'string'
          && FULL_SHA256.test(row.cachedSha256);
        return {
          id: row.id,
          role: 'original',
          path: row.localPath,
          mimeType: row.mimeType,
          contentHash: cacheIsCurrent ? row.cachedSha256 : null,
          size: cacheIsCurrent ? row.cachedSize : row.fileSize,
        };
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const now = new Date().toISOString();
      return buildMediaInventory(sources, reader, {
        saveHash: async (id, hash, size) => {
          const source = byId.get(id);
          if (!source) throw new Error('Media hash source is missing.');
          db.runSync(
            `INSERT INTO drive_media_hash_cache (media_asset_id, source_size, source_updated_at, sha256, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(media_asset_id) DO UPDATE SET source_size=excluded.source_size,
               source_updated_at=excluded.source_updated_at, sha256=excluded.sha256, updated_at=excluded.updated_at`,
            id, size, source.updatedAt, hash, now,
          );
        },
      });
    },
  };
}

export type InstalledMediaInventory = ReturnType<typeof createInstalledMediaInventory>;

import { File } from 'expo-file-system';
import { createExpoChunkedFileReader, createInstalledMediaInventory } from '@/drive/installedMediaInventory';
import type { ChunkedFileReader } from '@/drive/staging';
import { createNodeTestDb } from '@/testing/nodeSqlite';

const CREATED = '2026-08-16T04:00:00.000Z';

describe('installed Media inventory', () => {
  it('reads an exact offset through an Expo FileHandle and closes the bounded handle', async () => {
    const content = '0123456789'.repeat(10);
    new File('file:///bounded.bin').write(content);
    const reader = createExpoChunkedFileReader();

    await expect(reader.stat('file:///bounded.bin')).resolves.toEqual({ exists: true, size: 100 });
    await expect(reader.stat('file:///absent.bin')).resolves.toEqual({ exists: false, size: 0 });
    await expect(reader.readChunk('file:///bounded.bin', 7, 5))
      .resolves.toEqual(new TextEncoder().encode(content.slice(7, 12)));
  });

  it('hashes referenced app media with bounded reads and reuses the Drive-specific full SHA-256 cache', async () => {
    const db = createNodeTestDb();
    db.runSync(
      `INSERT INTO media_asset (id, kind, content_hash, mime_type, file_size, width, height, local_path,
        schema_version, created_at, updated_at, deleted_at)
       VALUES (?, 'photo', ?, 'image/jpeg', 4, NULL, NULL, 'file:///asset.jpg', 1, ?, ?, NULL)`,
      'asset-1', 'legacy-local-dedupe-hash', CREATED, CREATED,
    );
    db.runSync(
      `INSERT INTO idol (id, name, photo_media_id, country, status, is_favorite, schema_version, created_at, updated_at, deleted_at)
       VALUES ('idol-1', 'Oshi', 'asset-1', 'JP', 'active', 0, 1, ?, ?, NULL)`,
      CREATED, CREATED,
    );
    const readChunk = jest.fn(async () => new Uint8Array([1, 2, 3, 4]));
    const reader: ChunkedFileReader = {
      stat: jest.fn(async () => ({ exists: true, size: 4 })),
      readChunk,
    };

    const first = await createInstalledMediaInventory(db, reader).prepare();
    expect(first.entries).toEqual([
      expect.objectContaining({ id: 'asset-1', localPath: 'file:///asset.jpg', mimeType: 'image/jpeg', missing: false }),
    ]);
    expect(readChunk).toHaveBeenCalledTimes(1);
    expect(db.getFirstSync<{ sha256: string }>(
      `SELECT sha256 FROM drive_media_hash_cache WHERE media_asset_id = 'asset-1'`,
    )?.sha256).toBe(first.entries[0].contentHash);

    readChunk.mockRejectedValue(new Error('must use cache'));
    const second = await createInstalledMediaInventory(db, reader).prepare();
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(readChunk).toHaveBeenCalledTimes(1);
  });

  it('marks missing and unreadable referenced files explicitly instead of aborting the inventory', async () => {
    const db = createNodeTestDb();
    db.runSync(
      `INSERT INTO groups (id, name, country, is_favorite, schema_version, created_at, updated_at, deleted_at)
       VALUES ('group-1', 'Group', 'JP', 0, 1, ?, ?, NULL)`,
      CREATED, CREATED,
    );
    db.runSync(
      `INSERT INTO media_asset (id, kind, content_hash, mime_type, file_size, local_path,
        schema_version, created_at, updated_at, deleted_at)
       VALUES ('asset-1', 'video', NULL, 'video/mp4', 10, 'file:///gone.mp4', 1, ?, ?, NULL)`,
      CREATED, CREATED,
    );
    db.runSync(
      `INSERT INTO group_media (media_asset_id, group_id, sort_order, created_at, updated_at)
       VALUES ('asset-1', 'group-1', 0, ?, ?)`,
      CREATED, CREATED,
    );
    const reader: ChunkedFileReader = {
      stat: jest.fn(async () => { throw new Error('unreadable'); }),
      readChunk: jest.fn(),
    };

    const result = await createInstalledMediaInventory(db, reader).prepare();
    expect(result).toMatchObject({ missingCount: 1, totalBytes: 0 });
    expect(result.entries[0]).toMatchObject({ id: 'asset-1', missing: true, contentHash: null });
  });
});

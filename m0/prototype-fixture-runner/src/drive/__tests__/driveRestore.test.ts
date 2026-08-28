import { File } from 'expo-file-system';
import { DriveClientError } from '@/drive/client';
import type { CloudHistoryItem } from '@/drive/cloudHistory';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createDriveRestoreService, recommendMediaSnapshot } from '../driveRestore';
import { createDriveRepo } from '@/repositories/drive';
import { sealManifest, type BackupManifest } from '@/services/backup';

const NOW = '2026-08-17T09:00:00.000Z';
const SHA_A = 'a'.repeat(64);
const SHA_H = '1'.repeat(64);
const SHA_I = '2'.repeat(64);

function historyItem(overrides: Partial<CloudHistoryItem>): CloudHistoryItem {
  return {
    category: 'data',
    remoteFileId: 'f1',
    snapshotId: 'snap-1',
    deviceId: 'device-1',
    deviceLabel: 'Pixel',
    createdAt: NOW,
    byteSize: 100,
    contentSha256: SHA_A,
    contentFingerprint: 'b'.repeat(64),
    complete: true,
    status: 'committed',
    cleanupPending: false,
    ...overrides,
  };
}

describe('recommendMediaSnapshot', () => {
  const dataAt = '2026-08-10T09:00:00.000Z';
  const selected = historyItem({ category: 'data', createdAt: dataAt, snapshotId: 'data-a', deviceId: 'device-1' });

  it('recommends the newest same-device media at or before the Data time', () => {
    const media = [
      historyItem({ category: 'media', createdAt: '2026-08-01T09:00:00.000Z', snapshotId: 'm-old', deviceId: 'device-1' }),
      historyItem({ category: 'media', createdAt: '2026-08-09T09:00:00.000Z', snapshotId: 'm-best', deviceId: 'device-1' }),
      historyItem({ category: 'media', createdAt: '2026-08-11T09:00:00.000Z', snapshotId: 'm-after', deviceId: 'device-1' }),
      historyItem({ category: 'media', createdAt: '2026-08-08T09:00:00.000Z', snapshotId: 'm-other-device', deviceId: 'device-2' }),
    ];
    const result = recommendMediaSnapshot(media, selected);
    expect(result.media?.snapshotId).toBe('m-best');
    expect(result.sameDevice).toBe(true);
    expect(result.newerThanData).toBe(false);
  });

  it('falls back to the nearest Media snapshot with mismatch warnings when no same-device at-or-before exists', () => {
    const media = [
      historyItem({ category: 'media', createdAt: '2026-08-11T09:00:00.000Z', snapshotId: 'm-after', deviceId: 'device-2' }),
      historyItem({ category: 'media', createdAt: '2026-07-30T09:00:00.000Z', snapshotId: 'm-earlier', deviceId: 'device-2' }),
    ];
    const result = recommendMediaSnapshot(media, selected);
    // Closest absolute distance is m-after (2026-08-11 vs data 08-10): 1 day vs 11 days.
    expect(result.media?.snapshotId).toBe('m-after');
    expect(result.sameDevice).toBe(false);
    expect(result.newerThanData).toBe(true);
  });

  it('returns no recommendation when there is no Media history', () => {
    const result = recommendMediaSnapshot([], selected);
    expect(result.media).toBeUndefined();
    expect(result.sameDevice).toBe(false);
  });

  it('is deterministic on ties', () => {
    const media = [
      historyItem({ category: 'media', createdAt: '2026-08-12T09:00:00.000Z', snapshotId: 'b', deviceId: 'device-2', remoteFileId: 'rb' }),
      historyItem({ category: 'media', createdAt: '2026-08-08T09:00:00.000Z', snapshotId: 'a', deviceId: 'device-2', remoteFileId: 'ra' }),
    ];
    const first = recommendMediaSnapshot(media, selected);
    const second = recommendMediaSnapshot([...media].reverse(), selected);
    expect(first.media?.snapshotId).toBe(second.media?.snapshotId);
    expect(first.media?.snapshotId).toBe('b');
  });
});

describe('Drive cloud restore service', () => {
  let dataManifest: BackupManifest;
  let dataJson: string;

  const MEDIA_MANIFEST = JSON.stringify({
    formatVersion: 1,
    snapshotId: 'media-snap-1',
    category: 'media',
    createdAt: NOW,
    appVersion: '0.1.0',
    schemaVersion: 12,
    deviceId: 'device-1',
    deviceLabel: 'Pixel',
    contentFingerprint: 'f'.repeat(64),
    entries: [
      { id: 'asset-1', role: 'original', blobSha256: SHA_H, byteSize: 4, mimeType: 'image/jpeg', missing: false },
      { id: 'asset-2', role: 'original', blobSha256: SHA_I, byteSize: 6, mimeType: 'image/png', missing: true },
    ],
  });

  const db = createNodeTestDb();
  createDriveRepo(db, () => NOW);

  beforeAll(async () => {
    dataManifest = await sealManifest({
      formatVersion: 2,
      category: 'data',
      appVersion: '0.1.0',
      schemaVersion: 12,
      createdAt: NOW,
      deviceLabel: 'Pixel',
      recordCounts: { idol: 0 },
      checksums: {},
      records: {},
    });
    dataJson = JSON.stringify(dataManifest);
  });

  function fakeClient(options: {
    downloads: Record<string, string>;
    blobs?: { id: string; sha256: string; size: number }[];
  }): { client: Parameters<typeof createDriveRestoreService>[0]['client']; downloadVerified: jest.Mock } {
    const downloadVerified = jest.fn(async (id: string, expected: { size: number; sha256: string }) => {
      const content = options.downloads[id];
      if (content === undefined) throw new DriveClientError('BACKUP_INVALID', 'missing');
      const bytes = new TextEncoder().encode(content);
      if (bytes.byteLength !== expected.size) throw new DriveClientError('CHECKSUM_MISMATCH', 'size mismatch');
      return bytes;
    });
    const client = {
      downloadVerified,
      listFiles: jest.fn(async () => (options.blobs ?? []).map((blob) => ({
        id: blob.id,
        name: `media-blob-${blob.sha256}`,
        size: String(blob.size),
        sha256Checksum: blob.sha256,
        appProperties: { app: 'oshilog', formatVersion: '1', artifactType: 'media_blob', category: 'media', sha256: blob.sha256 },
      }))),
      getMetadata: jest.fn(),
    } as unknown as Parameters<typeof createDriveRestoreService>[0]['client'];
    return { client, downloadVerified };
  }

  function dataService(options: { content?: string; size?: number } = {}) {
    const content = options.content ?? dataJson;
    const client = fakeClient({ downloads: { f1: content } });
    const dataItem = historyItem({
      category: 'data', remoteFileId: 'f1', snapshotId: 'snap-1',
      byteSize: options.size ?? content.length, contentSha256: SHA_A,
    });
    return {
      service: createDriveRestoreService({
        client: client.client,
        listHistory: jest.fn(async () => [dataItem]),
        db,
        stagingDirectory: 'file:///cache/oshilog/drive-restore',
        regenerateThumbnail: jest.fn(async () => true),
      }),
      client,
    };
  }

  it('prepares a verified Data restore with preview and manifest', async () => {
    const context = dataService();
    const prepared = await context.service.prepareDataRestore('f1');
    expect(prepared.kind).toBe('data');
    expect(prepared.manifest.category).toBe('data');
    expect(prepared.preview).toMatchObject({ added: 0, skipped: 0 });
    expect(prepared.stagingPath).toContain('drive-restore-data-');
  });

  it('rejects unknown Data snapshots before mutation', async () => {
    const context = dataService();
    await expect(context.service.prepareDataRestore('missing')).rejects.toMatchObject({ code: 'BACKUP_INVALID' });
  });

  it('blocks invalid manifest content before restore (oversized value rejected by readManifest)', async () => {
    const bad = JSON.stringify({
      formatVersion: 2, category: 'data', appVersion: '0.1.0', schemaVersion: 12,
      createdAt: NOW, deviceLabel: 'Pixel', recordCounts: { idol: 1 },
      checksums: { all: 'sealed' },
      records: { idol: [{ id: 'a', name: 'x'.repeat(10_000), updated_at: NOW }] },
    });
    const context = dataService({ content: bad, size: bad.length });
    await expect(context.service.prepareDataRestore('f1')).rejects.toThrow();
  });

  it('rejects a checksum mismatch before mutation', async () => {
    const context = dataService();
    (context.client.downloadVerified as jest.Mock).mockRejectedValueOnce(new DriveClientError('CHECKSUM_MISMATCH', 'mismatch'));
    await expect(context.service.prepareDataRestore('f1')).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
  });

  it('prepares a Media restore from a bounded manifest', async () => {
    const client = fakeClient({ downloads: { 'media-file': MEDIA_MANIFEST } });
    const mediaItem = historyItem({
      category: 'media', remoteFileId: 'media-file', snapshotId: 'media-snap-1',
      byteSize: MEDIA_MANIFEST.length, contentSha256: SHA_A, complete: false, missingCount: 1,
    });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => [mediaItem]),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });

    const prepared = await serviceInstance.prepareMediaRestore('media-file');
    if (prepared.kind !== 'media') throw new Error('expected media');
    expect(prepared.entries).toHaveLength(2);
    expect(prepared.availableCount).toBe(1);
    expect(prepared.missingCount).toBe(1);
  });

  it('restores available media, skips already-present rows, reports missing-remote, and never deletes local-only media', async () => {
    const client = fakeClient({
      downloads: { 'blob-1': 'data' },
      blobs: [{ id: 'blob-1', sha256: SHA_H, size: 4 }],
    });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => []),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });

    // Pre-existing local media row with an existing file: must be skipped, never touched.
    const existingPath = 'file:///document/oshilog/originals/asset-1.jpg';
    new File(existingPath).write('existing');
    db.runSync(
      `INSERT INTO media_asset (id, kind, local_path, mime_type, file_size, content_hash, schema_version, created_at, updated_at)
       VALUES ('asset-1', 'cheki', ?, 'image/jpeg', 4, 'x', 1, ?, ?)`,
      existingPath, NOW, NOW,
    );

    const result = await serviceInstance.applyMediaRestore({
      kind: 'media',
      remoteFileId: 'media-file',
      snapshotId: 'media-snap-1',
      deviceLabel: 'Pixel',
      createdAt: NOW,
      entries: [
        { id: 'asset-1', role: 'original', blobSha256: SHA_H, byteSize: 4, mimeType: 'image/jpeg', missing: false },
        { id: 'asset-2', role: 'original', blobSha256: SHA_I, byteSize: 6, mimeType: 'image/png', missing: true },
        { id: 'asset-3', role: 'original', blobSha256: null, byteSize: 0, mimeType: null, missing: true },
      ],
      availableCount: 1,
      missingCount: 2,
    });

    expect(result).toEqual({ restored: 0, skipped: 1, missingRemote: 2, failed: 0 });
  });

  it('restores an entry whose row points at a missing local file and counts download failures', async () => {
    const client = fakeClient({
      downloads: { 'blob-1': 'data' },
      blobs: [{ id: 'blob-1', sha256: SHA_H, size: 4 }],
    });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => []),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });

    // Row exists but its local file is gone: restore must repair it.
    db.runSync(
      `INSERT INTO media_asset (id, kind, local_path, mime_type, file_size, content_hash, schema_version, created_at, updated_at)
       VALUES ('asset-gone', 'cheki', 'file:///document/oshilog/originals/asset-gone.jpg', 'image/jpeg', 4, 'x', 1, ?, ?)`,
      NOW, NOW,
    );

    const result = await serviceInstance.applyMediaRestore({
      kind: 'media',
      remoteFileId: 'media-file',
      snapshotId: 'media-snap-1',
      deviceLabel: 'Pixel',
      createdAt: NOW,
      entries: [
        { id: 'asset-gone', role: 'original', blobSha256: SHA_H, byteSize: 4, mimeType: 'image/jpeg', missing: false },
        { id: 'asset-dl-fail', role: 'original', blobSha256: SHA_I, byteSize: 6, mimeType: 'image/png', missing: false },
      ],
      availableCount: 2,
      missingCount: 0,
    });

    expect(result).toEqual({ restored: 1, skipped: 0, missingRemote: 1, failed: 0 });
  });

  it('cancels media restore cleanly when the abort signal fires', async () => {
    const client = fakeClient({ downloads: { 'blob-1': 'data' } });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => []),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });
    const controller = new AbortController();
    controller.abort();
    await expect(serviceInstance.applyMediaRestore({
      kind: 'media',
      remoteFileId: 'media-file',
      snapshotId: 'media-snap-1',
      deviceLabel: 'Pixel',
      createdAt: NOW,
      entries: [{ id: 'asset-1', role: 'original', blobSha256: SHA_H, byteSize: 4, mimeType: 'image/jpeg', missing: false }],
      availableCount: 1,
      missingCount: 0,
    }, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('releases prepared staging files on demand', async () => {
    const context = dataService();
    const prepared = await context.service.prepareDataRestore('f1');
    const path = prepared.stagingPath;
    expect(new File(path).exists).toBe(true);
    context.service.releasePrepared(path);
    expect(new File(path).exists).toBe(false);
  });

  it('rejects a Media manifest that is not valid JSON', async () => {
    const client = fakeClient({ downloads: { 'media-file': 'not-json' } });
    const mediaItem = historyItem({
      category: 'media', remoteFileId: 'media-file', snapshotId: 'media-snap-1',
      byteSize: 8, contentSha256: SHA_A,
    });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => [mediaItem]),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });
    await expect(serviceInstance.prepareMediaRestore('media-file')).rejects.toMatchObject({ code: 'BACKUP_INVALID' });
  });

  it('rejects a Media manifest whose identity does not match cloud history', async () => {
    const mismatched = JSON.parse(MEDIA_MANIFEST) as { snapshotId: string };
    mismatched.snapshotId = 'other-snap';
    const client = fakeClient({ downloads: { 'media-file': JSON.stringify(mismatched) } });
    const mediaItem = historyItem({
      category: 'media', remoteFileId: 'media-file', snapshotId: 'media-snap-1',
      byteSize: JSON.stringify(mismatched).length, contentSha256: SHA_A,
    });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => [mediaItem]),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });
    await expect(serviceInstance.prepareMediaRestore('media-file')).rejects.toMatchObject({ code: 'BACKUP_INVALID' });
  });

  it('applies a prepared Data restore and removes its staging file', async () => {
    const context = dataService();
    const prepared = await context.service.prepareDataRestore('f1');
    const result = await context.service.applyPreparedDataRestore(prepared);
    expect(result.safetySnapshotPath).toContain('oshilog-safety-');
    expect(new File(prepared.stagingPath).exists).toBe(false);
  });

  it('counts a blob download failure instead of aborting the whole restore', async () => {
    const client = fakeClient({ downloads: {}, blobs: [{ id: 'blob-1', sha256: SHA_H, size: 4 }] });
    (client.client.downloadVerified as jest.Mock).mockRejectedValue(new DriveClientError('RATE_LIMITED', 'slow down'));
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => []),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });
    const result = await serviceInstance.applyMediaRestore({
      kind: 'media',
      remoteFileId: 'media-file',
      snapshotId: 'media-snap-1',
      deviceLabel: 'Pixel',
      createdAt: NOW,
      entries: [{ id: 'asset-dl', role: 'original', blobSha256: SHA_H, byteSize: 4, mimeType: 'image/jpeg', missing: false }],
      availableCount: 1,
      missingCount: 0,
    });
    expect(result).toEqual({ restored: 0, skipped: 0, missingRemote: 0, failed: 1 });
  });

  it('counts a placement failure when a thumbnail regeneration throws', async () => {
    const client = fakeClient({
      downloads: { 'blob-1': 'data' },
      blobs: [{ id: 'blob-1', sha256: SHA_H, size: 4 }],
    });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => []),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => { throw new Error('thumb failed'); }),
    });
    const result = await serviceInstance.applyMediaRestore({
      kind: 'media',
      remoteFileId: 'media-file',
      snapshotId: 'media-snap-1',
      deviceLabel: 'Pixel',
      createdAt: NOW,
      entries: [{ id: 'asset-thumb', role: 'original', blobSha256: SHA_H, byteSize: 4, mimeType: 'image/jpeg', missing: false }],
      availableCount: 1,
      missingCount: 0,
    });
    expect(result).toEqual({ restored: 0, skipped: 0, missingRemote: 0, failed: 1 });
  });

  it('cancels a prepared Data restore before mutation and cleans staging', async () => {
    const context = dataService();
    const prepared = await context.service.prepareDataRestore('f1');
    const controller = new AbortController();
    controller.abort();
    await expect(context.service.applyPreparedDataRestore(prepared, controller.signal))
      .rejects.toMatchObject({ code: 'CANCELLED' });
    expect(new File(prepared.stagingPath).exists).toBe(false);
  });

  it('cleans blob staging when the abort signal fires mid-download', async () => {
    const client = fakeClient({ downloads: { 'blob-1': 'data' }, blobs: [{ id: 'blob-1', sha256: SHA_H, size: 4 }] });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => []),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });
    const controller = new AbortController();
    (client.client.listFiles as jest.Mock).mockImplementationOnce(async () => {
      controller.abort();
      return [{ id: 'blob-1', name: 'media-blob-1', size: '4', sha256Checksum: SHA_H, appProperties: { app: 'oshilog', formatVersion: '1', artifactType: 'media_blob', category: 'media', sha256: SHA_H } }];
    });
    await expect(serviceInstance.applyMediaRestore({
      kind: 'media',
      remoteFileId: 'media-file',
      snapshotId: 'media-snap-1',
      deviceLabel: 'Pixel',
      createdAt: NOW,
      entries: [{ id: 'asset-1', role: 'original', blobSha256: SHA_H, byteSize: 4, mimeType: 'image/jpeg', missing: false }],
      availableCount: 1,
      missingCount: 0,
    }, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('silently skips zero-byte available entries without counting them', async () => {
    const client = fakeClient({ downloads: {} });
    const serviceInstance = createDriveRestoreService({
      client: client.client,
      listHistory: jest.fn(async () => []),
      db,
      stagingDirectory: 'file:///cache/oshilog/drive-restore',
      regenerateThumbnail: jest.fn(async () => true),
    });
    const result = await serviceInstance.applyMediaRestore({
      kind: 'media',
      remoteFileId: 'media-file',
      snapshotId: 'media-snap-1',
      deviceLabel: 'Pixel',
      createdAt: NOW,
      entries: [
        { id: 'empty', role: 'original', blobSha256: SHA_H, byteSize: 0, mimeType: null, missing: false },
      ],
      availableCount: 1,
      missingCount: 0,
    });
    expect(result).toEqual({ restored: 0, skipped: 0, missingRemote: 0, failed: 0 });
  });
});
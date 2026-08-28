import type { BackupManifest } from '@/services/backup';
import {
  buildDataArtifact,
  buildMediaInventory,
  cleanupOrphanStaging,
  createStagingManager,
  type ChunkedFileReader,
  type MediaSource,
} from '@/drive/staging';
import { createInstalledDataStagingService } from '@/drive/installedDataStaging';
import { createNodeTestDb } from '@/testing/nodeSqlite';

function manifest(overrides: Partial<BackupManifest> = {}): BackupManifest {
  return {
    formatVersion: 2,
    category: 'data',
    appVersion: '0.1.0',
    schemaVersion: 11,
    createdAt: '2026-08-16T01:00:00.000Z',
    deviceLabel: 'Pixel A',
    recordCounts: { idol: 2 },
    checksums: { all: 'volatile-manifest-checksum' },
    records: { idol: [{ id: '2', name: 'Beta' }, { name: 'Alpha', id: '1' }] },
    ...overrides,
  };
}

describe('canonical Drive staging and change detection', () => {
  it('produces the same Data fingerprint despite volatile metadata, key order, and row order', async () => {
    const first = await buildDataArtifact(manifest());
    const second = await buildDataArtifact(manifest({
      createdAt: '2030-01-01T00:00:00.000Z',
      deviceLabel: 'Different device',
      checksums: { all: 'different' },
      records: { idol: [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }] },
    }));

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.json).not.toBe(second.json);
    expect(first.bytes).toBeGreaterThan(0);
    expect(first.itemCount).toBe(2);
  });

  it('changes the Data fingerprint when backed-up content changes', async () => {
    const first = await buildDataArtifact(manifest());
    const changed = await buildDataArtifact(manifest({
      records: { idol: [{ id: '1', name: 'Changed' }, { id: '2', name: 'Beta' }] },
    }));
    expect(first.fingerprint).not.toBe(changed.fingerprint);
  });

  it('makes Media fingerprints order-independent but sensitive to content and missing state', async () => {
    const reader: ChunkedFileReader = {
      stat: jest.fn(async (path) => ({ exists: path !== '/missing', size: 3 })),
      readChunk: jest.fn(async () => new Uint8Array([1, 2, 3])),
    };
    const sources: MediaSource[] = [
      { id: 'b', role: 'original', path: '/b', contentHash: 'b'.repeat(64), size: 3 },
      { id: 'a', role: 'original', path: '/a', contentHash: 'a'.repeat(64), size: 3 },
      { id: 'm', role: 'thumbnail', path: '/missing', contentHash: null, size: null },
    ];
    const first = await buildMediaInventory(sources, reader);
    const reordered = await buildMediaInventory([...sources].reverse(), reader);
    const changed = await buildMediaInventory([
      { ...sources[0], contentHash: 'c'.repeat(64) }, sources[1], sources[2],
    ], reader);

    expect(first.fingerprint).toBe(reordered.fingerprint);
    expect(first.fingerprint).not.toBe(changed.fingerprint);
    expect(first.entries.map((entry) => entry.id)).toEqual(['a', 'b', 'm']);
    expect(first.missingCount).toBe(1);
    expect(first.totalBytes).toBe(6);
  });

  it('hashes large files incrementally and backfills the hash without a whole-file read', async () => {
    const totalBytes = 3 * 1024 * 1024 + 17;
    const readSizes: number[] = [];
    const saveHash = jest.fn(async () => undefined);
    const reader: ChunkedFileReader = {
      stat: jest.fn(async () => ({ exists: true, size: totalBytes })),
      readChunk: jest.fn(async (_path, offset, length) => {
        readSizes.push(length);
        return new Uint8Array(Math.min(length, totalBytes - offset)).fill(7);
      }),
    };

    const result = await buildMediaInventory(
      [{ id: 'large', role: 'original', path: '/large', contentHash: null, size: null }],
      reader,
      { chunkBytes: 1024 * 1024, saveHash },
    );

    expect(result.entries[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(readSizes.length).toBeGreaterThan(1);
    expect(Math.max(...readSizes)).toBeLessThanOrEqual(1024 * 1024);
    expect(saveHash).toHaveBeenCalledWith('large', result.entries[0].contentHash, totalBytes);
  });

  it('tracks staged files and orphan cleanup never deletes an active upload session path', async () => {
    const written = new Map<string, string>();
    const files = {
      write: jest.fn(async (path: string, content: string) => { written.set(path, content); }),
      remove: jest.fn(async (path: string) => { written.delete(path); }),
    };
    const manager = createStagingManager({ directory: 'file:///staging', files, createId: () => 'stage-1' });
    const staged = await manager.stageData(await buildDataArtifact(manifest()));
    expect(manager.activePaths()).toEqual([staged.path]);

    await cleanupOrphanStaging(
      [
        { path: staged.path, modifiedAt: '2026-08-01T00:00:00.000Z' },
        { path: 'file:///staging/orphan.json', modifiedAt: '2026-08-01T00:00:00.000Z' },
        { path: 'file:///elsewhere/not-ours.json', modifiedAt: '2026-08-01T00:00:00.000Z' },
      ],
      new Set(manager.activePaths()),
      '2026-08-15T00:00:00.000Z',
      'file:///staging',
      files.remove,
    );
    expect(files.remove).toHaveBeenCalledTimes(1);
    expect(files.remove).toHaveBeenCalledWith('file:///staging/orphan.json');

    await manager.release(staged.path);
    expect(manager.activePaths()).toEqual([]);
  });

  it('creates and releases an installed staging artifact from the existing local Data exporter', async () => {
    const service = createInstalledDataStagingService(createNodeTestDb(), () => 'Physical Android');
    const staged = await service.prepare();

    expect(staged.path).toContain('drive-staging/drive-data-');
    expect(staged.artifact.itemCount).toBeGreaterThan(0);
    await expect(service.release(staged.path)).resolves.toBeUndefined();
  });

  it('rejects unsupported canonical values and a file that ends during chunked hashing', async () => {
    const invalid = manifest({ records: { idol: [{ id: 'bad', value: 1n as unknown }] } });
    await expect(buildDataArtifact(invalid)).rejects.toThrow(/unsupported/i);

    const reader: ChunkedFileReader = {
      stat: jest.fn(async () => ({ exists: true, size: 10 })),
      readChunk: jest.fn(async () => new Uint8Array()),
    };
    await expect(buildMediaInventory(
      [{ id: 'truncated', role: 'original', path: '/file', contentHash: null, size: null }],
      reader,
    )).rejects.toThrow(/changed/i);
  });

  it('classifies a zero-byte media file as missing instead of aborting the snapshot', async () => {
    const reader: ChunkedFileReader = {
      stat: jest.fn(async () => ({ exists: true, size: 0 })),
      readChunk: jest.fn(),
    };

    await expect(buildMediaInventory(
      [{ id: 'empty', role: 'original', path: '/empty', mimeType: 'video/mp4', contentHash: null, size: 0 }],
      reader,
    )).resolves.toMatchObject({
      missingCount: 1,
      totalBytes: 0,
      entries: [expect.objectContaining({ id: 'empty', missing: true, contentHash: null })],
    });
    expect(reader.readChunk).not.toHaveBeenCalled();
  });
});

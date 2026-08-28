import {
  collectMediaBlobReferences,
  selectOrphanMediaBlobs,
  selectRetainedSnapshots,
  type RetentionSnapshot,
} from '@/drive/retention';
import {
  createDriveCloudHistoryService,
  mergeCloudHistory,
  type CloudHistoryDrive,
  type CloudHistoryRemoteArtifact,
} from '@/drive/cloudHistory';
import type { DriveFile } from '@/drive/client';
import type { DriveBackupJob } from '@/drive/contracts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function snapshot(input: Partial<RetentionSnapshot> & Pick<RetentionSnapshot, 'snapshotId' | 'createdAt'>): RetentionSnapshot {
  return {
    category: 'data',
    remoteFileId: `remote-${input.snapshotId}`,
    deviceId: 'device-a',
    complete: true,
    ...input,
  };
}

function mediaManifestJson(input: {
  snapshotId: string;
  createdAt: string;
  deviceId: string;
  deviceLabel?: string;
  entries: { id: string; role: string; blobSha256: string | null; byteSize: number; mimeType: string | null; missing: boolean }[];
}): string {
  return JSON.stringify({
    formatVersion: 1,
    snapshotId: input.snapshotId,
    category: 'media',
    createdAt: input.createdAt,
    appVersion: '0.1.0',
    schemaVersion: 11,
    deviceId: input.deviceId,
    deviceLabel: input.deviceLabel ?? input.deviceId,
    contentFingerprint: HASH_A,
    entries: input.entries,
  });
}

function mediaFile(id: string, snapshotId: string, createdAt: string, deviceId = 'device-a'): DriveFile {
  const content = mediaManifestJson({ snapshotId, createdAt, deviceId, entries: [] });
  return {
    id,
    name: `media-manifest-${snapshotId}.json`,
    size: String(new TextEncoder().encode(content).byteLength),
    sha256Checksum: HASH_A,
    modifiedTime: createdAt,
    appProperties: {
      app: 'oshilog',
      formatVersion: '1',
      artifactType: 'media_manifest',
      category: 'media',
      snapshotId,
      deviceId,
      sha256: HASH_A,
      commitState: 'committed',
    },
  };
}

function job(input: Partial<DriveBackupJob> & Pick<DriveBackupJob, 'id' | 'category' | 'state' | 'createdAt'>): DriveBackupJob {
  return {
    trigger: 'manual',
    deviceId: 'device-a',
    cleanupPending: false,
    ...input,
  };
}

describe('T7 retention domain', () => {
  it('selects the exact deterministic deletion set after five Data snapshots', () => {
    const candidates = Array.from({ length: 6 }, (_, index) => snapshot({
      snapshotId: `snapshot-${index + 1}`,
      createdAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));

    const result = selectRetainedSnapshots(candidates);

    expect(result.retained.map((item) => item.snapshotId)).toEqual([
      'snapshot-6', 'snapshot-5', 'snapshot-4', 'snapshot-3', 'snapshot-2',
    ]);
    expect(result.obsolete.map((item) => item.snapshotId)).toEqual(['snapshot-1']);
  });

  it('protects the newest complete Media snapshot when newer snapshots are partial', () => {
    const candidates = [
      snapshot({ category: 'media', snapshotId: 'partial-6', createdAt: '2026-08-16T00:00:00.000Z', complete: false }),
      snapshot({ category: 'media', snapshotId: 'complete-5', createdAt: '2026-08-15T00:00:00.000Z', complete: true }),
      snapshot({ category: 'media', snapshotId: 'partial-4', createdAt: '2026-08-14T00:00:00.000Z', complete: false }),
      snapshot({ category: 'media', snapshotId: 'complete-3', createdAt: '2026-08-13T00:00:00.000Z', complete: true }),
      snapshot({ category: 'media', snapshotId: 'partial-2', createdAt: '2026-08-12T00:00:00.000Z', complete: false }),
      snapshot({ category: 'media', snapshotId: 'partial-1', createdAt: '2026-08-11T00:00:00.000Z', complete: false }),
    ];

    const result = selectRetainedSnapshots(candidates);

    expect(result.retained.map((item) => item.snapshotId)).toEqual([
      'complete-5', 'partial-6', 'partial-4', 'complete-3', 'partial-2',
    ]);
    expect(result.obsolete.map((item) => item.snapshotId)).toEqual(['partial-1']);
  });

  it('keeps shared blobs until the last retained manifest reference is gone', () => {
    const references = collectMediaBlobReferences([
      { entries: [{ blobSha256: HASH_A, missing: false }, { blobSha256: HASH_B, missing: false }] },
      { entries: [{ blobSha256: HASH_B, missing: false }] },
    ]);
    const orphaned = selectOrphanMediaBlobs([
      { remoteFileId: 'blob-a', sha256: HASH_A },
      { remoteFileId: 'blob-b', sha256: HASH_B },
      { remoteFileId: 'blob-c', sha256: HASH_C },
    ], references);

    expect([...references]).toEqual([HASH_A, HASH_B]);
    expect(orphaned.map((blob) => blob.remoteFileId)).toEqual(['blob-c']);
  });

  it('leaves unverifiable blobs untouched and rejects an invalid retention limit', () => {
    expect(selectOrphanMediaBlobs([
      { remoteFileId: 'missing-hash' },
      { remoteFileId: 'bad-hash', sha256: 'not-a-hash' },
    ], new Set())).toEqual([]);
    expect(() => selectRetainedSnapshots([], -1)).toThrow(/non-negative integer/i);
  });
});

describe('T7 cloud history and Drive retention', () => {
  it('merges committed remote history with local progress without losing cleanup state', () => {
    const remote: CloudHistoryRemoteArtifact[] = [{
      category: 'media', remoteFileId: 'manifest-1', snapshotId: 'snapshot-1',
      deviceId: 'device-a', deviceLabel: 'Pixel', createdAt: '2026-08-16T00:00:00.000Z',
      byteSize: 100, contentSha256: HASH_A, complete: false, missingCount: 1,
    }];
    const local = [job({
      id: 'job-1', category: 'media', state: 'partial', createdAt: '2026-08-16T00:00:01.000Z',
      snapshotId: 'snapshot-1', remoteFileId: 'manifest-1', bytesTotal: 100, bytesUploaded: 80,
      cleanupPending: true,
    })];

    const history = mergeCloudHistory(remote, local);

    expect(history).toEqual([expect.objectContaining({
      remoteFileId: 'manifest-1', status: 'partial', jobId: 'job-1',
      bytesTotal: 100, bytesUploaded: 80, cleanupPending: true, jobState: 'partial',
    })]);
  });

  it('lists committed remote artifacts and appends an unmatched local job', async () => {
    const dataFile: DriveFile = {
      id: 'data-1', name: 'data-snapshot-1.json', modifiedTime: '2026-08-15T00:00:00.000Z',
      appProperties: { app: 'oshilog', formatVersion: '1', artifactType: 'data', category: 'data', snapshotId: 'data-snapshot', commitState: 'committed' },
    };
    const media = mediaFile('manifest-1', 'media-snapshot', '2026-08-16T00:00:00.000Z');
    const contents = mediaManifestJson({ snapshotId: 'media-snapshot', createdAt: '2026-08-16T00:00:00.000Z', deviceId: 'device-a', entries: [] });
    const client = {
      listFiles: jest.fn(async (filter?: { artifactType?: string }) => filter?.artifactType === 'data' ? [dataFile] : [media]),
      downloadVerified: jest.fn(async () => new TextEncoder().encode(contents)),
      deleteFile: jest.fn(async () => undefined),
    } as unknown as CloudHistoryDrive;
    const service = createDriveCloudHistoryService({
      client,
      listJobs: () => [job({ id: 'local-job', category: 'data', state: 'uploading', createdAt: '2026-08-17T00:00:00.000Z', bytesTotal: 9, bytesUploaded: 3 })],
    });

    const history = await service.listHistory();

    expect(history.map((item) => item.status)).toEqual(['uploading', 'committed', 'committed']);
    expect(history[0]).toMatchObject({ jobId: 'local-job', bytesTotal: 9, bytesUploaded: 3 });
    expect(client.listFiles).toHaveBeenCalledWith(
      expect.objectContaining({ artifactType: 'data', commitState: 'committed' }), undefined,
    );
  });

  it('retains cross-device Media manifests and deletes only unreferenced blobs', async () => {
    const old = mediaFile('manifest-old', 'snapshot-old', '2026-08-01T00:00:00.000Z', 'device-b');
    const current = mediaFile('manifest-current', 'snapshot-current', '2026-08-16T00:00:00.000Z');
    const mediaContents = new Map([
      ['manifest-old', mediaManifestJson({
        snapshotId: 'snapshot-old', createdAt: '2026-08-01T00:00:00.000Z', deviceId: 'device-b',
        entries: [{ id: 'old', role: 'original', blobSha256: HASH_A, byteSize: 3, mimeType: 'image/jpeg', missing: false }],
      })],
      ['manifest-current', mediaManifestJson({
        snapshotId: 'snapshot-current', createdAt: '2026-08-16T00:00:00.000Z', deviceId: 'device-a',
        entries: [{ id: 'current', role: 'original', blobSha256: HASH_B, byteSize: 4, mimeType: 'image/jpeg', missing: false }],
      })],
    ]);
    const files: DriveFile[] = [old, current];
    const blobs: DriveFile[] = [
      { id: 'blob-a', name: `media-blob-${HASH_A}`, size: '3', sha256Checksum: HASH_A, appProperties: { app: 'oshilog', formatVersion: '1', artifactType: 'media_blob', category: 'media', sha256: HASH_A } },
      { id: 'blob-b', name: `media-blob-${HASH_B}`, size: '4', sha256Checksum: HASH_B, appProperties: { app: 'oshilog', formatVersion: '1', artifactType: 'media_blob', category: 'media', sha256: HASH_B } },
      { id: 'blob-c', name: `media-blob-${HASH_C}`, size: '5', sha256Checksum: HASH_C, appProperties: { app: 'oshilog', formatVersion: '1', artifactType: 'media_blob', category: 'media', sha256: HASH_C } },
    ];
    const deleted: string[] = [];
    const client = {
      listFiles: jest.fn(async (filter?: { artifactType?: string }) => filter?.artifactType === 'media_blob' ? blobs : files),
      downloadVerified: jest.fn(async (id: string) => new TextEncoder().encode(mediaContents.get(id)!)),
      deleteFile: jest.fn(async (id: string) => { deleted.push(id); }),
    } as unknown as CloudHistoryDrive;
    const service = createDriveCloudHistoryService({ client });

    const result = await service.runRetention('media');

    expect(result.retainedSnapshotIds).toEqual(['snapshot-current', 'snapshot-old']);
    expect(result.deletedSnapshotIds).toEqual([]);
    expect(result.deletedBlobIds).toEqual(['blob-c']);
    expect(deleted).toEqual(['blob-c']);
  });

  it('deletes only a Data snapshot, while Media deletion performs safe garbage collection', async () => {
    const dataFile: DriveFile = {
      id: 'data-1', name: 'data-snapshot-1.json', modifiedTime: '2026-08-16T00:00:00.000Z',
      appProperties: { app: 'oshilog', formatVersion: '1', artifactType: 'data', category: 'data', snapshotId: 'snapshot-1', commitState: 'committed' },
    };
    const media = mediaFile('manifest-1', 'snapshot-1', '2026-08-16T00:00:00.000Z');
    const contents = mediaManifestJson({ snapshotId: 'snapshot-1', createdAt: '2026-08-16T00:00:00.000Z', deviceId: 'device-a', entries: [] });
    const deleted: string[] = [];
    const client = {
      listFiles: jest.fn(async (filter?: { artifactType?: string; category?: string }) => {
        if (filter?.artifactType === 'data') return [dataFile];
        if (filter?.artifactType === 'media_manifest') return [media];
        return [{ id: 'orphan-blob', name: `media-blob-${HASH_C}`, size: '1', sha256Checksum: HASH_C, appProperties: { app: 'oshilog', formatVersion: '1', artifactType: 'media_blob', category: 'media', sha256: HASH_C } }];
      }),
      downloadVerified: jest.fn(async () => new TextEncoder().encode(contents)),
      deleteFile: jest.fn(async (id: string) => { deleted.push(id); }),
    } as unknown as CloudHistoryDrive;
    const service = createDriveCloudHistoryService({ client });

    await service.deleteSnapshot('data', 'data-1');
    expect(deleted).toEqual(['data-1']);

    await service.deleteSnapshot('media', 'manifest-1');
    expect(deleted).toEqual(['data-1', 'manifest-1', 'orphan-blob']);
  });
});

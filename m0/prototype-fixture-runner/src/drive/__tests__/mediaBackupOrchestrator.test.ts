import { sha256 } from '@noble/hashes/sha2.js';
import {
  MEDIA_UPLOAD_CHUNK_BYTES,
  buildMediaManifestArtifact,
  createDriveMediaGateway,
  createMediaBackupOrchestrator,
  type MediaBackupDrive,
  type PreparedMediaInventory,
} from '@/drive/mediaBackupOrchestrator';
import { DriveClientError, type DriveClient, type DriveFile, type ResumableProgress } from '@/drive/client';
import { createDriveRepo } from '@/repositories/drive';
import { createNodeTestDb } from '@/testing/nodeSqlite';

const NOW = '2026-08-16T04:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function remoteBlob(id: string, hash: string, size: number): DriveFile {
  return {
    id,
    name: `media-blob-${hash}`,
    size: String(size),
    sha256Checksum: hash,
    appProperties: {
      app: 'oshilog', formatVersion: '1', artifactType: 'media_blob', category: 'media', sha256: hash,
    },
  };
}

function prepared(entries: PreparedMediaInventory['entries']): PreparedMediaInventory {
  return {
    entries,
    fingerprint: sha256.create().update(new TextEncoder().encode(JSON.stringify(entries))).digest()
      .reduce((value, byte) => value + byte.toString(16).padStart(2, '0'), ''),
    totalBytes: entries.reduce((total, entry) => total + (entry.missing ? 0 : entry.size), 0),
    missingCount: entries.filter((entry) => entry.missing).length,
  };
}

function available(id: string, hash: string, size: number, path = `file:///${id}`, mimeType = 'image/jpeg') {
  return { id, role: 'original', localPath: path, contentHash: hash, size, mimeType, missing: false as const };
}

function missing(id: string) {
  return { id, role: 'original', localPath: null, contentHash: null, size: 0, mimeType: null, missing: true as const };
}

function fakeDrive(overrides: Partial<MediaBackupDrive> = {}): jest.Mocked<MediaBackupDrive> {
  return {
    listBlobs: jest.fn(async () => []),
    startBlobUpload: jest.fn(async () => 'https://www.googleapis.com/upload/drive/v3/files/session-1'),
    queryBlobUpload: jest.fn(async (): Promise<ResumableProgress> => ({ status: 'incomplete', nextOffset: 0 })),
    uploadBlobChunk: jest.fn(async (input) => ({ status: 'complete', file: remoteBlob('blob-new', input.sha256, input.totalBytes) })),
    verifyBlob: jest.fn(async () => undefined),
    uploadManifestStaging: jest.fn(async () => ({ id: 'manifest-remote' })),
    verifyManifestStaging: jest.fn(async () => undefined),
    commitManifest: jest.fn(async () => undefined),
    deleteManifestStaging: jest.fn(async () => undefined),
    ...overrides,
  } as jest.Mocked<MediaBackupDrive>;
}

async function setup(input: {
  inventory: PreparedMediaInventory;
  drive?: jest.Mocked<MediaBackupDrive>;
  readChunk?: (path: string, offset: number, length: number) => Promise<Uint8Array>;
}): Promise<{
  repo: ReturnType<typeof createDriveRepo>;
  drive: jest.Mocked<MediaBackupDrive>;
  secrets: { values: Map<string, string>; set: jest.Mock; get: jest.Mock; delete: jest.Mock };
  readChunk: jest.Mock;
  orchestrator: ReturnType<typeof createMediaBackupOrchestrator>;
}> {
  const repo = createDriveRepo(createNodeTestDb(), () => NOW);
  const drive = input.drive ?? fakeDrive();
  const values = new Map<string, string>();
  const secrets = {
    values,
    set: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    delete: jest.fn(async (key: string) => { values.delete(key); }),
  };
  const readChunk = jest.fn(input.readChunk ?? (async (_path: string, _offset: number, length: number) => new Uint8Array(length)));
  let id = 0;
  const orchestrator = createMediaBackupOrchestrator({
    repo,
    drive,
    inventory: { prepare: jest.fn(async () => input.inventory) },
    reader: { readChunk },
    secrets,
    acquireAccessToken: jest.fn(async () => 'ephemeral-token'),
    assertTriggerEligible: jest.fn(async () => undefined),
    now: () => NOW,
    createId: () => `id-${++id}`,
    deviceId: () => 'device-1',
    deviceLabel: () => 'Physical Android',
    appVersion: () => '0.1.0',
    schemaVersion: () => 11,
    leaseDurationMs: 60_000,
  });
  return { repo, drive, secrets, readChunk, orchestrator };
}

describe('incremental resumable Media backup', () => {
  it('returns no_change without listing or uploading Drive files', async () => {
    const inventory = prepared([available('same', HASH_A, 3)]);
    const context = await setup({ inventory });
    context.repo.updateSchedule({
      category: 'media', frequency: 'weekly', networkPolicy: 'wifi_only', lastFingerprint: inventory.fingerprint,
    });

    await expect(context.orchestrator.run({ trigger: 'scheduled' })).resolves.toMatchObject({ state: 'no_change' });
    expect(context.drive.listBlobs).not.toHaveBeenCalled();
    expect(context.drive.uploadManifestStaging).not.toHaveBeenCalled();
  });

  it('creates no blob session when every referenced hash already exists', async () => {
    const inventory = prepared([available('asset', HASH_A, 3)]);
    const drive = fakeDrive({ listBlobs: jest.fn(async () => [remoteBlob('blob-a', HASH_A, 3)]) });
    const context = await setup({ inventory, drive });

    const job = await context.orchestrator.run({ trigger: 'manual' });

    expect(job.state).toBe('committed');
    expect(drive.startBlobUpload).not.toHaveBeenCalled();
    expect(drive.verifyBlob).toHaveBeenCalledWith('blob-a', { sha256: HASH_A, size: 3 }, undefined);
    expect(drive.uploadManifestStaging).toHaveBeenCalledTimes(1);
  });

  it('fails a scheduled commit when ownership is lost after blob verification', async () => {
    const inventory = prepared([available('asset', HASH_A, 3)]);
    const context = await setup({ inventory });
    const guarded = createMediaBackupOrchestrator({
      repo: context.repo,
      drive: context.drive,
      inventory: { prepare: jest.fn(async () => inventory) },
      reader: { readChunk: jest.fn(async (_p: string, _o: number, l: number) => new Uint8Array(l)) },
      secrets: context.secrets,
      acquireAccessToken: jest.fn(async () => 'ephemeral-token'),
      assertTriggerEligible: jest.fn(async () => undefined),
      assertCommitEligible: jest.fn(async () => { throw new DriveClientError('NOT_OWNER', 'Another device now owns scheduled backups.'); }),
      now: () => NOW,
      createId: () => 'id-guarded-media',
      deviceId: () => 'device-1',
      deviceLabel: () => 'Physical Android',
      appVersion: () => '0.1.0',
      schemaVersion: () => 11,
      leaseDurationMs: 60_000,
    });

    const job = await guarded.run({ trigger: 'scheduled' });

    expect(job).toMatchObject({ state: 'failed', errorCode: 'NOT_OWNER' });
    expect(context.drive.commitManifest).not.toHaveBeenCalled();
    expect(context.drive.deleteManifestStaging).toHaveBeenCalled();
  });

  it('keeps a committed Media result when retention cleanup fails', async () => {
    const inventory = prepared([available('asset', HASH_A, 3)]);
    const drive = fakeDrive({
      runRetention: jest.fn(async () => { throw new Error('cleanup failed'); }),
    });
    const context = await setup({ inventory, drive });

    const job = await context.orchestrator.run({ trigger: 'manual' });

    expect(job).toMatchObject({ state: 'committed', cleanupPending: true });
    expect(drive.commitManifest).toHaveBeenCalledTimes(1);
    expect(drive.runRetention).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing verified hash and uploads only changed/missing content', async () => {
    const inventory = prepared([available('same', HASH_A, 3), available('changed', HASH_B, 4)]);
    const drive = fakeDrive({ listBlobs: jest.fn(async () => [remoteBlob('blob-a', HASH_A, 3)]) });
    const context = await setup({ inventory, drive });

    const job = await context.orchestrator.run({ trigger: 'manual' });

    expect(job.state).toBe('committed');
    expect(drive.startBlobUpload).toHaveBeenCalledTimes(1);
    expect(drive.startBlobUpload).toHaveBeenCalledWith(expect.objectContaining({ sha256: HASH_B, totalBytes: 4 }));
    expect(context.readChunk).toHaveBeenCalledWith('file:///changed', 0, 4);
    expect(context.readChunk).not.toHaveBeenCalledWith('file:///same', expect.anything(), expect.anything());
    expect(drive.verifyBlob).toHaveBeenCalledWith('blob-a', { sha256: HASH_A, size: 3 }, undefined);
    expect(drive.verifyBlob).toHaveBeenCalledWith('blob-new', { sha256: HASH_B, size: 4 }, undefined);
  });

  it('persists every acknowledgement and resumes only after explicit retry at the server-confirmed offset', async () => {
    const size = MEDIA_UPLOAD_CHUNK_BYTES + 7;
    const inventory = prepared([available('large', HASH_B, size, 'file:///large', 'video/mp4')]);
    let uploadAttempt = 0;
    const events: string[] = [];
    const drive = fakeDrive({
      uploadBlobChunk: jest.fn(async (input): Promise<ResumableProgress> => {
        events.push(`chunk:${input.offset}`);
        uploadAttempt += 1;
        if (uploadAttempt === 1) return { status: 'incomplete', nextOffset: MEDIA_UPLOAD_CHUNK_BYTES };
        if (uploadAttempt === 2) throw new DriveClientError('UNKNOWN', 'interrupted');
        return { status: 'complete', file: remoteBlob('blob-resumed', HASH_B, size) };
      }),
      queryBlobUpload: jest.fn(async (): Promise<ResumableProgress> => {
        events.push('query');
        return { status: 'incomplete', nextOffset: MEDIA_UPLOAD_CHUNK_BYTES };
      }),
    });
    const context = await setup({ inventory, drive });

    const first = await context.orchestrator.run({ trigger: 'manual' });
    expect(first.state).toBe('failed');
    expect(context.repo.listUploadSessions()).toEqual([
      expect.objectContaining({ jobId: first.id, artifactKey: HASH_B, uploadedOffset: MEDIA_UPLOAD_CHUNK_BYTES }),
    ]);

    events.length = 0;
    const retried = await context.orchestrator.run({ trigger: 'notification_retry', retryJobId: first.id });

    expect(retried.state).toBe('committed');
    expect(events).toEqual(['query', `chunk:${MEDIA_UPLOAD_CHUNK_BYTES}`]);
    expect(context.readChunk).toHaveBeenLastCalledWith('file:///large', MEDIA_UPLOAD_CHUNK_BYTES, 7);
    expect(context.repo.listUploadSessions()).toEqual([]);
    expect(context.secrets.values.size).toBe(0);
  });

  it('starts a fresh session after Drive expires the saved one and commits one manifest only', async () => {
    const size = MEDIA_UPLOAD_CHUNK_BYTES + 1;
    const inventory = prepared([available('large', HASH_B, size)]);
    let chunkCall = 0;
    const drive = fakeDrive({
      startBlobUpload: jest.fn(async () => `https://www.googleapis.com/upload/drive/v3/files/session-${chunkCall}`),
      uploadBlobChunk: jest.fn(async (input): Promise<ResumableProgress> => {
        chunkCall += 1;
        if (chunkCall === 1) return { status: 'incomplete', nextOffset: MEDIA_UPLOAD_CHUNK_BYTES };
        if (chunkCall === 2) throw new DriveClientError('UNKNOWN', 'interrupted');
        return { status: 'complete', file: remoteBlob('blob-restarted', HASH_B, size) };
      }),
      queryBlobUpload: jest.fn(async () => { throw new DriveClientError('UPLOAD_SESSION_EXPIRED', 'expired'); }),
    });
    const context = await setup({ inventory, drive });
    const first = await context.orchestrator.run({ trigger: 'manual' });

    const retried = await context.orchestrator.run({ trigger: 'notification_retry', retryJobId: first.id });

    expect(retried.state).toBe('committed');
    expect(drive.startBlobUpload).toHaveBeenCalledTimes(2);
    expect(drive.uploadManifestStaging).toHaveBeenCalledTimes(1);
    expect(drive.commitManifest).toHaveBeenCalledTimes(1);
  });

  it('accepts a server-confirmed completed retry without re-reading the local file', async () => {
    const inventory = prepared([available('large', HASH_B, 9)]);
    let first = true;
    const drive = fakeDrive({
      uploadBlobChunk: jest.fn(async (input): Promise<ResumableProgress> => {
        if (first) {
          first = false;
          throw new DriveClientError('UNKNOWN', 'interrupted');
        }
        return { status: 'complete', file: remoteBlob('unexpected', input.sha256, input.totalBytes) };
      }),
      queryBlobUpload: jest.fn(async (): Promise<ResumableProgress> => ({
        status: 'complete', file: remoteBlob('already-complete', HASH_B, 9),
      })),
    });
    const context = await setup({ inventory, drive });
    const failed = await context.orchestrator.run({ trigger: 'manual' });
    context.readChunk.mockClear();

    await expect(context.orchestrator.run({ trigger: 'notification_retry', retryJobId: failed.id }))
      .resolves.toMatchObject({ state: 'committed' });
    expect(context.readChunk).not.toHaveBeenCalled();
    expect(drive.verifyBlob).toHaveBeenCalledWith('already-complete', { sha256: HASH_B, size: 9 }, undefined);
  });

  it('discards a locally expired saved session before starting a new one', async () => {
    const inventory = prepared([available('large', HASH_B, 9)]);
    let first = true;
    const drive = fakeDrive({
      uploadBlobChunk: jest.fn(async (input): Promise<ResumableProgress> => {
        if (first) {
          first = false;
          throw new DriveClientError('UNKNOWN', 'interrupted');
        }
        return { status: 'complete', file: remoteBlob('fresh', input.sha256, input.totalBytes) };
      }),
    });
    const context = await setup({ inventory, drive });
    const failed = await context.orchestrator.run({ trigger: 'manual' });
    const saved = context.repo.listUploadSessions()[0];
    context.repo.saveUploadSession({ ...saved, expiresAt: NOW, updatedAt: NOW });

    await expect(context.orchestrator.run({ trigger: 'notification_retry', retryJobId: failed.id }))
      .resolves.toMatchObject({ state: 'committed' });
    expect(drive.queryBlobUpload).not.toHaveBeenCalled();
    expect(drive.startBlobUpload).toHaveBeenCalledTimes(2);
  });

  it('verifies every available blob before publishing the manifest and keeps reads bounded to 5 MiB', async () => {
    const size = MEDIA_UPLOAD_CHUNK_BYTES * 2 + 3;
    const inventory = prepared([available('large', HASH_B, size)]);
    const events: string[] = [];
    let uploaded = 0;
    const drive = fakeDrive({
      uploadBlobChunk: jest.fn(async (input): Promise<ResumableProgress> => {
        uploaded += input.chunk.byteLength;
        return uploaded < size
          ? { status: 'incomplete', nextOffset: uploaded }
          : { status: 'complete', file: remoteBlob('blob-large', HASH_B, size) };
      }),
      verifyBlob: jest.fn(async () => { events.push('verify-blob'); }),
      uploadManifestStaging: jest.fn(async () => { events.push('upload-manifest'); return { id: 'manifest-remote' }; }),
    });
    const context = await setup({ inventory, drive });

    await expect(context.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({ state: 'committed' });

    expect(events).toEqual(['verify-blob', 'upload-manifest']);
    expect(Math.max(...context.readChunk.mock.calls.map((call) => call[2] as number))).toBe(MEDIA_UPLOAD_CHUNK_BYTES);
    expect(context.readChunk).toHaveBeenCalledTimes(3);
  });

  it('commits a partial manifest that explicitly records missing local media', async () => {
    const inventory = prepared([available('present', HASH_A, 3), missing('gone')]);
    const drive = fakeDrive();
    const context = await setup({ inventory, drive });

    const job = await context.orchestrator.run({ trigger: 'manual' });

    expect(job.state).toBe('partial');
    const artifact = drive.uploadManifestStaging.mock.calls[0][0].artifact;
    expect(artifact.manifest.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'gone', missing: true, blobSha256: null }),
      expect.objectContaining({ id: 'present', missing: false, blobSha256: HASH_A }),
    ]));
  });

  it('does not publish a manifest when any blob verification fails', async () => {
    const drive = fakeDrive({
      verifyBlob: jest.fn(async () => { throw new DriveClientError('CHECKSUM_MISMATCH', 'mismatch'); }),
    });
    const context = await setup({ inventory: prepared([available('bad', HASH_A, 3)]), drive });

    await expect(context.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'CHECKSUM_MISMATCH',
    });
    expect(drive.uploadManifestStaging).not.toHaveBeenCalled();
    expect(drive.commitManifest).not.toHaveBeenCalled();
  });

  it('cancels between acknowledged chunks and deletes its resumable secret/session', async () => {
    const controller = new AbortController();
    const size = MEDIA_UPLOAD_CHUNK_BYTES + 1;
    const drive = fakeDrive({
      uploadBlobChunk: jest.fn(async (): Promise<ResumableProgress> => {
        controller.abort();
        return { status: 'incomplete', nextOffset: MEDIA_UPLOAD_CHUNK_BYTES };
      }),
    });
    const context = await setup({ inventory: prepared([available('large', HASH_B, size)]), drive });

    await expect(context.orchestrator.run({ trigger: 'manual', signal: controller.signal }))
      .resolves.toMatchObject({ state: 'cancelled', errorCode: 'CANCELLED' });
    expect(context.repo.listUploadSessions()).toEqual([]);
    expect(context.secrets.values.size).toBe(0);
    expect(drive.uploadManifestStaging).not.toHaveBeenCalled();
  });

  it('rejects a non-advancing Drive acknowledgement and preserves a resumable failure', async () => {
    const drive = fakeDrive({
      uploadBlobChunk: jest.fn(async (): Promise<ResumableProgress> => ({ status: 'incomplete', nextOffset: 0 })),
    });
    const context = await setup({ inventory: prepared([available('bad-offset', HASH_B, 3)]), drive });

    await expect(context.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'BACKUP_INVALID',
    });
    expect(context.repo.listUploadSessions()).toHaveLength(1);
    expect(drive.uploadManifestStaging).not.toHaveBeenCalled();
  });

  it('rejects out-of-range offsets, short local reads, and unusable zero-byte media', async () => {
    const badOffset = await setup({
      inventory: prepared([available('offset', HASH_B, 3)]),
      drive: fakeDrive({
        uploadBlobChunk: jest.fn(async (): Promise<ResumableProgress> => ({ status: 'incomplete', nextOffset: 4 })),
      }),
    });
    await expect(badOffset.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'BACKUP_INVALID',
    });

    const shortRead = await setup({
      inventory: prepared([available('short', HASH_B, 3)]),
      readChunk: async () => new Uint8Array(2),
    });
    await expect(shortRead.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'LOCAL_FILE_MISSING',
    });

    const zero = await setup({ inventory: prepared([available('zero', HASH_B, 0)]) });
    await expect(zero.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'LOCAL_FILE_MISSING',
    });
  });

  it('rejects invalid or size-conflicting inventory hashes before any manifest is created', async () => {
    const invalid = await setup({ inventory: prepared([available('invalid', 'not-a-sha', 3)]) });
    await expect(invalid.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'BACKUP_INVALID',
    });

    const conflict = await setup({
      inventory: prepared([available('one', HASH_A, 3), available('two', HASH_A, 4)]),
    });
    await expect(conflict.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'BACKUP_INVALID',
    });
    expect(invalid.drive.uploadManifestStaging).not.toHaveBeenCalled();
    expect(conflict.drive.uploadManifestStaging).not.toHaveBeenCalled();
  });

  it('maps authorization and unknown failures to redacted persistent errors', async () => {
    const auth = await setup({
      inventory: prepared([available('asset', HASH_A, 3)]),
      drive: fakeDrive({ listBlobs: jest.fn(async () => { throw { code: 'AUTH_REQUIRED', token: 'secret' }; }) }),
    });
    await expect(auth.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'AUTH_REQUIRED', errorDetailSafe: 'Google authorization is required.',
    });

    const unknown = await setup({
      inventory: prepared([available('asset', HASH_A, 3)]),
      drive: fakeDrive({ listBlobs: jest.fn(async () => { throw new Error('private response body'); }) }),
    });
    const job = await unknown.orchestrator.run({ trigger: 'manual' });
    expect(job).toMatchObject({ state: 'failed', errorCode: 'UNKNOWN', errorDetailSafe: 'Drive backup failed.' });
    expect(JSON.stringify(job)).not.toContain('private response body');
  });

  it('deletes an uncommitted manifest and marks cleanup pending if that deletion fails', async () => {
    const deleted = fakeDrive({
      verifyManifestStaging: jest.fn(async () => { throw new DriveClientError('CHECKSUM_MISMATCH', 'bad'); }),
    });
    const first = await setup({ inventory: prepared([missing('gone')]), drive: deleted });
    await expect(first.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({ state: 'failed' });
    expect(deleted.deleteManifestStaging).toHaveBeenCalledWith('manifest-remote', undefined);

    const cleanupFailed = fakeDrive({
      verifyManifestStaging: jest.fn(async () => { throw new DriveClientError('CHECKSUM_MISMATCH', 'bad'); }),
      deleteManifestStaging: jest.fn(async () => { throw new Error('cleanup failed'); }),
    });
    const second = await setup({ inventory: prepared([missing('gone')]), drive: cleanupFailed });
    await expect(second.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', cleanupPending: true,
    });
  });

  it('starts over when the retry session secret has already been removed', async () => {
    const inventory = prepared([available('asset', HASH_B, 3)]);
    let first = true;
    const drive = fakeDrive({
      uploadBlobChunk: jest.fn(async (input): Promise<ResumableProgress> => {
        if (first) {
          first = false;
          throw new DriveClientError('UNKNOWN', 'interrupted');
        }
        return { status: 'complete', file: remoteBlob('fresh', input.sha256, input.totalBytes) };
      }),
    });
    const context = await setup({ inventory, drive });
    const failed = await context.orchestrator.run({ trigger: 'manual' });
    context.secrets.values.clear();

    await expect(context.orchestrator.run({ trigger: 'notification_retry', retryJobId: failed.id }))
      .resolves.toMatchObject({ state: 'committed' });
    expect(drive.queryBlobUpload).not.toHaveBeenCalled();
    expect(drive.startBlobUpload).toHaveBeenCalledTimes(2);
  });

  it('returns the active Media job under lease contention and otherwise reports LOCKED', async () => {
    const activeContext = await setup({ inventory: prepared([]) });
    const active = activeContext.repo.createJob(
      { category: 'media', trigger: 'manual', deviceId: 'device-1' }, () => 'active-job',
    );
    activeContext.repo.transitionJob(active.id, 'queued', 'preparing');
    expect(activeContext.repo.acquireLease('external', 'media_manual', 60_000)).toBe(true);
    await expect(activeContext.orchestrator.run({ trigger: 'scheduled' })).resolves.toMatchObject({ id: 'active-job' });

    const lockedContext = await setup({ inventory: prepared([]) });
    expect(lockedContext.repo.acquireLease('external', 'other', 60_000)).toBe(true);
    await expect(lockedContext.orchestrator.run({ trigger: 'manual' })).rejects.toMatchObject({ code: 'LOCKED' });
  });
});

describe('Media manifest and Drive gateway', () => {
  it('builds deterministic manifest bytes and commits staging metadata last', async () => {
    const artifact = buildMediaManifestArtifact({
      snapshotId: 'snap-1', batchId: 'batch-1', createdAt: NOW, appVersion: '0.1.0', schemaVersion: 11,
      deviceId: 'device-1', deviceLabel: 'Pixel', contentFingerprint: HASH_A,
      entries: [available('asset-1', HASH_B, 4)],
    });
    expect(artifact.contentSha256).toMatch(/^[a-f0-9]{64}$/);

    const client = {
      listFiles: jest.fn(async () => []),
      startResumable: jest.fn(async () => 'https://www.googleapis.com/upload/drive/v3/files/session'),
      queryResumable: jest.fn(), uploadChunk: jest.fn(),
      getMetadata: jest.fn(async () => ({
        id: 'remote', name: 'manifest', size: String(artifact.bytes), sha256Checksum: artifact.contentSha256,
      })),
      createMultipart: jest.fn(async () => ({ id: 'remote', name: 'manifest' })),
      updateMetadata: jest.fn(async () => ({ id: 'remote', name: 'manifest' })),
      deleteFile: jest.fn(async () => undefined),
    } as unknown as DriveClient;
    const gateway = createDriveMediaGateway(client);
    const remote = await gateway.uploadManifestStaging({ artifact, snapshotId: 'snap-1', deviceId: 'device-1' });
    await gateway.verifyManifestStaging(remote.id, artifact);
    await gateway.commitManifest(remote.id, { artifact, snapshotId: 'snap-1', deviceId: 'device-1' });

    expect((client as unknown as { createMultipart: jest.Mock }).createMultipart).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'media-manifest-snap-1.json',
        appProperties: expect.objectContaining({ artifactType: 'media_manifest', commitState: 'staging' }),
      }), artifact.json, 'application/json', undefined,
    );
    expect((client as unknown as { updateMetadata: jest.Mock }).updateMetadata).toHaveBeenCalledWith(
      'remote', expect.objectContaining({ appProperties: expect.objectContaining({ commitState: 'committed' }) }), undefined,
    );
  });

  it('delegates blob resumable operations, verifies blob metadata, and deletes only manifest staging', async () => {
    const file = remoteBlob('blob', HASH_A, 3);
    const client = {
      listFiles: jest.fn(async () => [file]),
      startResumable: jest.fn(async () => 'https://www.googleapis.com/upload/drive/v3/files/session'),
      queryResumable: jest.fn(async (): Promise<ResumableProgress> => ({ status: 'incomplete', nextOffset: 1 })),
      uploadChunk: jest.fn(async (): Promise<ResumableProgress> => ({ status: 'complete', file })),
      getMetadata: jest.fn(async () => file),
      deleteFile: jest.fn(async () => undefined),
    } as unknown as DriveClient;
    const gateway = createDriveMediaGateway(client);

    await expect(gateway.listBlobs()).resolves.toEqual([file]);
    const sessionUrl = await gateway.startBlobUpload({ sha256: HASH_A, totalBytes: 3, mimeType: 'image/jpeg' });
    await expect(gateway.queryBlobUpload({ sessionUrl, totalBytes: 3 })).resolves.toMatchObject({ nextOffset: 1 });
    await expect(gateway.uploadBlobChunk({
      sessionUrl, sha256: HASH_A, chunk: new Uint8Array([1, 2]), offset: 1, totalBytes: 3,
    })).resolves.toMatchObject({ status: 'complete' });
    await expect(gateway.verifyBlob('blob', { sha256: HASH_A, size: 3 })).resolves.toBeUndefined();
    await expect(gateway.deleteManifestStaging('manifest')).resolves.toBeUndefined();

    expect((client as unknown as { startResumable: jest.Mock }).startResumable).toHaveBeenCalledWith(
      expect.objectContaining({ name: `media-blob-${HASH_A}` }), 'image/jpeg', 3, undefined,
    );
    expect((client as unknown as { deleteFile: jest.Mock }).deleteFile).toHaveBeenCalledWith('manifest', undefined);
  });

  it('rejects invalid blob names and checksum mismatches', async () => {
    const client = {
      getMetadata: jest.fn(async () => ({ id: 'bad', name: 'bad', size: '2', sha256Checksum: HASH_B })),
    } as unknown as DriveClient;
    const gateway = createDriveMediaGateway(client);
    expect(() => gateway.startBlobUpload({ sha256: 'invalid', totalBytes: 3, mimeType: 'image/jpeg' }))
      .toThrow(expect.objectContaining({ code: 'BACKUP_INVALID' }));
    await expect(gateway.verifyBlob('bad', { sha256: HASH_A, size: 3 }))
      .rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    await expect(gateway.verifyManifestStaging('bad', {
      manifest: {} as never, json: '{}', bytes: 2, contentSha256: HASH_A,
    })).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
  });
});

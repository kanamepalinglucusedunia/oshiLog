import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { DriveClient, DriveFile, ResumableProgress } from './client';
import { DriveClientError } from './client';
import { createDriveCloudHistoryService } from './cloudHistory';
import type { DriveBackupJob, DriveTrigger, DriveUploadSession } from './contracts';
import { mediaManifestSchema, type MediaManifest } from './mediaManifest';
import type { MediaInventoryEntry } from './staging';
import type { DriveRepo } from '@/repositories/drive';

export const MEDIA_UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export { mediaManifestSchema };
export type { MediaManifest };
export type MediaManifestArtifact = {
  manifest: MediaManifest;
  json: string;
  bytes: number;
  contentSha256: string;
};

export type PreparedMediaInventory = {
  entries: MediaInventoryEntry[];
  fingerprint: string;
  totalBytes: number;
  missingCount: number;
};

export type MediaBackupDrive = {
  listBlobs(signal?: AbortSignal): Promise<DriveFile[]>;
  startBlobUpload(input: {
    sha256: string;
    totalBytes: number;
    mimeType: string;
    signal?: AbortSignal;
  }): Promise<string>;
  queryBlobUpload(input: {
    sessionUrl: string;
    totalBytes: number;
    signal?: AbortSignal;
  }): Promise<ResumableProgress>;
  uploadBlobChunk(input: {
    sessionUrl: string;
    sha256: string;
    chunk: Uint8Array;
    offset: number;
    totalBytes: number;
    signal?: AbortSignal;
  }): Promise<ResumableProgress>;
  verifyBlob(remoteId: string, expected: { sha256: string; size: number }, signal?: AbortSignal): Promise<void>;
  uploadManifestStaging(input: {
    artifact: MediaManifestArtifact;
    snapshotId: string;
    deviceId: string;
    signal?: AbortSignal;
  }): Promise<{ id: string }>;
  verifyManifestStaging(remoteId: string, artifact: MediaManifestArtifact, signal?: AbortSignal): Promise<void>;
  commitManifest(remoteId: string, input: {
    artifact: MediaManifestArtifact;
    snapshotId: string;
    deviceId: string;
    signal?: AbortSignal;
  }): Promise<void>;
  deleteManifestStaging(remoteId: string, signal?: AbortSignal): Promise<void>;
  runRetention?(signal?: AbortSignal): Promise<void>;
};

export type MediaBackupRunInput = {
  trigger: DriveTrigger;
  batchId?: string;
  retryJobId?: string;
  signal?: AbortSignal;
};

type SecretStore = {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
};

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableEntries(entries: readonly MediaInventoryEntry[]) {
  return [...entries]
    .sort((left, right) => `${left.id}\0${left.role}`.localeCompare(`${right.id}\0${right.role}`))
    .map((entry) => ({
      id: entry.id,
      role: entry.role,
      blobSha256: entry.missing ? null : entry.contentHash,
      byteSize: entry.size,
      mimeType: entry.mimeType,
      missing: entry.missing,
    }));
}

export function buildMediaManifestArtifact(input: {
  snapshotId: string;
  batchId?: string;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  deviceId: string;
  deviceLabel: string;
  contentFingerprint: string;
  entries: readonly MediaInventoryEntry[];
}): MediaManifestArtifact {
  const manifest = mediaManifestSchema.parse({
    formatVersion: 1,
    snapshotId: input.snapshotId,
    batchId: input.batchId,
    category: 'media',
    createdAt: input.createdAt,
    appVersion: input.appVersion,
    schemaVersion: input.schemaVersion,
    deviceId: input.deviceId,
    deviceLabel: input.deviceLabel,
    contentFingerprint: input.contentFingerprint,
    entries: stableEntries(input.entries),
  });
  const json = JSON.stringify(manifest);
  const bytes = utf8ToBytes(json);
  return { manifest, json, bytes: bytes.byteLength, contentSha256: hex(sha256(bytes)) };
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DriveClientError('CANCELLED', 'Drive backup was cancelled.');
}

function safeFailure(error: unknown): { code: DriveBackupJob['errorCode']; detail: string; cancelled: boolean } {
  if (error instanceof DriveClientError) {
    return {
      code: error.code,
      detail: error.code === 'CANCELLED' ? 'Backup cancelled.' : `Drive backup failed (${error.code}).`,
      cancelled: error.code === 'CANCELLED',
    };
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'AUTH_REQUIRED') {
    return { code: 'AUTH_REQUIRED', detail: 'Google authorization is required.', cancelled: false };
  }
  return { code: 'UNKNOWN', detail: 'Drive backup failed.', cancelled: false };
}

function validateOffset(offset: number, totalBytes: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > totalBytes) {
    throw new DriveClientError('BACKUP_INVALID', 'Drive returned an invalid resumable upload offset.');
  }
  return offset;
}

function resumableExpiry(now: string): string {
  return new Date(Date.parse(now) + SESSION_LIFETIME_MS).toISOString();
}

export function createMediaBackupOrchestrator(dependencies: {
  repo: DriveRepo;
  drive: MediaBackupDrive;
  inventory: { prepare(): Promise<PreparedMediaInventory> };
  reader: { readChunk(path: string, offset: number, length: number): Promise<Uint8Array> };
  secrets: SecretStore;
  acquireAccessToken: () => Promise<string>;
  assertTriggerEligible: (trigger: DriveTrigger) => Promise<void>;
  assertCommitEligible?: (trigger: DriveTrigger) => Promise<void>;
  now: () => string;
  createId: () => string;
  deviceId: () => string;
  deviceLabel: () => string;
  appVersion: () => string;
  schemaVersion: () => number;
  leaseDurationMs: number;
}) {
  const { repo, drive } = dependencies;

  async function clearSession(session: DriveUploadSession): Promise<void> {
    await dependencies.secrets.delete(session.sessionUriSecretKey);
    repo.deleteUploadSession(session.id);
  }

  async function startSession(
    jobId: string,
    entry: MediaInventoryEntry,
    signal?: AbortSignal,
  ): Promise<{ session: DriveUploadSession; sessionUrl: string }> {
    const sessionUrl = await drive.startBlobUpload({
      sha256: entry.contentHash!,
      totalBytes: entry.size,
      mimeType: entry.mimeType ?? 'application/octet-stream',
      signal,
    });
    const id = dependencies.createId();
    const key = `drive-session:${id}`;
    await dependencies.secrets.set(key, sessionUrl);
    try {
      const session = repo.saveUploadSession({
        id,
        jobId,
        artifactKey: entry.contentHash!,
        localStagingPath: entry.localPath!,
        sessionUriSecretKey: key,
        uploadedOffset: 0,
        totalBytes: entry.size,
        expiresAt: resumableExpiry(dependencies.now()),
        updatedAt: dependencies.now(),
      });
      return { session, sessionUrl };
    } catch (error) {
      await dependencies.secrets.delete(key);
      throw error;
    }
  }

  async function resumableBlob(input: {
    jobId: string;
    retryJobId?: string;
    entry: MediaInventoryEntry;
    signal?: AbortSignal;
    onProgress(offset: number): void;
  }): Promise<string> {
    const { entry } = input;
    if (!entry.localPath || !entry.contentHash || !SHA256_PATTERN.test(entry.contentHash) || entry.size <= 0) {
      throw new DriveClientError('LOCAL_FILE_MISSING', 'Local media is unavailable.');
    }

    let session: DriveUploadSession | null = null;
    let sessionUrl: string | null = null;
    let offset = 0;
    let completed: DriveFile | null = null;
    if (input.retryJobId) {
      session = repo.listUploadSessions().find((candidate) => (
        candidate.jobId === input.retryJobId
        && candidate.artifactKey === entry.contentHash
        && candidate.totalBytes === entry.size
        && candidate.localStagingPath === entry.localPath
      )) ?? null;
    }

    if (session) {
      if (session.expiresAt <= dependencies.now()) {
        await clearSession(session);
        session = null;
      } else {
        sessionUrl = await dependencies.secrets.get(session.sessionUriSecretKey);
        if (!sessionUrl) {
          repo.deleteUploadSession(session.id);
          session = null;
        }
      }
    }

    if (session && sessionUrl) {
      session = repo.saveUploadSession({ ...session, jobId: input.jobId, updatedAt: dependencies.now() });
      try {
        const server = await drive.queryBlobUpload({ sessionUrl, totalBytes: entry.size, signal: input.signal });
        if (server.status === 'complete') {
          completed = server.file;
          offset = entry.size;
        } else {
          offset = validateOffset(server.nextOffset, entry.size);
          session = repo.saveUploadSession({ ...session, uploadedOffset: offset, updatedAt: dependencies.now() });
          input.onProgress(offset);
        }
      } catch (error) {
        if (!(error instanceof DriveClientError) || error.code !== 'UPLOAD_SESSION_EXPIRED') throw error;
        await clearSession(session);
        session = null;
        sessionUrl = null;
      }
    }

    if (!completed && (!session || !sessionUrl)) {
      const started = await startSession(input.jobId, entry, input.signal);
      session = started.session;
      sessionUrl = started.sessionUrl;
      offset = 0;
    }

    while (!completed && offset < entry.size) {
      throwIfCancelled(input.signal);
      const length = Math.min(MEDIA_UPLOAD_CHUNK_BYTES, entry.size - offset);
      const chunk = await dependencies.reader.readChunk(entry.localPath, offset, length);
      if (chunk.byteLength !== length) {
        throw new DriveClientError('LOCAL_FILE_MISSING', 'Local media changed during upload.');
      }
      const acknowledged = await drive.uploadBlobChunk({
        sessionUrl: sessionUrl!,
        sha256: entry.contentHash,
        chunk,
        offset,
        totalBytes: entry.size,
        signal: input.signal,
      });
      if (acknowledged.status === 'complete') {
        completed = acknowledged.file;
        offset = entry.size;
      } else {
        const next = validateOffset(acknowledged.nextOffset, entry.size);
        if (next <= offset) throw new DriveClientError('BACKUP_INVALID', 'Drive upload made no progress.');
        offset = next;
      }
      session = repo.saveUploadSession({ ...session!, uploadedOffset: offset, updatedAt: dependencies.now() });
      input.onProgress(offset);
    }

    if (!completed) throw new DriveClientError('BACKUP_INVALID', 'Drive did not complete the media upload.');
    await drive.verifyBlob(completed.id, { sha256: entry.contentHash, size: entry.size }, input.signal);
    if (session) await clearSession(session);
    return completed.id;
  }

  return {
    async run(input: MediaBackupRunInput): Promise<DriveBackupJob> {
      const holderId = dependencies.createId();
      if (!repo.acquireLease(holderId, `media_${input.trigger}`, dependencies.leaseDurationMs)) {
        const active = repo.findActiveJob('media');
        if (active) return active;
        throw new DriveClientError('LOCKED', 'A Drive backup operation is already active.');
      }

      let job: DriveBackupJob | null = null;
      let manifestRemoteId: string | null = null;
      let manifestCommitted = false;
      try {
        job = repo.createJob({
          category: 'media', trigger: input.trigger, deviceId: dependencies.deviceId(), batchId: input.batchId,
        }, dependencies.createId);
        repo.transitionJob(job.id, 'queued', 'preparing');
        throwIfCancelled(input.signal);
        await dependencies.acquireAccessToken();
        await dependencies.assertTriggerEligible(input.trigger);
        const inventory = await dependencies.inventory.prepare();
        const schedule = repo.listSchedules().find((item) => item.category === 'media');
        if (!schedule) throw new Error('Media backup schedule is missing.');

        if (schedule.lastFingerprint === inventory.fingerprint) {
          repo.transitionJob(job.id, 'preparing', 'no_change', {
            contentFingerprint: inventory.fingerprint,
            bytesTotal: inventory.totalBytes,
            bytesUploaded: 0,
            itemCount: inventory.entries.length,
          });
          repo.updateSchedule({
            ...schedule, lastCheckedAt: dependencies.now(), lastAttemptAt: dependencies.now(), lastResult: 'no_change',
          });
          return repo.getJob(job.id)!;
        }

        const snapshotId = dependencies.createId();
        repo.transitionJob(job.id, 'preparing', 'uploading', {
          snapshotId,
          contentFingerprint: inventory.fingerprint,
          bytesTotal: inventory.totalBytes,
          bytesUploaded: 0,
          itemCount: inventory.entries.length,
        });
        const remote = await drive.listBlobs(input.signal);
        const reusable = new Map<string, DriveFile>();
        for (const file of remote) {
          const hash = file.appProperties?.artifactType === 'media_blob' ? file.appProperties.sha256 : undefined;
          if (!hash || file.sha256Checksum !== hash || file.size === undefined) continue;
          const size = Number(file.size);
          if (!Number.isSafeInteger(size) || size < 0) continue;
          if (!reusable.has(`${hash}:${size}`)) reusable.set(`${hash}:${size}`, file);
        }

        const available = inventory.entries.filter((entry) => !entry.missing);
        const unique = new Map<string, MediaInventoryEntry>();
        for (const entry of available) {
          if (!entry.contentHash || !SHA256_PATTERN.test(entry.contentHash)) {
            throw new DriveClientError('BACKUP_INVALID', 'Media inventory contains an invalid SHA-256.');
          }
          const existing = unique.get(entry.contentHash);
          if (existing && existing.size !== entry.size) {
            throw new DriveClientError('BACKUP_INVALID', 'Media inventory hash has conflicting sizes.');
          }
          if (!existing) unique.set(entry.contentHash, entry);
        }

        let uploaded = 0;
        for (const entry of unique.values()) {
          throwIfCancelled(input.signal);
          const existing = reusable.get(`${entry.contentHash}:${entry.size}`);
          if (existing) {
            await drive.verifyBlob(existing.id, { sha256: entry.contentHash!, size: entry.size }, input.signal);
            continue;
          }
          await resumableBlob({
            jobId: job.id,
            retryJobId: input.retryJobId,
            entry,
            signal: input.signal,
            onProgress: (offset) => {
              repo.patchJob(job!.id, { bytesUploaded: Math.min(inventory.totalBytes, uploaded + offset) });
            },
          });
          uploaded += entry.size;
          repo.patchJob(job.id, { bytesUploaded: uploaded });
        }

        repo.transitionJob(job.id, 'uploading', 'verifying');
        const artifact = buildMediaManifestArtifact({
          snapshotId,
          batchId: input.batchId,
          createdAt: dependencies.now(),
          appVersion: dependencies.appVersion(),
          schemaVersion: dependencies.schemaVersion(),
          deviceId: dependencies.deviceId(),
          deviceLabel: dependencies.deviceLabel(),
          contentFingerprint: inventory.fingerprint,
          entries: inventory.entries,
        });
        const manifestRemote = await drive.uploadManifestStaging({
          artifact, snapshotId, deviceId: dependencies.deviceId(), signal: input.signal,
        });
        manifestRemoteId = manifestRemote.id;
        repo.patchJob(job.id, { remoteFileId: manifestRemoteId });
        await drive.verifyManifestStaging(manifestRemoteId, artifact, input.signal);
        throwIfCancelled(input.signal);
        await dependencies.assertCommitEligible?.(input.trigger);
        await drive.commitManifest(manifestRemoteId, {
          artifact, snapshotId, deviceId: dependencies.deviceId(), signal: input.signal,
        });
        manifestCommitted = true;
        const outcome = inventory.missingCount > 0 ? 'partial' : 'committed';
        repo.transitionJob(job.id, 'verifying', outcome);
        repo.updateSchedule({
          ...schedule,
          lastCheckedAt: dependencies.now(),
          lastAttemptAt: dependencies.now(),
          lastSuccessAt: dependencies.now(),
          lastFingerprint: inventory.fingerprint,
          lastResult: outcome === 'partial' ? 'partial' : 'success',
        });
        try {
          await drive.runRetention?.(input.signal);
        } catch {
          repo.patchJob(job.id, { cleanupPending: true });
        }
        return repo.getJob(job.id)!;
      } catch (error) {
        const failure = safeFailure(error);
        if (manifestRemoteId && !manifestCommitted) {
          try {
            await drive.deleteManifestStaging(manifestRemoteId, input.signal);
          } catch {
            if (job) repo.patchJob(job.id, { cleanupPending: true });
          }
        }
        if (!job) throw error;
        if (failure.cancelled) {
          const sessions = repo.listUploadSessions().filter((session) => session.jobId === job!.id);
          for (const session of sessions) {
            try {
              await clearSession(session);
            } catch {
              repo.patchJob(job.id, { cleanupPending: true });
            }
          }
        }
        const current = repo.getJob(job.id)!;
        if (['queued', 'preparing', 'uploading', 'verifying'].includes(current.state)) {
          repo.transitionJob(job.id, current.state, failure.cancelled ? 'cancelled' : 'failed', {
            errorCode: failure.code,
            errorDetailSafe: failure.detail,
          });
        }
        return repo.getJob(job.id)!;
      } finally {
        repo.releaseLease(holderId);
      }
    },
  };
}

function blobProperties(hash: string) {
  return {
    app: 'oshilog' as const,
    formatVersion: '1' as const,
    artifactType: 'media_blob' as const,
    category: 'media' as const,
    sha256: hash,
  };
}

function manifestProperties(
  snapshotId: string,
  deviceId: string,
  sha256Value: string,
  commitState: 'staging' | 'committed',
  artifact?: MediaManifestArtifact,
) {
  const properties = {
    app: 'oshilog' as const,
    formatVersion: '1' as const,
    artifactType: 'media_manifest' as const,
    category: 'media' as const,
    snapshotId,
    deviceId,
    sha256: sha256Value,
    commitState,
  };
  if (!artifact) return properties;
  return {
    ...properties,
    deviceLabel: artifact.manifest.deviceLabel,
    createdAt: artifact.manifest.createdAt,
    appVersion: artifact.manifest.appVersion,
    schemaVersion: String(artifact.manifest.schemaVersion),
    contentFingerprint: artifact.manifest.contentFingerprint,
    contentSha256: artifact.contentSha256,
    byteSize: String(artifact.bytes),
  };
}

export function createDriveMediaGateway(client: DriveClient): MediaBackupDrive {
  const history = createDriveCloudHistoryService({ client });
  return {
    listBlobs(signal) {
      return client.listFiles({ artifactType: 'media_blob', category: 'media' }, signal);
    },
    startBlobUpload({ sha256: hash, totalBytes, mimeType, signal }) {
      if (!SHA256_PATTERN.test(hash)) throw new DriveClientError('BACKUP_INVALID', 'Invalid media SHA-256.');
      return client.startResumable({ name: `media-blob-${hash}`, appProperties: blobProperties(hash) }, mimeType, totalBytes, signal);
    },
    queryBlobUpload({ sessionUrl, totalBytes, signal }) {
      return client.queryResumable(sessionUrl, totalBytes, signal);
    },
    uploadBlobChunk({ sessionUrl, chunk, offset, totalBytes, signal }) {
      return client.uploadChunk(sessionUrl, chunk, offset, totalBytes, signal);
    },
    async verifyBlob(remoteId, expected, signal) {
      const metadata = await client.getMetadata(remoteId, signal);
      if (
        metadata.size !== String(expected.size)
        || metadata.sha256Checksum !== expected.sha256
        || metadata.appProperties?.artifactType !== 'media_blob'
        || metadata.appProperties.sha256 !== expected.sha256
      ) {
        throw new DriveClientError('CHECKSUM_MISMATCH', 'Uploaded Drive media checksum or size mismatch.');
      }
    },
    uploadManifestStaging({ artifact, snapshotId, deviceId, signal }) {
      return client.createMultipart({
        name: `media-manifest-${snapshotId}.json`,
        appProperties: manifestProperties(snapshotId, deviceId, artifact.contentSha256, 'staging', artifact),
      }, artifact.json, 'application/json', signal);
    },
    async verifyManifestStaging(remoteId, artifact, signal) {
      const metadata = await client.getMetadata(remoteId, signal);
      if (metadata.size !== String(artifact.bytes) || metadata.sha256Checksum !== artifact.contentSha256) {
        throw new DriveClientError('CHECKSUM_MISMATCH', 'Uploaded Drive manifest checksum or size mismatch.');
      }
    },
    async commitManifest(remoteId, { artifact, snapshotId, deviceId, signal }) {
      await client.updateMetadata(remoteId, {
        name: `media-manifest-${snapshotId}.json`,
        appProperties: manifestProperties(snapshotId, deviceId, artifact.contentSha256, 'committed', artifact),
      }, signal);
    },
    async deleteManifestStaging(remoteId, signal) {
      await client.deleteFile(remoteId, signal);
    },
    async runRetention(signal) {
      await history.runRetention('media', signal);
    },
  };
}

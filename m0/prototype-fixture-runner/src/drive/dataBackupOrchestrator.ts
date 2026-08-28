import type { DriveClient } from './client';
import { DriveClientError, driveArtifactName } from './client';
import { createDriveCloudHistoryService } from './cloudHistory';
import type { DriveBackupJob, DriveTrigger } from './contracts';
import type { DataArtifact } from './staging';
import type { DriveRepo } from '@/repositories/drive';

export type DataStagingService = {
  prepare(): Promise<{ path: string; artifact: DataArtifact }>;
  release(path: string): Promise<void>;
};

export type DataBackupDrive = {
  uploadStaging(input: {
    artifact: DataArtifact;
    snapshotId: string;
    deviceId: string;
    signal?: AbortSignal;
  }): Promise<{ id: string }>;
  verifyStaging(remoteId: string, artifact: DataArtifact, signal?: AbortSignal): Promise<void>;
  commitStaging(remoteId: string, input: {
    artifact: DataArtifact;
    snapshotId: string;
    deviceId: string;
    signal?: AbortSignal;
  }): Promise<void>;
  deleteStaging(remoteId: string, signal?: AbortSignal): Promise<void>;
  runRetention(signal?: AbortSignal): Promise<void>;
};

export type DataBackupRunInput = { trigger: DriveTrigger; batchId?: string; signal?: AbortSignal };

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DriveClientError('CANCELLED', 'Drive backup was cancelled.');
}

function safeFailure(error: unknown): { code: DriveBackupJob['errorCode']; detail: string; cancelled: boolean } {
  if (error instanceof DriveClientError) {
    return {
      code: error.code === 'CANCELLED' ? 'CANCELLED' : error.code,
      detail: error.code === 'CANCELLED' ? 'Backup cancelled.' : `Drive backup failed (${error.code}).`,
      cancelled: error.code === 'CANCELLED',
    };
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'AUTH_REQUIRED') {
    return { code: 'AUTH_REQUIRED', detail: 'Google authorization is required.', cancelled: false };
  }
  return { code: 'UNKNOWN', detail: 'Drive backup failed.', cancelled: false };
}

export function createDataBackupOrchestrator(dependencies: {
  repo: DriveRepo;
  drive: DataBackupDrive;
  staging: DataStagingService;
  acquireAccessToken: () => Promise<string>;
  assertTriggerEligible: (trigger: DriveTrigger) => Promise<void>;
  assertCommitEligible?: (trigger: DriveTrigger) => Promise<void>;
  now: () => string;
  createId: () => string;
  deviceId: () => string;
  leaseDurationMs: number;
}) {
  const { repo, drive, staging } = dependencies;

  return {
    async run(input: DataBackupRunInput): Promise<DriveBackupJob> {
      const holderId = dependencies.createId();
      if (!repo.acquireLease(holderId, `data_${input.trigger}`, dependencies.leaseDurationMs)) {
        const active = repo.findActiveJob('data');
        if (active) return active;
        throw new DriveClientError('LOCKED', 'A Drive backup operation is already active.');
      }

      let job: DriveBackupJob | null = null;
      let staged: Awaited<ReturnType<DataStagingService['prepare']>> | null = null;
      let remoteId: string | null = null;
      let committed = false;
      const releaseStaged = async (): Promise<void> => {
        if (!staged) return;
        const path = staged.path;
        staged = null;
        try {
          await staging.release(path);
        } catch {
          if (job) repo.patchJob(job.id, { cleanupPending: true });
        }
      };
      try {
        job = repo.createJob({
          category: 'data', trigger: input.trigger, deviceId: dependencies.deviceId(), batchId: input.batchId,
        }, dependencies.createId);
        repo.transitionJob(job.id, 'queued', 'preparing');
        throwIfCancelled(input.signal);
        await dependencies.acquireAccessToken();
        await dependencies.assertTriggerEligible(input.trigger);
        throwIfCancelled(input.signal);
        staged = await staging.prepare();
        const schedule = repo.listSchedules().find((item) => item.category === 'data');
        if (!schedule) throw new Error('Data backup schedule is missing.');

        if (schedule.lastFingerprint === staged.artifact.fingerprint) {
          repo.transitionJob(job.id, 'preparing', 'no_change', {
            contentFingerprint: staged.artifact.fingerprint,
            bytesTotal: staged.artifact.bytes,
            bytesUploaded: 0,
            itemCount: staged.artifact.itemCount,
          });
          repo.updateSchedule({ ...schedule, lastCheckedAt: dependencies.now(), lastAttemptAt: dependencies.now(), lastResult: 'no_change' });
          await releaseStaged();
          return repo.getJob(job.id)!;
        }

        const snapshotId = dependencies.createId();
        repo.transitionJob(job.id, 'preparing', 'uploading', {
          snapshotId,
          contentFingerprint: staged.artifact.fingerprint,
          bytesTotal: staged.artifact.bytes,
          bytesUploaded: 0,
          itemCount: staged.artifact.itemCount,
        });
        throwIfCancelled(input.signal);
        const remote = await drive.uploadStaging({
          artifact: staged.artifact,
          snapshotId,
          deviceId: dependencies.deviceId(),
          signal: input.signal,
        });
        remoteId = remote.id;
        repo.transitionJob(job.id, 'uploading', 'verifying', {
          remoteFileId: remoteId,
          bytesUploaded: staged.artifact.bytes,
        });
        await drive.verifyStaging(remoteId, staged.artifact, input.signal);
        throwIfCancelled(input.signal);
        await dependencies.assertCommitEligible?.(input.trigger);
        await drive.commitStaging(remoteId, {
          artifact: staged.artifact,
          snapshotId,
          deviceId: dependencies.deviceId(),
          signal: input.signal,
        });
        repo.transitionJob(job.id, 'verifying', 'committed');
        committed = true;
        repo.updateSchedule({
          ...schedule,
          lastCheckedAt: dependencies.now(),
          lastAttemptAt: dependencies.now(),
          lastSuccessAt: dependencies.now(),
          lastFingerprint: staged.artifact.fingerprint,
          lastResult: 'success',
        });
        try {
          await drive.runRetention(input.signal);
        } catch {
          repo.patchJob(job.id, { cleanupPending: true });
        }
        await releaseStaged();
        return repo.getJob(job.id)!;
      } catch (error) {
        const failure = safeFailure(error);
        if (remoteId && !committed) {
          try {
            await drive.deleteStaging(remoteId, input.signal);
          } catch {
            if (job) repo.patchJob(job.id, { cleanupPending: true });
          }
        }
        if (!job) throw error;
        const current = repo.getJob(job.id)!;
        if (['queued', 'preparing', 'uploading', 'verifying'].includes(current.state)) {
          repo.transitionJob(job.id, current.state, failure.cancelled ? 'cancelled' : 'failed', {
            errorCode: failure.code,
            errorDetailSafe: failure.detail,
          });
        }
        await releaseStaged();
        return repo.getJob(job.id)!;
      } finally {
        await releaseStaged();
        repo.releaseLease(holderId);
      }
    },
  };
}

function dataProperties(
  snapshotId: string,
  deviceId: string,
  artifact: DataArtifact,
  commitState: 'staging' | 'committed',
) {
  return {
    app: 'oshilog' as const,
    formatVersion: '1' as const,
    artifactType: 'data' as const,
    category: 'data' as const,
    snapshotId,
    deviceId,
    deviceLabel: artifact.deviceLabel,
    createdAt: artifact.createdAt,
    appVersion: artifact.appVersion,
    schemaVersion: artifact.schemaVersion === undefined ? undefined : String(artifact.schemaVersion),
    contentFingerprint: artifact.fingerprint,
    contentSha256: artifact.contentSha256,
    byteSize: String(artifact.bytes),
    sha256: artifact.contentSha256,
    commitState,
  };
}

export function createDriveDataGateway(client: DriveClient): DataBackupDrive {
  const history = createDriveCloudHistoryService({ client });
  return {
    async uploadStaging({ artifact, snapshotId, deviceId, signal }) {
      return client.createMultipart({
        name: driveArtifactName('data', snapshotId),
        appProperties: dataProperties(snapshotId, deviceId, artifact, 'staging'),
      }, artifact.json, 'application/json', signal);
    },
    async verifyStaging(remoteId, artifact, signal) {
      const metadata = await client.getMetadata(remoteId, signal);
      if (metadata.size !== String(artifact.bytes) || metadata.sha256Checksum !== artifact.contentSha256) {
        throw new DriveClientError('CHECKSUM_MISMATCH', 'Uploaded Drive file checksum or size mismatch.');
      }
    },
    async commitStaging(remoteId, { artifact, snapshotId, deviceId, signal }) {
      await client.updateMetadata(remoteId, {
        name: driveArtifactName('data', snapshotId),
        appProperties: dataProperties(snapshotId, deviceId, artifact, 'committed'),
      }, signal);
    },
    async deleteStaging(remoteId, signal) {
      await client.deleteFile(remoteId, signal);
    },
    async runRetention(signal) {
      await history.runRetention('data', signal);
    },
  };
}

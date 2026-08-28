import type { DriveBackupJob, DriveTrigger } from './contracts';
import type { DataBackupRunInput } from './dataBackupOrchestrator';
import type { MediaBackupRunInput } from './mediaBackupOrchestrator';

type JobRunner<TInput> = { run(input: TInput): Promise<DriveBackupJob> };

export type BackupAllResult = {
  batchId: string;
  data: DriveBackupJob;
  media: DriveBackupJob;
};

export function createBackupAllOrchestrator(dependencies: {
  data: JobRunner<DataBackupRunInput>;
  media: JobRunner<MediaBackupRunInput>;
  createId: () => string;
}) {
  return {
    async run(input: { trigger: DriveTrigger; signal?: AbortSignal }): Promise<BackupAllResult> {
      const batchId = dependencies.createId();
      const data = await dependencies.data.run({ trigger: input.trigger, batchId, signal: input.signal });
      const media = await dependencies.media.run({ trigger: input.trigger, batchId, signal: input.signal });
      return { batchId, data, media };
    },
    retryMedia(input: BackupAllResult, signal?: AbortSignal): Promise<DriveBackupJob> {
      return dependencies.media.run({
        trigger: 'notification_retry',
        batchId: input.batchId,
        retryJobId: input.media.id,
        signal,
      });
    },
  };
}

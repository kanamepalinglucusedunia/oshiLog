import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runGoogleDriveBackgroundAuthProbe } from './backgroundProbe';
import { listAppDataFolderForSpike } from './driveProbe';
import { appendAuthSpikeEvidence } from './evidenceStore';
import { createInstalledNitroGoogleDriveAuthSpike } from './installedNitroAdapter';

export const GOOGLE_DRIVE_AUTH_SPIKE_TASK = 'oshilog-google-drive-auth-spike';

if (!TaskManager.isTaskDefined(GOOGLE_DRIVE_AUTH_SPIKE_TASK)) {
  TaskManager.defineTask(GOOGLE_DRIVE_AUTH_SPIKE_TASK, async () => {
    const result = await runGoogleDriveBackgroundAuthProbe({
      authorizeHeadlessly: async () =>
        (await createInstalledNitroGoogleDriveAuthSpike()).authorizeHeadlessly(),
      listAppDataFolder: listAppDataFolderForSpike,
      recordEvidence: appendAuthSpikeEvidence,
      now: () => new Date().toISOString(),
    });
    return result === 'success'
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  });
}

export async function registerGoogleDriveAuthSpikeTask(): Promise<void> {
  await BackgroundTask.registerTaskAsync(GOOGLE_DRIVE_AUTH_SPIKE_TASK, {
    minimumInterval: 15,
  });
}

export async function triggerGoogleDriveAuthSpikeTaskForTesting(): Promise<boolean> {
  return BackgroundTask.triggerTaskWorkerForTestingAsync();
}

export async function unregisterGoogleDriveAuthSpikeTask(): Promise<void> {
  await BackgroundTask.unregisterTaskAsync(GOOGLE_DRIVE_AUTH_SPIKE_TASK);
}

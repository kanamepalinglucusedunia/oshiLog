import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import type { TaskAdapter } from './scheduleEngine';

export const DRIVE_BACKUP_TASK = 'oshilog-drive-backup';

export async function driveBackupTaskExecutor(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    // Lazily imported to avoid a load-time cycle with the installed composition.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runInstalledScheduledCatchUp } = require('./installedDriveBackup') as typeof import('./installedDriveBackup');
    await runInstalledScheduledCatchUp();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

/**
 * Module-scope worker. Runs the same installed catch-up entry point the app
 * uses on startup so a single code path covers scheduled, startup, force-trigger
 * and retry work while honoring due dates and network policy internally.
 */
if (!TaskManager.isTaskDefined(DRIVE_BACKUP_TASK)) {
  TaskManager.defineTask(DRIVE_BACKUP_TASK, async () => driveBackupTaskExecutor());
}

export function createInstalledTaskAdapter(): TaskAdapter {
  return {
    async isRegistered(): Promise<boolean> {
      return TaskManager.isTaskRegisteredAsync(DRIVE_BACKUP_TASK);
    },
    async register(minimumIntervalMinutes: number): Promise<void> {
      await BackgroundTask.registerTaskAsync(DRIVE_BACKUP_TASK, {
        minimumInterval: Math.max(15, Math.round(minimumIntervalMinutes)),
      });
    },
    async unregister(): Promise<void> {
      await BackgroundTask.unregisterTaskAsync(DRIVE_BACKUP_TASK);
    },
  };
}
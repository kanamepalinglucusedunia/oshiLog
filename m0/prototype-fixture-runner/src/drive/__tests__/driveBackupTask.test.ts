import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { createInstalledTaskAdapter, DRIVE_BACKUP_TASK, driveBackupTaskExecutor } from '../driveBackupTask';

jest.mock('@/drive/installedDriveBackup', () => ({
  runInstalledScheduledCatchUp: jest.fn(async () => undefined),
}));

const installed = jest.requireMock('@/drive/installedDriveBackup') as {
  runInstalledScheduledCatchUp: jest.Mock;
};

describe('Drive background task', () => {
  it('defines exactly one module-scope worker task', () => {
    expect(TaskManager.isTaskDefined(DRIVE_BACKUP_TASK)).toBe(true);
  });

  it('registers the worker with a bounded minimum interval in minutes', async () => {
    const adapter = createInstalledTaskAdapter();
    await adapter.register(1440);
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(DRIVE_BACKUP_TASK, { minimumInterval: 1440 });
  });

  it('clamps intervals below the Expo minimum of 15 minutes', async () => {
    const adapter = createInstalledTaskAdapter();
    await adapter.register(5);
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(DRIVE_BACKUP_TASK, { minimumInterval: 15 });
  });

  it('unregisters the worker', async () => {
    const adapter = createInstalledTaskAdapter();
    await adapter.unregister();
    expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(DRIVE_BACKUP_TASK);
  });

  it('runs the installed catch-up and reports success', async () => {
    installed.runInstalledScheduledCatchUp.mockResolvedValueOnce(undefined);
    await expect(driveBackupTaskExecutor()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(installed.runInstalledScheduledCatchUp).toHaveBeenCalledTimes(1);
  });

  it('reports failure when the catch-up throws', async () => {
    installed.runInstalledScheduledCatchUp.mockRejectedValueOnce(new Error('boom'));
    await expect(driveBackupTaskExecutor()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Failed);
  });
});
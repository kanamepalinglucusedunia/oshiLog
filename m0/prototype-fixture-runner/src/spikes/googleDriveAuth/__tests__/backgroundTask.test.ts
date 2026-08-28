/* eslint-disable import/first -- imports stay below hoist-sensitive Jest mock state */
const mockAuthorizeHeadlessly = jest.fn(async () => ({
  accessToken: 'secret-drive-token',
  account: { subject: 'subject', email: 'owner@example.test' },
}));
const mockListAppDataFolder = jest.fn(async (_accessToken: string) => ({ fileCount: 0 }));
const mockAppendEvidence = jest.fn(async (_evidence: unknown) => undefined);
const mockRegisterTask = jest.fn(async (_name: string, _options?: { minimumInterval: number }) => undefined);
const mockTriggerTask = jest.fn(async () => true);
let capturedExecutor: (() => Promise<unknown>) | undefined;

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((_name: string, executor: () => Promise<unknown>) => {
    capturedExecutor = executor;
  }),
  isTaskDefined: jest.fn(() => false),
}));

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: (name: string, options?: { minimumInterval: number }) =>
    mockRegisterTask(name, options),
  triggerTaskWorkerForTestingAsync: () => mockTriggerTask(),
}));

jest.mock('../installedNitroAdapter', () => ({
  createInstalledNitroGoogleDriveAuthSpike: () => ({
    authorizeHeadlessly: mockAuthorizeHeadlessly,
  }),
}));

jest.mock('../driveProbe', () => ({
  listAppDataFolderForSpike: (accessToken: string) => mockListAppDataFolder(accessToken),
}));

jest.mock('../evidenceStore', () => ({
  appendAuthSpikeEvidence: (evidence: unknown) => mockAppendEvidence(evidence),
}));

import {
  GOOGLE_DRIVE_AUTH_SPIKE_TASK,
  registerGoogleDriveAuthSpikeTask,
  triggerGoogleDriveAuthSpikeTaskForTesting,
} from '../backgroundTask';
import * as TaskManager from 'expo-task-manager';

describe('Google Drive auth spike BackgroundTask wiring', () => {
  it('defines the task at module scope and runs the headless Drive probe', async () => {
    expect(TaskManager.defineTask).toHaveBeenCalledWith(
      GOOGLE_DRIVE_AUTH_SPIKE_TASK,
      expect.any(Function),
    );
    await expect(capturedExecutor?.()).resolves.toBe(1);
    expect(mockAuthorizeHeadlessly).toHaveBeenCalledTimes(1);
    expect(mockListAppDataFolder).toHaveBeenCalledWith('secret-drive-token');
    expect(JSON.stringify(mockAppendEvidence.mock.calls)).not.toContain('secret-drive-token');
  });

  it('registers a 15-minute debug worker before exposing the Expo test trigger', async () => {
    await registerGoogleDriveAuthSpikeTask();
    await expect(triggerGoogleDriveAuthSpikeTaskForTesting()).resolves.toBe(true);

    expect(mockRegisterTask).toHaveBeenCalledWith(GOOGLE_DRIVE_AUTH_SPIKE_TASK, {
      minimumInterval: 15,
    });
    expect(mockTriggerTask).toHaveBeenCalledTimes(1);
  });
});

import { createGoogleDriveAuthSpike } from '../authContract';
import { createGoogleDriveAuthSpikeController } from '../spikeController';
import type { AuthSpikeEvidence } from '../backgroundProbe';

function createController() {
  const clearCachedAccessToken = jest.fn(async () => undefined);
  const auth = createGoogleDriveAuthSpike({
    authorizeInteractively: jest.fn(async () => ({
      status: 'success' as const,
      accessToken: 'secret-drive-token',
      account: {
        subject: 'private-subject',
        email: 'owner@example.test',
        displayName: 'Test Owner',
      },
    })),
    authorizeHeadlessly: jest.fn(),
    clearCachedAccessToken,
    signOut: jest.fn(async () => undefined),
  });
  const evidence: AuthSpikeEvidence[] = [];
  const registerBackgroundProbe = jest.fn(async () => undefined);
  const triggerBackgroundProbe = jest.fn(async () => true);
  const controller = createGoogleDriveAuthSpikeController({
    auth,
    listAppDataFolder: jest.fn(async () => ({ fileCount: 1 })),
    recordEvidence: jest.fn(async (record) => evidence.push(record)),
    registerBackgroundProbe,
    triggerBackgroundProbe,
    now: jest
      .fn()
      .mockReturnValueOnce('2026-08-16T01:00:00.000Z')
      .mockReturnValueOnce('2026-08-16T01:00:01.000Z'),
  });
  return {
    controller,
    clearCachedAccessToken,
    evidence,
    registerBackgroundProbe,
    triggerBackgroundProbe,
  };
}

describe('Google Drive authorization spike controller', () => {
  it('runs the interactive probe while keeping credentials and account identifiers out of results', async () => {
    const { controller, evidence } = createController();

    await expect(controller.runInteractiveProbe()).resolves.toEqual({
      accountMetadataPresent: true,
      fileCount: 1,
    });
    expect(evidence[0]).toMatchObject({
      adapter: 'nitro',
      phase: 'interactive',
      status: 'success',
      tokenAcquired: true,
      accountMetadataPresent: true,
      driveListSucceeded: true,
      fileCount: 1,
    });
    expect(JSON.stringify(evidence)).not.toContain('secret-drive-token');
    expect(JSON.stringify(evidence)).not.toContain('owner@example.test');
    expect(JSON.stringify(evidence)).not.toContain('private-subject');
  });

  it('clears the in-memory token and refuses a second clear', async () => {
    const { controller, clearCachedAccessToken } = createController();
    await controller.runInteractiveProbe();

    await expect(controller.clearLastCachedAccessToken()).resolves.toBeUndefined();
    expect(clearCachedAccessToken).toHaveBeenCalledWith('secret-drive-token');
    await expect(controller.clearLastCachedAccessToken()).rejects.toMatchObject({
      code: 'token_required',
    });
  });

  it('registers the task before using Expo test-triggering API', async () => {
    const { controller, registerBackgroundProbe, triggerBackgroundProbe } = createController();

    await expect(controller.triggerRegisteredBackgroundProbe()).resolves.toBe(true);
    expect(registerBackgroundProbe).toHaveBeenCalledTimes(1);
    expect(triggerBackgroundProbe).toHaveBeenCalledTimes(1);
    expect(registerBackgroundProbe.mock.invocationCallOrder[0]).toBeLessThan(
      triggerBackgroundProbe.mock.invocationCallOrder[0],
    );
  });
});

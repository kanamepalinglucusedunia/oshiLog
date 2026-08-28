import { GoogleDriveAuthSpikeError, type GoogleDriveAuthorization } from '@/spikes/googleDriveAuth/authContract';
import { createDriveConnectionLifecycle, DriveConnectionError, type DriveAuthAdapter } from '@/drive/connectionLifecycle';
import { createDriveRepo } from '@/repositories/drive';
import { createNodeTestDb } from '@/testing/nodeSqlite';

const NOW = '2026-08-16T01:00:00.000Z';
const TOKEN = 'secret-access-token-that-must-never-be-persisted';

function authorization(subject = 'subject-1'): GoogleDriveAuthorization {
  return {
    accessToken: TOKEN,
    account: { subject, email: `${subject}@example.test`, displayName: 'Owner' },
  };
}

function fakeAuth(overrides: Partial<DriveAuthAdapter> = {}): jest.Mocked<DriveAuthAdapter> {
  return {
    authorizeInteractively: jest.fn(async () => authorization()),
    authorizeHeadlessly: jest.fn(async () => authorization()),
    clearCachedAccessToken: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
    ...overrides,
  } as jest.Mocked<DriveAuthAdapter>;
}

function setup(auth = fakeAuth()) {
  const db = createNodeTestDb();
  const repo = createDriveRepo(db, () => NOW);
  const secrets = { set: jest.fn(), get: jest.fn(), delete: jest.fn(async () => undefined) };
  const lifecycle = createDriveConnectionLifecycle({
    repo,
    auth,
    secrets,
    now: () => NOW,
    deviceId: () => 'device-1',
    deviceLabel: () => 'Pixel physical',
  });
  return { auth, db, repo, secrets, lifecycle };
}

describe('Google Drive connection lifecycle', () => {
  it('connects one account and keeps both schedules off without claiming ownership', async () => {
    const { lifecycle, repo } = setup();

    await expect(lifecycle.connect()).resolves.toMatchObject({ status: 'connected' });

    expect(repo.getConnection()).toMatchObject({
      accountSubject: 'subject-1', connectionState: 'connected', schedulesPaused: false,
      ownerLastCheckedAt: null,
    });
    expect(repo.listSchedules()).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'data', frequency: 'off', networkPolicy: 'any' }),
      expect.objectContaining({ category: 'media', frequency: 'off', networkPolicy: 'wifi_only' }),
    ]));
  });

  it('returns cancellation but surfaces unexpected authorization failures', async () => {
    const cancelled = setup(fakeAuth({
      authorizeInteractively: jest.fn(async () => {
        throw new GoogleDriveAuthSpikeError('interaction_required', 'cancelled');
      }),
    }));
    await expect(cancelled.lifecycle.connect()).resolves.toEqual({ status: 'cancelled' });

    const failed = setup(fakeAuth({
      authorizeInteractively: jest.fn(async () => { throw new Error('native failure'); }),
    }));
    await expect(failed.lifecycle.connect()).rejects.toThrow('native failure');
  });

  it('rejects a second account while the first account remains active', async () => {
    const auth = fakeAuth();
    const { lifecycle, repo } = setup(auth);
    await lifecycle.connect();
    auth.authorizeInteractively.mockResolvedValueOnce(authorization('subject-2'));

    await expect(lifecycle.connect()).rejects.toMatchObject<Partial<DriveConnectionError>>({
      code: 'ACCOUNT_MISMATCH',
    });
    expect(repo.getConnection()?.accountSubject).toBe('subject-1');
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('disconnects without deleting Drive data, preserves settings, and reconnects paused', async () => {
    const { lifecycle, repo, auth, secrets } = setup();
    const driveDelete = jest.fn();
    await lifecycle.connect();
    repo.updateSchedule({ category: 'data', frequency: 'daily', networkPolicy: 'wifi_only' });
    repo.createJob({ category: 'data', trigger: 'manual', deviceId: 'device-1' }, () => 'job-1');
    repo.saveUploadSession({
      id: 'session-1', jobId: 'job-1', artifactKey: 'artifact', localStagingPath: 'file:///stage',
      sessionUriSecretKey: 'drive-session:session-1', uploadedOffset: 0, totalBytes: 10,
      expiresAt: '2026-08-23T01:00:00.000Z', updatedAt: NOW,
    });

    await lifecycle.disconnect();

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(secrets.delete).toHaveBeenCalledWith('drive-session:session-1');
    expect(repo.listUploadSessions()).toEqual([]);
    expect(repo.listSchedules().find((item) => item.category === 'data')).toMatchObject({
      frequency: 'daily', networkPolicy: 'wifi_only', pausedReason: 'disconnected',
    });
    expect(driveDelete).not.toHaveBeenCalled();

    await lifecycle.reconnect();
    expect(repo.getConnection()).toMatchObject({ connectionState: 'connected', schedulesPaused: true });
    expect(repo.listSchedules().find((item) => item.category === 'data')).toMatchObject({
      frequency: 'daily', pausedReason: 'disconnected',
    });
  });

  it('maps revoked headless authorization to AUTH_REQUIRED and never persists the token', async () => {
    const auth = fakeAuth();
    const { lifecycle, repo, db } = setup(auth);
    await lifecycle.connect();
    auth.authorizeHeadlessly.mockRejectedValueOnce(
      new GoogleDriveAuthSpikeError('interaction_required', `revoked ${TOKEN}`),
    );

    await expect(lifecycle.acquireAccessToken()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(repo.getConnection()).toMatchObject({ connectionState: 'auth_required', schedulesPaused: true });
    expect(repo.listSchedules().every((item) => item.pausedReason === 'auth_required')).toBe(true);

    const tables = ['drive_connection', 'drive_backup_schedule', 'drive_backup_job', 'drive_upload_session'];
    const sqliteDump = tables.flatMap((table) => db.getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`));
    expect(JSON.stringify(sqliteDump)).not.toContain(TOKEN);
  });

  it('returns a headless token for the connected account and rejects an account switch', async () => {
    const context = setup();
    await context.lifecycle.connect();
    await expect(context.lifecycle.acquireAccessToken()).resolves.toBe(TOKEN);

    context.auth.authorizeHeadlessly.mockResolvedValueOnce(authorization('subject-2'));
    await expect(context.lifecycle.acquireAccessToken()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(context.repo.getConnection()).toMatchObject({ connectionState: 'auth_required', schedulesPaused: true });
  });

  it('rethrows unexpected headless failures and requires a connection before resume', async () => {
    const context = setup(fakeAuth({
      authorizeHeadlessly: jest.fn(async () => { throw new Error('native unavailable'); }),
    }));
    await expect(context.lifecycle.acquireAccessToken()).rejects.toThrow('native unavailable');
    expect(() => context.lifecycle.resumeSchedules()).toThrow(/connect/i);
    await expect(context.lifecycle.disconnect()).resolves.toBeUndefined();
  });

  it('resumes preserved schedules only after explicit confirmation', async () => {
    const context = setup();
    await context.lifecycle.connect();
    context.repo.updateSchedule({ category: 'data', frequency: 'daily', networkPolicy: 'any' });
    await context.lifecycle.disconnect();
    await context.lifecycle.reconnect();

    context.lifecycle.resumeSchedules();

    expect(context.repo.getConnection()).toMatchObject({ schedulesPaused: false, pauseReason: null });
    expect(context.repo.listSchedules().every((item) => item.pausedReason === null)).toBe(true);
  });
});

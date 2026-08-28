import { DriveClientError } from '@/drive/client';
import {
  createDataBackupOrchestrator,
  createDriveDataGateway,
  type DataBackupDrive,
  type DataStagingService,
} from '@/drive/dataBackupOrchestrator';
import type { DriveClient } from '@/drive/client';
import type { DriveTrigger } from '@/drive/contracts';
import { buildDataArtifact } from '@/drive/staging';
import { createDriveRepo } from '@/repositories/drive';
import type { BackupManifest } from '@/services/backup';
import { createNodeTestDb } from '@/testing/nodeSqlite';

const NOW = '2026-08-16T02:00:00.000Z';

async function artifact() {
  const manifest: BackupManifest = {
    formatVersion: 2, category: 'data', appVersion: '0.1.0', schemaVersion: 11,
    createdAt: NOW, deviceLabel: 'Pixel', recordCounts: { idol: 1 }, checksums: { all: 'sealed' },
    records: { idol: [{ id: 'idol-1', name: 'Oshi' }] },
  };
  return buildDataArtifact(manifest);
}

function fakeDrive(overrides: Partial<DataBackupDrive> = {}): jest.Mocked<DataBackupDrive> {
  return {
    uploadStaging: jest.fn(async (input) => ({ id: 'remote-1', size: input.artifact.bytes, sha256: input.artifact.contentSha256 })),
    verifyStaging: jest.fn(async () => undefined),
    commitStaging: jest.fn(async () => undefined),
    deleteStaging: jest.fn(async () => undefined),
    runRetention: jest.fn(async () => undefined),
    ...overrides,
  } as jest.Mocked<DataBackupDrive>;
}

async function setup(options: { drive?: jest.Mocked<DataBackupDrive>; staging?: DataStagingService } = {}) {
  const db = createNodeTestDb();
  const repo = createDriveRepo(db, () => NOW);
  const drive = options.drive ?? fakeDrive();
  const preparedArtifact = await artifact();
  const staging = options.staging ?? {
    prepare: jest.fn(async () => ({ path: 'file:///staging/data.json', artifact: preparedArtifact })),
    release: jest.fn(async () => undefined),
  };
  const acquireAccessToken = jest.fn(async () => 'ephemeral-token');
  const orchestrator = createDataBackupOrchestrator({
    repo, drive, staging, acquireAccessToken,
    now: () => NOW, createId: (() => { let id = 0; return () => `id-${++id}`; })(),
    deviceId: () => 'device-1', leaseDurationMs: 60_000,
    assertTriggerEligible: jest.fn(async () => undefined),
  });
  return { db, repo, drive, staging, acquireAccessToken, orchestrator, preparedArtifact };
}

describe('shared Data backup orchestrator', () => {
  it('commits the happy path with the exact persistent state sequence', async () => {
    const context = await setup();
    const transitions: string[] = [];
    const original = context.repo.transitionJob.bind(context.repo);
    jest.spyOn(context.repo, 'transitionJob').mockImplementation((id, expected, next, patch) => {
      transitions.push(next);
      return original(id, expected, next, patch);
    });

    const job = await context.orchestrator.run({ trigger: 'scheduled' });

    expect(job.state).toBe('committed');
    expect(transitions).toEqual(['preparing', 'uploading', 'verifying', 'committed']);
    expect(context.drive.commitStaging).toHaveBeenCalledTimes(1);
    expect(context.drive.runRetention).toHaveBeenCalledTimes(1);
    expect(context.staging.release).toHaveBeenCalledWith('file:///staging/data.json');
  });

  it('records no_change without upload or retention', async () => {
    const context = await setup();
    context.repo.updateSchedule({
      category: 'data', frequency: 'daily', networkPolicy: 'any',
      lastFingerprint: context.preparedArtifact.fingerprint,
    });

    const job = await context.orchestrator.run({ trigger: 'scheduled' });

    expect(job.state).toBe('no_change');
    expect(context.drive.uploadStaging).not.toHaveBeenCalled();
    expect(context.drive.runRetention).not.toHaveBeenCalled();
    expect(context.repo.listSchedules().find((item) => item.category === 'data')).toMatchObject({
      lastResult: 'no_change', lastCheckedAt: NOW,
    });
  });

  it('collapses duplicate foreground/background starts onto one active job', async () => {
    let releasePreparation!: () => void;
    let preparationEntered!: () => void;
    const entered = new Promise<void>((resolve) => { preparationEntered = resolve; });
    const gate = new Promise<void>((resolve) => { releasePreparation = resolve; });
    const preparedArtifact = await artifact();
    const staging: DataStagingService = {
      prepare: jest.fn(async () => {
        preparationEntered();
        await gate;
        return { path: 'file:///staging/data.json', artifact: preparedArtifact };
      }),
      release: jest.fn(async () => undefined),
    };
    const context = await setup({ staging });

    const foreground = context.orchestrator.run({ trigger: 'manual' });
    await entered;
    const background = await context.orchestrator.run({ trigger: 'scheduled' });
    expect(background.state).toBe('preparing');
    releasePreparation();
    await expect(foreground).resolves.toMatchObject({ state: 'committed', id: background.id });
    expect(staging.prepare).toHaveBeenCalledTimes(1);
  });

  it('never commits on checksum failure and deletes only the remote staging artifact', async () => {
    const drive = fakeDrive({
      verifyStaging: jest.fn(async () => { throw new DriveClientError('CHECKSUM_MISMATCH', 'mismatch'); }),
    });
    const context = await setup({ drive });

    const job = await context.orchestrator.run({ trigger: 'manual' });

    expect(job).toMatchObject({ state: 'failed', errorCode: 'CHECKSUM_MISMATCH' });
    expect(drive.commitStaging).not.toHaveBeenCalled();
    expect(drive.deleteStaging).toHaveBeenCalledWith('remote-1', undefined);
    expect(context.staging.release).toHaveBeenCalledTimes(1);
  });

  it('cancels before commit and cleans safe staging artifacts', async () => {
    const controller = new AbortController();
    const drive = fakeDrive({
      verifyStaging: jest.fn(async () => { controller.abort(); }),
    });
    const context = await setup({ drive });

    const job = await context.orchestrator.run({ trigger: 'manual', signal: controller.signal });

    expect(job.state).toBe('cancelled');
    expect(drive.commitStaging).not.toHaveBeenCalled();
    expect(drive.deleteStaging).toHaveBeenCalledTimes(1);
    expect(context.staging.release).toHaveBeenCalledTimes(1);
  });

  it('keeps a committed success when retention cleanup fails and leaves manual due dates unchanged', async () => {
    const drive = fakeDrive({ runRetention: jest.fn(async () => { throw new Error('cleanup failed'); }) });
    const context = await setup({ drive });
    context.repo.updateSchedule({
      category: 'data', frequency: 'weekly', networkPolicy: 'any',
      enabledAt: NOW, nextDueAt: '2026-08-23T02:00:00.000Z',
    });

    const job = await context.orchestrator.run({ trigger: 'manual' });

    expect(job).toMatchObject({ state: 'committed', cleanupPending: true });
    expect(context.repo.listSchedules().find((item) => item.category === 'data')?.nextDueAt)
      .toBe('2026-08-23T02:00:00.000Z');
  });

  it('reports LOCKED when a lease exists without an active job', async () => {
    const context = await setup();
    expect(context.repo.acquireLease('external', 'other', 60_000)).toBe(true);
    await expect(context.orchestrator.run({ trigger: 'manual' })).rejects.toMatchObject({ code: 'LOCKED' });
  });

  it('aborts a scheduled commit when ownership is lost after verification', async () => {
    const context = await setup();
    const guarded = createDataBackupOrchestrator({
      repo: context.repo,
      drive: context.drive,
      staging: context.staging,
      acquireAccessToken: context.acquireAccessToken,
      now: () => NOW,
      createId: () => 'id-guarded',
      deviceId: () => 'device-1',
      leaseDurationMs: 60_000,
      assertTriggerEligible: jest.fn(async () => undefined),
      assertCommitEligible: jest.fn(async () => { throw new DriveClientError('NOT_OWNER', 'Another device now owns scheduled backups.'); }),
    });

    const job = await guarded.run({ trigger: 'scheduled' });

    expect(job).toMatchObject({ state: 'failed', errorCode: 'NOT_OWNER' });
    expect(context.drive.commitStaging).not.toHaveBeenCalled();
    expect(context.drive.deleteStaging).toHaveBeenCalledWith('remote-1', undefined);
  });

  it('sends the trigger to the commit gate but a manual run is never blocked (gate decides by trigger)', async () => {
    const context = await setup();
    const gate = jest.fn(async (trigger: DriveTrigger) => {
      if (trigger === 'scheduled' || trigger === 'startup_catchup') {
        throw new DriveClientError('NOT_OWNER', 'Another device now owns scheduled backups.');
      }
    });
    const guarded = createDataBackupOrchestrator({
      repo: context.repo,
      drive: context.drive,
      staging: context.staging,
      acquireAccessToken: context.acquireAccessToken,
      now: () => NOW,
      createId: () => 'id-manual-gate',
      deviceId: () => 'device-1',
      leaseDurationMs: 60_000,
      assertTriggerEligible: jest.fn(async () => undefined),
      assertCommitEligible: gate,
    });

    const job = await guarded.run({ trigger: 'manual' });

    expect(job.state).toBe('committed');
    expect(gate).toHaveBeenCalledWith('manual');
  });

  it('marks cleanup pending when remote or local staging cleanup fails', async () => {
    const drive = fakeDrive({
      verifyStaging: jest.fn(async () => { throw new DriveClientError('CHECKSUM_MISMATCH', 'mismatch'); }),
      deleteStaging: jest.fn(async () => { throw new Error('remote cleanup failed'); }),
    });
    const remoteCleanup = await setup({ drive });
    await expect(remoteCleanup.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', cleanupPending: true,
    });

    const localCleanup = await setup({ staging: {
      prepare: jest.fn(async () => ({ path: 'file:///staging/data.json', artifact: await artifact() })),
      release: jest.fn(async () => { throw new Error('local cleanup failed'); }),
    } });
    await expect(localCleanup.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'committed', cleanupPending: true,
    });
  });
});

describe('Drive Data gateway', () => {
  it('uploads staging, verifies it, commits metadata, deletes staging, and retains five snapshots', async () => {
    const prepared = await artifact();
    const remoteFiles = Array.from({ length: 7 }, (_, index) => ({
      id: `remote-${index}`,
      name: `file-${index}`,
      modifiedTime: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    const client = {
      createMultipart: jest.fn(async () => ({ id: 'remote-new', name: 'new' })),
      getMetadata: jest.fn(async () => ({
        id: 'remote-new', name: 'new', size: String(prepared.bytes), sha256Checksum: prepared.contentSha256,
      })),
      updateMetadata: jest.fn(async () => ({ id: 'remote-new', name: 'new' })),
      deleteFile: jest.fn(async () => undefined),
      listFiles: jest.fn(async () => remoteFiles),
    } as unknown as DriveClient;
    const gateway = createDriveDataGateway(client);

    await expect(gateway.uploadStaging({ artifact: prepared, snapshotId: 'snap-1', deviceId: 'device-1' }))
      .resolves.toMatchObject({ id: 'remote-new' });
    await expect(gateway.verifyStaging('remote-new', prepared)).resolves.toBeUndefined();
    await gateway.commitStaging('remote-new', { artifact: prepared, snapshotId: 'snap-1', deviceId: 'device-1' });
    await gateway.deleteStaging('remote-new');
    await gateway.runRetention();

    expect((client as unknown as { createMultipart: jest.Mock }).createMultipart).toHaveBeenCalledWith(
      expect.objectContaining({ appProperties: expect.objectContaining({ commitState: 'staging' }) }),
      prepared.json, 'application/json', undefined,
    );
    expect((client as unknown as { updateMetadata: jest.Mock }).updateMetadata).toHaveBeenCalledWith(
      'remote-new', expect.objectContaining({ appProperties: expect.objectContaining({ commitState: 'committed' }) }), undefined,
    );
    expect((client as unknown as { deleteFile: jest.Mock }).deleteFile).toHaveBeenCalledTimes(3);
    expect((client as unknown as { deleteFile: jest.Mock }).deleteFile).toHaveBeenCalledWith('remote-1', undefined);
    expect((client as unknown as { deleteFile: jest.Mock }).deleteFile).toHaveBeenCalledWith('remote-0', undefined);
  });

  it('rejects remote metadata whose size or checksum differs', async () => {
    const prepared = await artifact();
    const client = {
      getMetadata: jest.fn(async () => ({ id: 'bad', name: 'bad', size: '1', sha256Checksum: 'b'.repeat(64) })),
    } as unknown as DriveClient;
    await expect(createDriveDataGateway(client).verifyStaging('bad', prepared))
      .rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
  });

  it('maps revoked authorization and generic failures to safe persistent codes', async () => {
    const authRequired = await setup();
    authRequired.acquireAccessToken.mockRejectedValueOnce({ code: 'AUTH_REQUIRED', token: 'must-not-persist' });
    await expect(authRequired.orchestrator.run({ trigger: 'manual' })).resolves.toMatchObject({
      state: 'failed', errorCode: 'AUTH_REQUIRED', errorDetailSafe: 'Google authorization is required.',
    });

    const generic = await setup();
    generic.acquireAccessToken.mockRejectedValueOnce(new Error('private failure detail'));
    const job = await generic.orchestrator.run({ trigger: 'manual' });
    expect(job).toMatchObject({ state: 'failed', errorCode: 'UNKNOWN', errorDetailSafe: 'Drive backup failed.' });
    expect(JSON.stringify(job)).not.toContain('private failure detail');
  });
});

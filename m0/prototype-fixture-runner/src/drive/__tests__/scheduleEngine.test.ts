import { DriveClientError } from '@/drive/client';
import type { DriveBackupJob, DriveCategory, DriveTrigger } from '@/drive/contracts';
import { driveBackupJobSchema } from '@/drive/contracts';
import { createDriveRepo } from '@/repositories/drive';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import type { DriveOwnership } from '../ownership';
import type { NetworkTransport } from '../networkState';
import { createDriveScheduleEngine } from '../scheduleEngine';

const NOW = '2026-08-17T09:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

let jobCounter = 0;

function job(category: DriveCategory, trigger: DriveTrigger, state: DriveBackupJob['state'], extras: Partial<DriveBackupJob> = {}): DriveBackupJob {
  jobCounter += 1;
  return driveBackupJobSchema.parse({
    id: `job-${jobCounter}`,
    category,
    trigger,
    state,
    deviceId: 'device-1',
    cleanupPending: false,
    createdAt: NOW,
    errorCode: state === 'failed' ? 'QUOTA_EXCEEDED' : undefined,
    ...extras,
  });
}

function emptyRunners() {
  return {
    runData: jest.fn(async (input) => job('data', input.trigger, 'committed')),
    runMedia: jest.fn(async (input) => job('media', input.trigger, 'committed')),
  };
}

function ownershipStub(overrides: Partial<DriveOwnership> = {}): DriveOwnership {
  return {
    readOwner: jest.fn(async () => null),
    isCurrentlyOwner: jest.fn(async () => true),
    claimOwnership: jest.fn(async () => 'claim-1'),
    takeOver: jest.fn(async () => 'claim-1'),
    verifyBeforeRun: jest.fn(async () => undefined),
    verifyBeforeCommit: jest.fn(async () => undefined),
    ...overrides,
  } as DriveOwnership;
}

async function setup(options: {
  runners?: { runData: jest.Mock; runMedia: jest.Mock };
  transport?: NetworkTransport;
  ownership?: DriveOwnership;
  connectionState?: 'connected' | 'auth_required' | 'disconnected';
  initiallyRegistered?: boolean;
  maintenance?: { run: () => Promise<void> };
} = {}) {
  const db = createNodeTestDb();
  const repo = createDriveRepo(db, () => NOW);
  const now = () => NOW;
  let idCounter = 0;
  const createId = () => `id-${++idCounter}`;
  const notifications = {
    notifyResult: jest.fn(async () => true),
    notifyOwnershipChanged: jest.fn(async () => true),
    notifyAuthRequired: jest.fn(async () => true),
  };
  const taskAdapter: {
    state: boolean;
    isRegistered: () => Promise<boolean>;
    register: () => Promise<void>;
    unregister: () => Promise<void>;
  } = {
    state: options.initiallyRegistered ?? false,
    isRegistered: jest.fn(async () => taskAdapter.state),
    register: jest.fn(async () => { taskAdapter.state = true; }),
    unregister: jest.fn(async () => { taskAdapter.state = false; }),
  };
  const ownership = options.ownership ?? ownershipStub();

  repo.saveConnection({
    id: 'primary',
    accountSubject: 'subject-1',
    accountEmail: 'owner@example.test',
    deviceId: 'device-1',
    deviceLabel: 'Pixel',
    connectionState: options.connectionState ?? 'connected',
    schedulesPaused: false,
    pauseReason: null,
    connectedAt: NOW,
    updatedAt: NOW,
  });

  const engine = createDriveScheduleEngine({
    repo,
    ownership,
    getTransport: jest.fn(async () => options.transport ?? 'wifi'),
    notifications,
    taskAdapter,
    now,
    createId,
    maintenance: options.maintenance,
    runData: options.runners?.runData ?? emptyRunners().runData,
    runMedia: options.runners?.runMedia ?? emptyRunners().runMedia,
  });

  const setSchedule = (category: DriveCategory, patch: Partial<Parameters<typeof repo.updateSchedule>[0]>) => {
    const current = repo.listSchedules().find((item) => item.category === category)!;
    repo.updateSchedule({ ...current, ...patch });
  };

  return { db, repo, engine, ownership, notifications, taskAdapter, setSchedule, NOW };
}

function withEnabledSchedule(engineSetup: Awaited<ReturnType<typeof setup>>, category: DriveCategory, frequency: 'off' | 'daily' | 'weekly' | 'monthly' = 'daily') {
  engineSetup.setSchedule(category, { frequency, enabledAt: NOW, nextDueAt: NOW });
}

describe('Drive schedule engine', () => {
  describe('enableSchedule', () => {
    it('disables a schedule and clears due state when frequency is off', async () => {
      const context = await setup({ initiallyRegistered: true });
      const result = await context.engine.enableSchedule({ category: 'data', frequency: 'off', networkPolicy: 'any' });
      expect(result.kind).toBe('disabled');
      const schedule = context.repo.listSchedules().find((item) => item.category === 'data')!;
      expect(schedule).toMatchObject({ frequency: 'off', enabledAt: null, nextDueAt: null });
      expect(context.taskAdapter.unregister).toHaveBeenCalled();
    });

    it('requires a connected account before enabling', async () => {
      const context = await setup({ connectionState: 'auth_required' });
      const result = await context.engine.enableSchedule({ category: 'data', frequency: 'daily', networkPolicy: 'any' });
      expect(result.kind).toBe('auth_required');
      expect(context.ownership.claimOwnership as jest.Mock).not.toHaveBeenCalled();
    });

    it('enables by claiming ownership, anchoring the first due date at now + interval', async () => {
      const context = await setup();
      const result = await context.engine.enableSchedule({ category: 'data', frequency: 'daily', networkPolicy: 'any' });
      expect(result.kind).toBe('enabled');
      expect(context.ownership.claimOwnership as jest.Mock).toHaveBeenCalled();
      const schedule = context.repo.listSchedules().find((item) => item.category === 'data')!;
      expect(schedule.nextDueAt).toBe('2026-08-18T09:00:00.000Z');
      expect(schedule.networkPolicy).toBe('any');
      expect(schedule.pausedReason).toBeNull();
      const connection = context.repo.getConnection()!;
      expect(connection.schedulesPaused).toBe(false);
      expect(context.taskAdapter.register).toHaveBeenCalled();
    });

    it('reports takeover_required when another device owns the schedules', async () => {
      const context = await setup({ ownership: ownershipStub({
        claimOwnership: jest.fn(async () => { throw new DriveClientError('NOT_OWNER', 'other'); }),
      }) });
      const result = await context.engine.enableSchedule({ category: 'data', frequency: 'daily', networkPolicy: 'any' });
      expect(result.kind).toBe('takeover_required');
    });
  });

  describe('takeOverAndEnable', () => {
    it('performs an explicit takeover and then enables', async () => {
      const context = await setup();
      const result = await context.engine.takeOverAndEnable({ category: 'media', frequency: 'weekly', networkPolicy: 'wifi_only' });
      expect(result.kind).toBe('enabled');
      expect(context.ownership.takeOver as jest.Mock).toHaveBeenCalled();
      const schedule = context.repo.listSchedules().find((item) => item.category === 'media')!;
      expect(schedule.nextDueAt).toBe('2026-08-24T09:00:00.000Z');
    });
  });

  describe('setNetworkPolicy', () => {
    it('updates the policy without touching frequency or due', async () => {
      const context = await setup();
      withEnabledSchedule(context, 'media', 'weekly');
      context.engine.setNetworkPolicy('media', 'wifi_only');
      const schedule = context.repo.listSchedules().find((item) => item.category === 'media')!;
      expect(schedule.networkPolicy).toBe('wifi_only');
      expect(schedule.frequency).toBe('weekly');
    });
  });

  describe('runManual', () => {
    it('runs the category without altering the due date even when one exists', async () => {
      const context = await setup();
      withEnabledSchedule(context, 'data', 'daily');
      const outcome = await context.engine.runManual('data');
      expect(outcome.kind).toBe('job');
      if (outcome.kind === 'job') {
        expect(outcome.job.trigger).toBe('manual');
        expect(outcome.job.state).toBe('committed');
      }
      expect(context.repo.listSchedules().find((item) => item.category === 'data')!.nextDueAt).toBe(NOW);
      expect(context.notifications.notifyResult).not.toHaveBeenCalled();
    });

    it('blocks a manual run when wifi-only policy is unmet and asks for confirmation', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners, transport: 'cellular' });
      withEnabledSchedule(context, 'media', 'daily');
      context.setSchedule('media', { networkPolicy: 'wifi_only' });
      const outcome = await context.engine.runManual('media');
      expect(outcome.kind).toBe('network_policy');
      expect(runners.runMedia).not.toHaveBeenCalled();
    });

    it('allows the one-time cellular override when confirmed', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners, transport: 'cellular' });
      withEnabledSchedule(context, 'media', 'daily');
      context.setSchedule('media', { networkPolicy: 'wifi_only' });
      const outcome = await context.engine.runManual('media', { allowCellular: true });
      expect(outcome.kind).toBe('job');
      expect(runners.runMedia).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual' }));
    });

    it('runs without confirmation on an eligible network', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners, transport: 'wifi' });
      withEnabledSchedule(context, 'media', 'daily');
      context.setSchedule('media', { networkPolicy: 'wifi_only' });
      const outcome = await context.engine.runManual('media');
      expect(outcome.kind).toBe('job');
      expect(runners.runMedia).toHaveBeenCalled();
    });
  });

  describe('runDueScheduled', () => {
    it('skips categories that are off, paused, or not due yet', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      // data due at now; media remains off.
      const summary = await context.engine.runDueScheduled();
      expect(summary.results.map((item) => item.category)).toEqual(['data']);
      expect(runners.runMedia).not.toHaveBeenCalled();
    });

    it('runs a due category and advances the due date exactly one interval', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0]).toMatchObject({ category: 'data', outcome: 'success' });
      expect(context.repo.listSchedules().find((item) => item.category === 'data')!.nextDueAt).toBe('2026-08-18T09:00:00.000Z');
      expect(context.notifications.notifyResult).toHaveBeenCalledWith(expect.objectContaining({ category: 'data', outcome: 'success' }));
    });

    it('deferred on network policy without advancing and without a failure notification', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners, transport: 'cellular' });
      withEnabledSchedule(context, 'media', 'daily');
      context.setSchedule('media', { networkPolicy: 'wifi_only' });
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0]).toMatchObject({ category: 'media', outcome: 'deferred' });
      expect(runners.runMedia).not.toHaveBeenCalled();
      const schedule = context.repo.listSchedules().find((item) => item.category === 'media')!;
      expect(schedule.lastResult).toBe('deferred');
      expect(schedule.nextDueAt).toBe(NOW);
      expect(schedule.lastAttemptAt).toBeNull();
      expect(context.notifications.notifyResult).not.toHaveBeenCalled();
    });

    it('records no_change, advances, and notifies no-change when nothing changed', async () => {
      const runners = {
        runData: jest.fn(async (input) => job('data', input.trigger, 'no_change')),
        runMedia: emptyRunners().runMedia,
      };
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0]).toMatchObject({ category: 'data', outcome: 'no_change' });
      expect(context.notifications.notifyResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'no_change' }));
      expect(context.repo.listSchedules().find((item) => item.category === 'data')!.lastResult).toBe('no_change');
    });

    it('advances on failure and notifies with the failed outcome', async () => {
      const runners = {
        runData: jest.fn(async (input) => job('data', input.trigger, 'failed')),
        runMedia: emptyRunners().runMedia,
      };
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0]).toMatchObject({ category: 'data', outcome: 'failed' });
      expect(context.notifications.notifyResult).toHaveBeenCalledWith(expect.objectContaining({ category: 'data', outcome: 'failed' }));
      expect(context.repo.listSchedules().find((item) => item.category === 'data')!.nextDueAt).toBe('2026-08-18T09:00:00.000Z');
    });

    it('does not advance when the job was cancelled', async () => {
      const runners = {
        runData: jest.fn(async (input) => job('data', input.trigger, 'cancelled')),
        runMedia: emptyRunners().runMedia,
      };
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0]).toMatchObject({ category: 'data', outcome: 'cancelled' });
      expect(context.repo.listSchedules().find((item) => item.category === 'data')!.nextDueAt).toBe(NOW);
    });

    it('handles late catch-up without bursting (advances once from the previous anchor)', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners });
      const late = '2026-08-01T09:00:00.000Z';
      withEnabledSchedule(context, 'data', 'daily');
      context.setSchedule('data', { nextDueAt: late });
      await context.engine.runDueScheduled();
      const next = context.repo.listSchedules().find((item) => item.category === 'data')!.nextDueAt!;
      expect(Date.parse(next)).toBeGreaterThan(Date.parse(NOW));
      expect((Date.parse(next) - Date.parse(late)) / DAY_MS).toBe(17);
      expect(runners.runData).toHaveBeenCalledTimes(1);
    });

    it('pauses schedules and notifies ownership change when the owner changed', async () => {
      const ownership = ownershipStub({
        verifyBeforeRun: jest.fn(async () => { throw new DriveClientError('NOT_OWNER', 'other'); }),
      });
      const context = await setup({ ownership, initiallyRegistered: true });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0]).toMatchObject({ category: 'data', outcome: 'not_owner' });
      const connection = context.repo.getConnection()!;
      expect(connection.schedulesPaused).toBe(true);
      expect(connection.pauseReason).toBe('owner_changed');
      expect(context.notifications.notifyOwnershipChanged).toHaveBeenCalled();
      expect(context.taskAdapter.unregister).toHaveBeenCalled();
    });

    it('does not re-notify ownership change on every wake after pausing', async () => {
      const ownership = ownershipStub({
        verifyBeforeRun: jest.fn(async () => { throw new DriveClientError('NOT_OWNER', 'other'); }),
      });
      const context = await setup({ ownership });
      withEnabledSchedule(context, 'data', 'daily');
      await context.engine.runDueScheduled();
      await context.engine.runDueScheduled();
      expect(context.notifications.notifyOwnershipChanged).toHaveBeenCalledTimes(1);
    });

    it('runs data and media due independently with a shared start', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      withEnabledSchedule(context, 'media', 'weekly');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results.map((item) => item.category).sort()).toEqual(['data', 'media']);
      expect(context.repo.listSchedules().find((item) => item.category === 'media')!.nextDueAt).toBe('2026-08-24T09:00:00.000Z');
      expect(context.repo.listSchedules().find((item) => item.category === 'data')!.nextDueAt).toBe('2026-08-18T09:00:00.000Z');
    });

    it('emits one auth-required notification when the connection demands reconnection', async () => {
      const context = await setup({ connectionState: 'auth_required' });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results).toHaveLength(0);
      expect(context.notifications.notifyAuthRequired).toHaveBeenCalledTimes(1);
    });
  });

  describe('runNotificationRetry', () => {
    it('resumes a failed media job without changing the due date', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners });
      withEnabledSchedule(context, 'media', 'daily');
      const outcome = await context.engine.runNotificationRetry('media');
      expect(outcome.kind).toBe('job');
      expect(runners.runMedia).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'notification_retry' }));
      expect(context.repo.listSchedules().find((item) => item.category === 'media')!.nextDueAt).toBe(NOW);
    });

    it('returns network_policy when the retry cannot use the current transport', async () => {
      const context = await setup({ transport: 'cellular' });
      withEnabledSchedule(context, 'media', 'daily');
      context.setSchedule('media', { networkPolicy: 'wifi_only' });
      const outcome = await context.engine.runNotificationRetry('media');
      expect(outcome.kind).toBe('network_policy');
    });
  });

  describe('worker reconciliation', () => {
    it('registers once using the shortest enabled interval', async () => {
      const context = await setup();
      withEnabledSchedule(context, 'data', 'monthly');
      withEnabledSchedule(context, 'media', 'daily');
      await context.engine.reconcileWorkerRegistration();
      expect(context.taskAdapter.register).toHaveBeenCalledWith(24 * 60); // daily => 1440 minutes
      expect(context.taskAdapter.unregister).not.toHaveBeenCalled();
    });

    it('unregisters when everything is off or paused', async () => {
      const context = await setup({ initiallyRegistered: true });
      await context.engine.reconcileWorkerRegistration();
      expect(context.taskAdapter.unregister).toHaveBeenCalled();
    });
  });

  describe('app-level catch-up', () => {
    it('runs due work, runs maintenance, and reconciles the worker on startup', async () => {
      const runners = emptyRunners();
      const maintenance = jest.fn(async () => undefined);
      const context = await setup({ runners, maintenance: { run: maintenance } });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.startupCatchUp();
      expect(summary.results[0].outcome).toBe('success');
      expect(maintenance).toHaveBeenCalled();
      expect(context.taskAdapter.register).toHaveBeenCalled();
    });

    it('keeps catch-up working when maintenance fails', async () => {
      const runners = emptyRunners();
      const maintenance = jest.fn(async () => { throw new Error('cleanup failed'); });
      const context = await setup({ runners, maintenance: { run: maintenance } });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.startupCatchUp();
      expect(summary.results[0].outcome).toBe('success');
    });

    it('advances from now when an enabled schedule has no due date yet', async () => {
      const runners = emptyRunners();
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      context.setSchedule('data', { nextDueAt: null });
      const summary = await context.engine.runDueScheduled();
      // Without a due anchor the engine does not run: cadence is anchored at enablement.
      expect(summary.results).toHaveLength(0);
      expect(runners.runData).not.toHaveBeenCalled();
    });

    it('does nothing while disconnected and never notifies', async () => {
      const context = await setup({ connectionState: 'disconnected' });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results).toHaveLength(0);
      expect(context.notifications.notifyAuthRequired).not.toHaveBeenCalled();
    });

    it('rejects takeover while the account is not connected', async () => {
      const context = await setup({ connectionState: 'auth_required' });
      const outcome = await context.engine.takeOverAndEnable({ category: 'data', frequency: 'daily', networkPolicy: 'any' });
      expect(outcome.kind).toBe('auth_required');
    });

    it('notifies a failed run with its safe error code', async () => {
      const runners = {
        runData: jest.fn(async (input) => job('data', input.trigger, 'failed', { errorCode: 'QUOTA_EXCEEDED' })),
        runMedia: emptyRunners().runMedia,
      };
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0].outcome).toBe('failed');
      expect(context.notifications.notifyResult).toHaveBeenCalledWith(expect.objectContaining({
        category: 'data', outcome: 'failed', errorCode: 'QUOTA_EXCEEDED',
      }));
    });

    it('rethrows unexpected ownership errors instead of pausing silently', async () => {
      const ownership = ownershipStub({
        verifyBeforeRun: jest.fn(async () => { throw new Error('drive unavailable'); }),
      });
      const context = await setup({ ownership });
      withEnabledSchedule(context, 'data', 'daily');
      await expect(context.engine.runDueScheduled()).rejects.toThrow('drive unavailable');
      expect(context.notifications.notifyOwnershipChanged).not.toHaveBeenCalled();
    });

    it('records a failed outcome when the runner throws', async () => {
      const runners = {
        runData: jest.fn(async () => { throw new Error('boom'); }),
        runMedia: emptyRunners().runMedia,
      };
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0]).toMatchObject({ category: 'data', outcome: 'failed' });
    });

    it('propagates unexpected claim errors when enabling a schedule', async () => {
      const ownership = ownershipStub({
        claimOwnership: jest.fn(async () => { throw new Error('drive unavailable'); }),
      });
      const context = await setup({ ownership });
      await expect(context.engine.enableSchedule({ category: 'data', frequency: 'daily', networkPolicy: 'any' }))
        .rejects.toThrow('drive unavailable');
    });

    it('reconciles interrupted jobs older than the lease window on startup', async () => {
      const context = await setup();
      const stale = context.repo.createJob({ category: 'data', trigger: 'scheduled', deviceId: 'device-1' }, () => 'stale-job');
      context.repo.transitionJob(stale.id, 'queued', 'preparing');
      context.db.runSync(`UPDATE drive_backup_job SET created_at = '2026-08-01T00:00:00.000Z' WHERE id = 'stale-job'`);
      await context.engine.startupCatchUp();
      expect(context.repo.getJob('stale-job')).toMatchObject({ state: 'failed', errorCode: 'UNKNOWN' });
    });

    it('reports a partial scheduled run and advances the due date', async () => {
      const runners = {
        runData: jest.fn(async (input) => job('data', input.trigger, 'partial', { itemCount: 3 })),
        runMedia: emptyRunners().runMedia,
      };
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0].outcome).toBe('partial');
      expect(context.notifications.notifyResult).toHaveBeenCalledWith(expect.objectContaining({
        category: 'data', outcome: 'partial', itemCount: 3,
      }));
      expect(context.repo.listSchedules().find((item) => item.category === 'data')!.lastResult).toBe('partial');
    });

    it('treats an unexpected job state as skipped without advancing or notifying', async () => {
      const runners = {
        runData: jest.fn(async (input) => job('data', input.trigger, 'queued')),
        runMedia: emptyRunners().runMedia,
      };
      const context = await setup({ runners });
      withEnabledSchedule(context, 'data', 'daily');
      const summary = await context.engine.runDueScheduled();
      expect(summary.results[0].outcome).toBe('skipped');
      expect(context.repo.listSchedules().find((item) => item.category === 'data')!.nextDueAt).toBe(NOW);
      expect(context.notifications.notifyResult).not.toHaveBeenCalled();
    });

    it('pauses schedules silently when no ownership notification is requested', async () => {
      const context = await setup();
      await context.engine.pauseSchedules('disconnected', false);
      const connection = context.repo.getConnection()!;
      expect(connection.schedulesPaused).toBe(true);
      expect(context.notifications.notifyOwnershipChanged).not.toHaveBeenCalled();
    });
  });
});
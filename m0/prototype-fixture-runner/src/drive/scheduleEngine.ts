import type {
  DriveBackupJob,
  DriveCategory,
  DriveFrequency,
  DriveNetworkPolicy,
  DriveResult,
  DriveTrigger,
  DriveErrorCode,
} from './contracts';
import { DriveClientError } from './client';
import {
  addCalendarInterval,
  advanceDueDate,
  isDue,
  shortestEnabledIntervalMs,
  type CadenceFrequency,
} from './driveBackupDomain';
import { isNetworkEligible, type NetworkTransport } from './networkState';
import type { DriveOwnership } from './ownership';
import type { DriveResultNotificationInput } from './driveNotifications';
import type { DriveRepo } from '@/repositories/drive';

export type NotifyService = {
  notifyResult(input: DriveResultNotificationInput): Promise<boolean>;
  notifyOwnershipChanged(): Promise<boolean>;
  notifyAuthRequired(): Promise<boolean>;
};

export type TaskAdapter = {
  isRegistered(): Promise<boolean>;
  register(minimumIntervalMinutes: number): Promise<void>;
  unregister(): Promise<void>;
};

export type EnableScheduleInput = {
  category: DriveCategory;
  frequency: DriveFrequency;
  networkPolicy: DriveNetworkPolicy;
};

export type EnableScheduleOutcome =
  | { kind: 'enabled' }
  | { kind: 'disabled' }
  | { kind: 'takeover_required' }
  | { kind: 'auth_required' };

export type ManualRunOutcome =
  | { kind: 'job'; job: DriveBackupJob }
  | { kind: 'network_policy' };

export type ScheduledOutcome =
  | 'skipped' | 'deferred' | 'not_owner' | 'success' | 'no_change' | 'partial' | 'failed' | 'cancelled';

export type ScheduledCategoryResult = { category: DriveCategory; outcome: ScheduledOutcome; job?: DriveBackupJob };

export type ScheduledRunSummary = { batchId: string; results: ScheduledCategoryResult[] };

const STALE_JOB_WINDOW_MS = 60 * 60 * 1000;
const ATTEMPT_OUTCOMES: readonly DriveBackupJob['state'][] = ['committed', 'no_change', 'partial', 'failed'];

function outcomeFor(state: DriveBackupJob['state']): ScheduledOutcome {
  switch (state) {
    case 'committed': return 'success';
    case 'no_change': return 'no_change';
    case 'partial': return 'partial';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    default: return 'skipped';
  }
}

function resultFor(state: DriveBackupJob['state']): DriveResult | undefined {
  switch (state) {
    case 'committed': return 'success';
    case 'no_change': return 'no_change';
    case 'partial': return 'partial';
    case 'failed': return 'failed';
    default: return undefined;
  }
}

function isNotOwner(error: unknown): boolean {
  return error instanceof DriveClientError && error.code === ('NOT_OWNER' satisfies DriveErrorCode);
}

export function createDriveScheduleEngine(dependencies: {
  repo: DriveRepo;
  ownership: DriveOwnership;
  getTransport: () => Promise<NetworkTransport>;
  notifications: NotifyService;
  taskAdapter: TaskAdapter;
  runData: (input: { trigger: DriveTrigger; batchId?: string; signal?: AbortSignal }) => Promise<DriveBackupJob>;
  runMedia: (input: { trigger: DriveTrigger; batchId?: string; signal?: AbortSignal; retryJobId?: string }) => Promise<DriveBackupJob>;
  now: () => string;
  createId: () => string;
  maintenance?: { run(): Promise<void> };
}) {
  const { repo, ownership, getTransport, notifications, taskAdapter, now, createId } = dependencies;
  const notifiedAuthRequired = new Set<string>();

  const scheduleFor = (category: DriveCategory) => {
    const schedule = repo.listSchedules().find((item) => item.category === category);
    if (!schedule) throw new Error(`Drive schedule for ${category} is missing.`);
    return schedule;
  };

  function isConnected(): boolean {
    const connection = repo.getConnection();
    return connection?.connectionState === 'connected';
  }

  async function resumeConnection(): Promise<void> {
    const connection = repo.getConnection();
    if (!connection) return;
    repo.saveConnection({
      ...connection,
      schedulesPaused: false,
      pauseReason: null,
      updatedAt: now(),
    });
    for (const schedule of repo.listSchedules()) {
      repo.updateSchedule({ ...schedule, pausedReason: null });
    }
  }

  async function pauseSchedules(reason: 'disconnected' | 'owner_changed' | 'auth_required', notifyOwnership: boolean): Promise<void> {
    const connection = repo.getConnection();
    const alreadyPausedForReason = connection?.pauseReason === reason && connection?.schedulesPaused === true;
    if (connection) {
      repo.saveConnection({ ...connection, schedulesPaused: true, pauseReason: reason, updatedAt: now() });
    }
    for (const schedule of repo.listSchedules()) {
      repo.updateSchedule({ ...schedule, pausedReason: reason });
    }
    await reconcileWorkerRegistration();
    if (notifyOwnership && !alreadyPausedForReason) {
      await notifications.notifyOwnershipChanged();
    }
  }

  async function reconcileWorkerRegistration(): Promise<void> {
    const connection = repo.getConnection();
    const enabled = repo.listSchedules().filter((schedule) => (
      schedule.frequency !== 'off'
      && !schedule.pausedReason
      && !connection?.schedulesPaused
    ));
    const registered = await taskAdapter.isRegistered();
    if (enabled.length === 0) {
      if (registered) await taskAdapter.unregister();
      return;
    }
    const shortestMs = shortestEnabledIntervalMs(enabled);
    const minutes = shortestMs === null ? 0 : Math.max(15, Math.ceil(shortestMs / 60_000));
    if (!registered) await taskAdapter.register(minutes);
  }

  async function reconcileStaleJobs(): Promise<void> {
    const cutoff = new Date(Date.parse(now()) - STALE_JOB_WINDOW_MS).toISOString();
    for (const job of repo.listJobs()) {
      if (!['queued', 'preparing', 'uploading', 'verifying'].includes(job.state)) continue;
      if (job.createdAt >= cutoff) continue;
      repo.transitionJob(job.id, job.state, 'failed', {
        errorCode: 'UNKNOWN',
        errorDetailSafe: 'Interrupted Drive job reconciled on startup.',
      });
    }
  }

  async function advanceAndRecord(schedule: ReturnType<typeof scheduleFor>, job: DriveBackupJob): Promise<void> {
    const mapped = resultFor(job.state);
    if (mapped === undefined) return; // cancelled/skipped runs do not advance.
    const frequency = schedule.frequency as CadenceFrequency;
    const nextDueAt = schedule.nextDueAt
      ? advanceDueDate(schedule.nextDueAt, frequency, now())
      : addCalendarInterval(now(), frequency);
    repo.updateSchedule({
      ...schedule,
      nextDueAt,
      lastCheckedAt: now(),
      lastAttemptAt: now(),
      lastResult: mapped,
    });
  }

  return {
    async enableSchedule(input: EnableScheduleInput): Promise<EnableScheduleOutcome> {
      if (input.frequency === 'off') {
        const schedule = scheduleFor(input.category);
        repo.updateSchedule({
          ...schedule,
          frequency: 'off',
          enabledAt: null,
          nextDueAt: null,
          pausedReason: null,
        });
        await reconcileWorkerRegistration();
        return { kind: 'disabled' };
      }
      if (!isConnected()) return { kind: 'auth_required' };
      try {
        await ownership.claimOwnership();
      } catch (error) {
        if (isNotOwner(error)) return { kind: 'takeover_required' };
        throw error;
      }
      const schedule = scheduleFor(input.category);
      repo.updateSchedule({
        ...schedule,
        frequency: input.frequency,
        networkPolicy: input.networkPolicy,
        enabledAt: now(),
        nextDueAt: addCalendarInterval(now(), input.frequency as DriveFrequency as CadenceFrequency),
        pausedReason: null,
      });
      await resumeConnection();
      await reconcileWorkerRegistration();
      return { kind: 'enabled' };
    },

    async takeOverAndEnable(input: EnableScheduleInput): Promise<EnableScheduleOutcome> {
      if (!isConnected()) return { kind: 'auth_required' };
      await ownership.takeOver();
      return this.enableSchedule(input);
    },

    setNetworkPolicy(category: DriveCategory, networkPolicy: DriveNetworkPolicy): void {
      const schedule = scheduleFor(category);
      repo.updateSchedule({ ...schedule, networkPolicy });
    },

    async runManual(category: DriveCategory, options: { allowCellular?: boolean; signal?: AbortSignal } = {}): Promise<ManualRunOutcome> {
      const schedule = scheduleFor(category);
      const transport = await getTransport();
      if (!isNetworkEligible(schedule.networkPolicy, transport) && !options.allowCellular) {
        return { kind: 'network_policy' };
      }
      const job = category === 'data'
        ? await dependencies.runData({ trigger: 'manual', signal: options.signal })
        : await dependencies.runMedia({ trigger: 'manual', signal: options.signal });
      return { kind: 'job', job };
    },

    async runNotificationRetry(category: DriveCategory, signal?: AbortSignal): Promise<ManualRunOutcome> {
      const schedule = scheduleFor(category);
      const transport = await getTransport();
      if (!isNetworkEligible(schedule.networkPolicy, transport)) {
        return { kind: 'network_policy' };
      }
      const job = category === 'data'
        ? await dependencies.runData({ trigger: 'notification_retry', signal })
        : await dependencies.runMedia({ trigger: 'notification_retry', signal });
      return { kind: 'job', job };
    },

    async runDueScheduled(): Promise<ScheduledRunSummary> {
      const batchId = createId();
      const results: ScheduledCategoryResult[] = [];
      const connection = repo.getConnection();
      if (!connection) return { batchId, results };

      if (connection.connectionState === 'auth_required') {
        if (!notifiedAuthRequired.has('auth')) {
          notifiedAuthRequired.add('auth');
          await notifications.notifyAuthRequired();
        }
        await reconcileWorkerRegistration();
        return { batchId, results };
      }
      if (connection.connectionState !== 'connected') return { batchId, results };

      for (const category of ['data', 'media'] as const) {
        const schedule = scheduleFor(category);
        if (schedule.frequency === 'off' || schedule.pausedReason) continue;
        if (!schedule.nextDueAt || !isDue(schedule.nextDueAt, now())) continue;

        const transport = await getTransport();
        if (!isNetworkEligible(schedule.networkPolicy, transport)) {
          repo.updateSchedule({ ...schedule, lastCheckedAt: now(), lastResult: 'deferred' });
          results.push({ category, outcome: 'deferred' });
          continue;
        }

        try {
          await ownership.verifyBeforeRun();
        } catch (error) {
          if (isNotOwner(error)) {
            await pauseSchedules('owner_changed', true);
            results.push({ category, outcome: 'not_owner' });
            return { batchId, results };
          }
          throw error;
        }

        try {
          const job = category === 'data'
            ? await dependencies.runData({ trigger: 'scheduled', batchId })
            : await dependencies.runMedia({ trigger: 'scheduled', batchId });
          const outcome = outcomeFor(job.state);
          if (ATTEMPT_OUTCOMES.includes(job.state)) {
            await advanceAndRecord(schedule, job);
          }
          if (outcome === 'success' || outcome === 'no_change' || outcome === 'partial' || outcome === 'failed') {
            await notifications.notifyResult({
              category,
              outcome,
              itemCount: job.itemCount ?? undefined,
              bytesTotal: job.bytesTotal ?? undefined,
              missingCount: category === 'media' && outcome === 'partial' ? job.itemCount ?? undefined : undefined,
              errorCode: job.errorCode ?? undefined,
            });
          }
          results.push({ category, outcome, job });
        } catch {
          results.push({ category, outcome: 'failed' });
        }
      }
      return { batchId, results };
    },

    async startupCatchUp(): Promise<ScheduledRunSummary> {
      await reconcileStaleJobs();
      if (dependencies.maintenance) {
        try {
          await dependencies.maintenance.run();
        } catch {
          // Maintenance is best-effort; a cleanup failure must not break catch-up.
        }
      }
      await reconcileWorkerRegistration();
      return this.runDueScheduled();
    },

    async reconcileWorkerRegistration(): Promise<void> {
      await reconcileWorkerRegistration();
    },

    pauseSchedules,
  };
}

export type DriveScheduleEngine = ReturnType<typeof createDriveScheduleEngine>;
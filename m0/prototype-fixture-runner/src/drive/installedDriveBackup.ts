import { Directory, File, Paths } from 'expo-file-system';
import { getDb } from '@/db';
import type { SqliteLike } from '@/db/types';
import { uuid } from '@/utils/id';
import { createDriveRepo, type DriveRepo } from '@/repositories/drive';
import { applyDataRestore } from '@/services/backup';
import { regenerateThumbnail } from '@/services/media';
import { createInstalledNitroGoogleDriveAuthSpike } from '@/spikes/googleDriveAuth/installedNitroAdapter';
import { createDriveClient } from './client';
import { createDriveConnectionLifecycle, type DriveConnectionErrorCode } from './connectionLifecycle';
import {
  createDriveCloudHistoryService,
  type CloudHistoryItem,
  type DeleteSnapshotResult,
} from './cloudHistory';
import {
  createDataBackupOrchestrator,
  createDriveDataGateway,
  type DataBackupRunInput,
} from './dataBackupOrchestrator';
import {
  createDriveMediaGateway,
  createMediaBackupOrchestrator,
  type MediaBackupRunInput,
} from './mediaBackupOrchestrator';
import { createBackupAllOrchestrator, type BackupAllResult } from './backupAllOrchestrator';
import { createDriveNotifications } from './driveNotifications';
import { createInstalledNetworkReader } from './networkState';
import { createDriveOwnership } from './ownership';
import { createDriveScheduleEngine, type EnableScheduleOutcome, type ManualRunOutcome, type ScheduledRunSummary } from './scheduleEngine';
import { cleanupOrphanStaging } from './staging';
import { createDriveSecretStore } from './secretStore';
import { createInstalledDataStagingService } from './installedDataStaging';
import { createExpoChunkedFileReader, createInstalledMediaInventory } from './installedMediaInventory';
import { createInstalledTaskAdapter } from './driveBackupTask';
import { getDriveDeviceIdentity } from './deviceIdentity';
import {
  createDriveRestoreService,
  recommendMediaSnapshot,
  type DataRestorePrepared,
  type MediaRestorePrepared,
  type MediaRecommendation,
  type MediaRestoreResult,
} from './driveRestore';
import type {
  DriveBackupJob,
  DriveCategory,
  DriveConnection,
  DriveNetworkPolicy,
  DriveSchedule,
  DriveTrigger,
} from './contracts';

const ORCHESTRATION_LEASE_MS = 2 * 60 * 60 * 1000;
const ORPHAN_STAGING_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export type DriveConnectOutcome = { status: 'connected'; connection: DriveConnection } | { status: 'cancelled' };

export type InstalledDriveBackup = {
  connect(): Promise<DriveConnectOutcome>;
  reconnect(): Promise<DriveConnectOutcome>;
  disconnect(): Promise<void>;
  resumeSchedules(): Promise<void>;
  connection(): DriveConnection | null;
  schedules(): DriveSchedule[];
  jobs(category?: DriveCategory): DriveBackupJob[];
  ownerStatus(): Promise<{ isOwner: boolean; ownerDeviceLabel?: string; claimedAt?: string }>;
  enableSchedule(input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }): Promise<EnableScheduleOutcome>;
  takeOverAndEnable(input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }): Promise<EnableScheduleOutcome>;
  setNetworkPolicy(category: DriveCategory, networkPolicy: DriveNetworkPolicy): void;
  runManual(category: DriveCategory, options?: { allowCellular?: boolean }): Promise<ManualRunOutcome>;
  runBackupAll(trigger: DriveTrigger): Promise<BackupAllResult>;
  retryMedia(input: BackupAllResult): Promise<DriveBackupJob>;
  runNotificationRetry(category: DriveCategory): Promise<ManualRunOutcome>;
  runScheduledCatchUp(): Promise<ScheduledRunSummary>;
  startupCatchUp(): Promise<ScheduledRunSummary>;
  reconcileWorker(): Promise<void>;
  listHistory(): Promise<CloudHistoryItem[]>;
  deleteSnapshot(category: DriveCategory, remoteFileId: string): Promise<DeleteSnapshotResult>;
  estimate(category: DriveCategory): Promise<{ bytes: number; itemCount?: number; missingCount?: number }>;
  isConnected(): boolean;
  prepareDataRestore(remoteFileId: string): Promise<DataRestorePrepared>;
  releaseRestoreStaging(path: string): void;
  applyPreparedDataRestore(prepared: DataRestorePrepared): Promise<Awaited<ReturnType<typeof applyDataRestore>>>;
  prepareMediaRestore(remoteFileId: string): Promise<MediaRestorePrepared>;
  applyPreparedMediaRestore(prepared: MediaRestorePrepared): Promise<MediaRestoreResult>;
  recommendMedia(history: CloudHistoryItem[], selectedData: CloudHistoryItem): MediaRecommendation;
};

type BuiltServices = {
  db: SqliteLike;
  repo: DriveRepo;
  connection: ReturnType<typeof createDriveConnectionLifecycle>;
  client: ReturnType<typeof createDriveClient>;
  engine: ReturnType<typeof createDriveScheduleEngine>;
  backupAll: ReturnType<typeof createBackupAllOrchestrator>;
  history: ReturnType<typeof createDriveCloudHistoryService>;
  restore: ReturnType<typeof createDriveRestoreService>;
  staging: ReturnType<typeof createInstalledDataStagingService>;
  inventory: ReturnType<typeof createInstalledMediaInventory>;
  ownership: ReturnType<typeof createDriveOwnership>;
  deviceId: string;
  deviceLabel: string;
  notifications: ReturnType<typeof createDriveNotifications>;
};

function createInstalledMaintenance(services: {
  repo: DriveRepo;
}): { run(): Promise<void> } {
  return {
    async run(): Promise<void> {
      const directory = new Directory(Paths.cache, 'oshilog', 'drive-staging');
      if (!directory.exists) return;
      const activePaths = new Set(services.repo.listUploadSessions().map((session) => session.localStagingPath));
      const cutoff = new Date(Date.now() - ORPHAN_STAGING_AGE_MS).toISOString();
      const files = (directory.list() as (File | Directory)[])
        .filter((entry): entry is File => 'size' in entry)
        .map((file) => ({
          path: file.uri,
          modifiedAt: new Date(file.lastModified ?? 0).toISOString(),
        }));
      await cleanupOrphanStaging(files, activePaths, cutoff, directory.uri, async (path) => {
        const file = new File(path);
        if (file.exists) file.delete();
      });
    },
  };
}

let servicesPromise: Promise<BuiltServices> | null = null;

async function buildServices(): Promise<BuiltServices> {
  const db = getDb();
  const repo = createDriveRepo(db, () => new Date().toISOString());
  const secrets = createDriveSecretStore();
  const { deviceId, deviceLabel } = await getDriveDeviceIdentity();
  const now = () => new Date().toISOString();
  const createId = uuid;

  const auth = await createInstalledNitroGoogleDriveAuthSpike();
  const connection = createDriveConnectionLifecycle({
    repo,
    auth,
    secrets,
    now,
    deviceId: () => deviceId,
    deviceLabel: () => deviceLabel,
  });

  const client = createDriveClient({ acquireAccessToken: () => connection.acquireAccessToken() });

  const ownership = createDriveOwnership({
    client,
    secrets,
    now,
    createId,
    deviceId: () => deviceId,
    deviceLabel: () => deviceLabel,
  });

  const scheduledTrigger = (trigger: DriveTrigger): boolean => trigger === 'scheduled' || trigger === 'startup_catchup';

  const staging = createInstalledDataStagingService(db, () => deviceLabel);
  const inventory = createInstalledMediaInventory(db, createExpoChunkedFileReader());

  const dataOrchestrator = createDataBackupOrchestrator({
    repo,
    drive: createDriveDataGateway(client),
    staging,
    acquireAccessToken: () => connection.acquireAccessToken(),
    assertTriggerEligible: (trigger) => scheduledTrigger(trigger) ? ownership.verifyBeforeRun() : Promise.resolve(),
    assertCommitEligible: (trigger) => scheduledTrigger(trigger) ? ownership.verifyBeforeCommit() : Promise.resolve(),
    now,
    createId,
    deviceId: () => deviceId,
    leaseDurationMs: ORCHESTRATION_LEASE_MS,
  });

  const mediaOrchestrator = createMediaBackupOrchestrator({
    repo,
    drive: createDriveMediaGateway(client),
    inventory,
    reader: createExpoChunkedFileReader(),
    secrets,
    acquireAccessToken: () => connection.acquireAccessToken(),
    assertTriggerEligible: (trigger) => scheduledTrigger(trigger) ? ownership.verifyBeforeRun() : Promise.resolve(),
    assertCommitEligible: (trigger) => scheduledTrigger(trigger) ? ownership.verifyBeforeCommit() : Promise.resolve(),
    now,
    createId,
    deviceId: () => deviceId,
    deviceLabel: () => deviceLabel,
    appVersion: () => '0.1.0',
    schemaVersion: () => 12,
    leaseDurationMs: ORCHESTRATION_LEASE_MS,
  });

  const backupAll = createBackupAllOrchestrator({
    data: dataOrchestrator,
    media: mediaOrchestrator,
    createId,
  });

  const notifications = createDriveNotifications();

  const engine = createDriveScheduleEngine({
    repo,
    ownership,
    getTransport: createInstalledNetworkReader(),
    notifications,
    taskAdapter: createInstalledTaskAdapter(),
    runData: (input: DataBackupRunInput) => dataOrchestrator.run(input),
    runMedia: (input: MediaBackupRunInput) => mediaOrchestrator.run(input),
    now,
    createId,
    maintenance: createInstalledMaintenance({ repo }),
  });

  const history = createDriveCloudHistoryService({ client, repo });

  const restoreDirectory = new Directory(Paths.cache, 'oshilog', 'drive-restore');
  if (!restoreDirectory.exists) {
    restoreDirectory.create({ intermediates: true, idempotent: true });
  }
  const restore = createDriveRestoreService({
    client,
    listHistory: () => history.listHistory(),
    db,
    stagingDirectory: restoreDirectory.uri,
    regenerateThumbnail,
  });

  return { db, repo, connection, client, engine, backupAll, history, restore, staging, inventory, ownership, deviceId, deviceLabel, notifications };
}

function services(): Promise<BuiltServices> {
  servicesPromise ??= buildServices();
  return servicesPromise;
}

/** Test seam: resets the singleton between reloads (never used in production code paths). */
export function resetInstalledDriveServicesForTesting(): void {
  servicesPromise = null;
}

export async function getInstalledDriveBackup(): Promise<InstalledDriveBackup> {
  const built = await services();
  const connect = async (reconnect: boolean): Promise<DriveConnectOutcome> => {
    const outcome = reconnect ? await built.connection.reconnect() : await built.connection.connect();
    if (outcome.status === 'connected') {
      const schedules = built.repo.listSchedules();
      if (schedules.every((schedule) => schedule.frequency === 'off')) {
        await built.engine.reconcileWorkerRegistration();
      }
    }
    return outcome;
  };
  return {
    async connect() { return connect(false); },
    async reconnect() { return connect(true); },
    async disconnect() { await built.connection.disconnect(); await built.engine.reconcileWorkerRegistration(); },
    async resumeSchedules() { built.connection.resumeSchedules(); await built.engine.reconcileWorkerRegistration(); },
    connection: () => built.repo.getConnection(),
    schedules: () => built.repo.listSchedules(),
    jobs: (category?: DriveCategory) => built.repo.listJobs(category),
    isConnected: () => built.repo.getConnection()?.connectionState === 'connected',
    async ownerStatus() {
      try {
        const owner = await built.ownership.readOwner();
        if (!owner) return { isOwner: false };
        return {
          isOwner: owner.deviceId === built.deviceId && await built.ownership.isCurrentlyOwner(),
          ownerDeviceLabel: owner.deviceLabel,
          claimedAt: owner.claimedAt,
        };
      } catch {
        return { isOwner: false };
      }
    },
    enableSchedule: (input) => built.engine.enableSchedule(input),
    takeOverAndEnable: (input) => built.engine.takeOverAndEnable(input),
    setNetworkPolicy: (category, networkPolicy) => built.engine.setNetworkPolicy(category, networkPolicy),
    runManual: (category, options) => built.engine.runManual(category, options),
    runBackupAll: (trigger) => built.backupAll.run({ trigger }),
    retryMedia: (input) => built.backupAll.retryMedia(input),
    runNotificationRetry: (category) => built.engine.runNotificationRetry(category),
    runScheduledCatchUp: () => built.engine.runDueScheduled(),
    startupCatchUp: () => built.engine.startupCatchUp(),
    reconcileWorker: () => built.engine.reconcileWorkerRegistration(),
    listHistory: () => built.history.listHistory(),
    deleteSnapshot: (category, remoteFileId) => built.history.deleteSnapshot(category, remoteFileId),
    async estimate(category) {
      if (category === 'data') {
        const staged = await built.staging.prepare();
        try {
          return { bytes: staged.artifact.bytes, itemCount: staged.artifact.itemCount, missingCount: 0 };
        } finally {
          await built.staging.release(staged.path);
        }
      }
      const inventoryResult = await built.inventory.prepare();
      return { bytes: inventoryResult.totalBytes, itemCount: inventoryResult.entries.length, missingCount: inventoryResult.missingCount };
    },
    prepareDataRestore: (remoteFileId) => built.restore.prepareDataRestore(remoteFileId),
    releaseRestoreStaging: (path) => built.restore.releasePrepared(path),
    applyPreparedDataRestore: (prepared) => built.restore.applyPreparedDataRestore(prepared),
    prepareMediaRestore: (remoteFileId) => built.restore.prepareMediaRestore(remoteFileId),
    applyPreparedMediaRestore: (prepared) => built.restore.applyMediaRestore(prepared),
    recommendMedia: (historyItems, selectedData) => recommendMediaSnapshot(historyItems, selectedData),
  };
}

export async function runInstalledScheduledCatchUp(): Promise<ScheduledRunSummary> {
  const built = await services();
  return built.engine.startupCatchUp();
}

export async function runInstalledNotificationRetry(category: DriveCategory): Promise<ManualRunOutcome> {
  const built = await services();
  return built.engine.runNotificationRetry(category);
}

export type DriveConnectionFailureCode = DriveConnectionErrorCode | 'LOCKED' | 'UNKNOWN';
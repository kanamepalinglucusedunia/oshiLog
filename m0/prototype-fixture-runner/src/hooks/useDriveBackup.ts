import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getInstalledDriveBackup,
  type DriveConnectOutcome,
  type InstalledDriveBackup,
} from '@/drive/installedDriveBackup';
import {
  recommendMediaSnapshot,
  type DataRestorePrepared,
  type MediaRecommendation,
  type MediaRestorePrepared,
  type MediaRestoreResult,
} from '@/drive/driveRestore';
import type {
  EnableScheduleOutcome,
  ManualRunOutcome,
} from '@/drive/scheduleEngine';
import type { BackupAllResult } from '@/drive/backupAllOrchestrator';
import type { CloudHistoryItem } from '@/drive/cloudHistory';
import type {
  DriveBackupJob,
  DriveCategory,
  DriveConnection,
  DriveNetworkPolicy,
  DriveSchedule,
} from '@/drive/contracts';

export type DriveOwnerStatus = { isOwner: boolean; ownerDeviceLabel?: string; claimedAt?: string };

export type DriveBackupHook = {
  loading: boolean;
  connection: DriveConnection | null;
  schedules: DriveSchedule[];
  jobs: DriveBackupJob[];
  history: CloudHistoryItem[];
  ownerStatus: DriveOwnerStatus;
  busy: string | null;
  error: string | null;
  refresh(): Promise<void>;
  connect(): Promise<void>;
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  resumeSchedules(): Promise<void>;
  enableSchedule(input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }): Promise<EnableScheduleOutcome>;
  takeOverAndEnable(input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }): Promise<EnableScheduleOutcome>;
  setNetworkPolicy(category: DriveCategory, networkPolicy: DriveNetworkPolicy): void;
  runManual(category: DriveCategory, options?: { allowCellular?: boolean }): Promise<ManualRunOutcome>;
  runBackupAll(): Promise<BackupAllResult | null>;
  runNotificationRetry(category: DriveCategory): Promise<ManualRunOutcome>;
  deleteSnapshot(category: DriveCategory, remoteFileId: string): Promise<void>;
  estimate(category: DriveCategory): Promise<{ bytes: number; itemCount?: number; missingCount?: number }>;
  prepareDataRestore(remoteFileId: string): Promise<DataRestorePrepared>;
  applyPreparedDataRestore(prepared: DataRestorePrepared): Promise<Awaited<ReturnType<InstalledDriveBackup['applyPreparedDataRestore']>>>;
  prepareMediaRestore(remoteFileId: string): Promise<MediaRestorePrepared>;
  applyPreparedMediaRestore(prepared: MediaRestorePrepared): Promise<MediaRestoreResult>;
  releaseRestoreStaging(path: string): void;
  recommendMedia(history: CloudHistoryItem[], selectedData: CloudHistoryItem): MediaRecommendation;
};

export function useDriveBackup(): DriveBackupHook {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<DriveConnection | null>(null);
  const [schedules, setSchedules] = useState<DriveSchedule[]>([]);
  const [jobs, setJobs] = useState<DriveBackupJob[]>([]);
  const [history, setHistory] = useState<CloudHistoryItem[]>([]);
  const [ownerStatus, setOwnerStatus] = useState<DriveOwnerStatus>({ isOwner: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const appRef = useRef<InstalledDriveBackup | null>(null);

  const getApp = useCallback(async (): Promise<InstalledDriveBackup> => {
    appRef.current ??= await getInstalledDriveBackup();
    return appRef.current;
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const app = await getApp();
      const [connectionValue, schedulesValue, jobsValue, historyValue, ownerStatusValue] = await Promise.all([
        Promise.resolve(app.connection()),
        Promise.resolve(app.schedules()),
        Promise.resolve(app.jobs()),
        app.listHistory().catch(() => [] as CloudHistoryItem[]),
        app.ownerStatus().catch(() => ({ isOwner: false }) as DriveOwnerStatus),
      ]);
      setConnection(connectionValue);
      setSchedules(schedulesValue);
      setJobs(jobsValue);
      setHistory(historyValue);
      setOwnerStatus(ownerStatusValue);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Drive backup status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [getApp]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(async (label: string, task: () => Promise<void>): Promise<void> => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Drive backup action failed.');
    } finally {
      setBusy(null);
      await refresh();
    }
  }, [refresh]);

  const connect = useCallback(async () => {
    const app = await getApp();
    await run('connect', async () => {
      const outcome: DriveConnectOutcome = await app.connect();
      if (outcome.status !== 'connected') setError('Google account selection was cancelled.');
    });
  }, [getApp, run]);

  const reconnect = useCallback(async () => {
    const app = await getApp();
    await run('reconnect', async () => { await app.reconnect(); });
  }, [getApp, run]);

  const disconnect = useCallback(async () => {
    const app = await getApp();
    await run('disconnect', async () => { await app.disconnect(); });
  }, [getApp, run]);

  const resumeSchedules = useCallback(async () => {
    const app = await getApp();
    await run('resume', async () => { await app.resumeSchedules(); });
  }, [getApp, run]);

  const enableSchedule = useCallback(async (input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }) => {
    const app = await getApp();
    let outcome: EnableScheduleOutcome = { kind: 'enabled' };
    await run(`enable-${input.category}`, async () => { outcome = await app.enableSchedule(input); });
    return outcome;
  }, [getApp, run]);

  const takeOverAndEnable = useCallback(async (input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }) => {
    const app = await getApp();
    let outcome: EnableScheduleOutcome = { kind: 'enabled' };
    await run(`takeover-${input.category}`, async () => { outcome = await app.takeOverAndEnable(input); });
    return outcome;
  }, [getApp, run]);

  const setNetworkPolicy = useCallback((category: DriveCategory, networkPolicy: DriveNetworkPolicy) => {
    void (async () => {
      const app = await getApp();
      app.setNetworkPolicy(category, networkPolicy);
      await refresh();
    })();
  }, [getApp, refresh]);

  const runManual = useCallback(async (category: DriveCategory, options?: { allowCellular?: boolean }) => {
    const app = await getApp();
    let outcome: ManualRunOutcome = { kind: 'network_policy' };
    await run(`backup-${category}`, async () => { outcome = await app.runManual(category, options); });
    return outcome;
  }, [getApp, run]);

  const runBackupAll = useCallback(async () => {
    const app = await getApp();
    let result: BackupAllResult | null = null;
    await run('backup-all', async () => { result = await app.runBackupAll('manual'); });
    return result;
  }, [getApp, run]);

  const runNotificationRetry = useCallback(async (category: DriveCategory) => {
    const app = await getApp();
    let outcome: ManualRunOutcome = { kind: 'network_policy' };
    await run(`retry-${category}`, async () => { outcome = await app.runNotificationRetry(category); });
    return outcome;
  }, [getApp, run]);

  const deleteSnapshot = useCallback(async (category: DriveCategory, remoteFileId: string) => {
    const app = await getApp();
    await run(`delete-${category}`, async () => { await app.deleteSnapshot(category, remoteFileId); });
  }, [getApp, run]);

  const estimate = useCallback(async (category: DriveCategory) => {
    const app = await getApp();
    return app.estimate(category);
  }, [getApp]);

  const prepareDataRestore = useCallback(async (remoteFileId: string) => {
    const app = await getApp();
    setBusy('preparing-restore');
    try {
      return await app.prepareDataRestore(remoteFileId);
    } finally {
      setBusy(null);
    }
  }, [getApp]);

  const applyPreparedDataRestore = useCallback(async (prepared: DataRestorePrepared) => {
    const app = await getApp();
    setBusy('restoring-data');
    try {
      return await app.applyPreparedDataRestore(prepared);
    } finally {
      setBusy(null);
      await refresh();
    }
  }, [getApp, refresh]);

  const prepareMediaRestore = useCallback(async (remoteFileId: string) => {
    const app = await getApp();
    setBusy('preparing-media-restore');
    try {
      return await app.prepareMediaRestore(remoteFileId);
    } finally {
      setBusy(null);
    }
  }, [getApp]);

  const applyPreparedMediaRestore = useCallback(async (prepared: MediaRestorePrepared) => {
    const app = await getApp();
    setBusy('restoring-media');
    try {
      return await app.applyPreparedMediaRestore(prepared);
    } finally {
      setBusy(null);
      await refresh();
    }
  }, [getApp, refresh]);

  const releaseRestoreStaging = useCallback((path: string) => {
    void (async () => {
      const app = await getApp();
      app.releaseRestoreStaging(path);
    })();
  }, [getApp]);

  const recommendMedia = useCallback((historyItems: CloudHistoryItem[], selectedData: CloudHistoryItem): MediaRecommendation => {
    return recommendMediaSnapshot(historyItems, selectedData);
  }, []);

  return {
    loading,
    connection,
    schedules,
    jobs,
    history,
    ownerStatus,
    busy,
    error,
    refresh,
    connect,
    reconnect,
    disconnect,
    resumeSchedules,
    enableSchedule,
    takeOverAndEnable,
    setNetworkPolicy,
    runManual,
    runBackupAll,
    runNotificationRetry,
    deleteSnapshot,
    estimate,
    prepareDataRestore,
    applyPreparedDataRestore,
    prepareMediaRestore,
    applyPreparedMediaRestore,
    releaseRestoreStaging,
    recommendMedia,
  };
}
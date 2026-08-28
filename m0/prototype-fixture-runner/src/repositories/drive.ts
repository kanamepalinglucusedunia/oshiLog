import type { SqliteLike } from '@/db/types';
import {
  driveBackupJobSchema,
  driveConnectionSchema,
  driveJobStateSchema,
  driveScheduleSchema,
  driveUploadSessionSchema,
  type DriveBackupJob,
  type DriveCategory,
  type DriveConnection,
  type DriveJobState,
  type DriveSchedule,
  type DriveTrigger,
  type DriveUploadSession,
} from '@/drive/contracts';

const nullable = <T>(value: T | null | undefined): T | null => value ?? null;

const LEGAL_TRANSITIONS: Record<DriveJobState, readonly DriveJobState[]> = {
  queued: ['preparing', 'failed', 'cancelled'],
  preparing: ['uploading', 'no_change', 'failed', 'cancelled'],
  uploading: ['verifying', 'failed', 'cancelled'],
  verifying: ['committed', 'partial', 'failed', 'cancelled'],
  committed: [], no_change: [], partial: [], failed: [], cancelled: [],
};

function connectionFromRow(row: Record<string, unknown>): DriveConnection {
  return driveConnectionSchema.parse({
    id: row.id, accountSubject: row.account_subject, accountEmail: row.account_email,
    accountDisplayName: row.account_display_name, deviceId: row.device_id, deviceLabel: row.device_label,
    connectionState: row.connection_state, schedulesPaused: row.schedules_paused === 1,
    pauseReason: row.pause_reason, ownerLastCheckedAt: row.owner_last_checked_at,
    connectedAt: row.connected_at, disconnectedAt: row.disconnected_at, updatedAt: row.updated_at,
  });
}

function scheduleFromRow(row: Record<string, unknown>): DriveSchedule {
  return driveScheduleSchema.parse({
    category: row.category, frequency: row.frequency, networkPolicy: row.network_policy,
    enabledAt: row.enabled_at, nextDueAt: row.next_due_at, lastCheckedAt: row.last_checked_at,
    lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at,
    lastFingerprint: row.last_fingerprint, lastResult: row.last_result,
    pausedReason: row.paused_reason, createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

function jobFromRow(row: Record<string, unknown>): DriveBackupJob {
  return driveBackupJobSchema.parse({
    id: row.id, batchId: row.batch_id, category: row.category, trigger: row.trigger, state: row.state,
    snapshotId: row.snapshot_id, remoteFileId: row.remote_file_id, deviceId: row.device_id,
    contentFingerprint: row.content_fingerprint, bytesTotal: row.bytes_total,
    bytesUploaded: row.bytes_uploaded, itemCount: row.item_count, errorCode: row.error_code,
    errorDetailSafe: row.error_detail_safe, cleanupPending: row.cleanup_pending === 1,
    createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at,
  });
}

function sessionFromRow(row: Record<string, unknown>): DriveUploadSession {
  return driveUploadSessionSchema.parse({
    id: row.id, jobId: row.job_id, artifactKey: row.artifact_key,
    localStagingPath: row.local_staging_path, sessionUriSecretKey: row.session_uri_encrypted,
    uploadedOffset: row.uploaded_offset, totalBytes: row.total_bytes,
    expiresAt: row.expires_at, updatedAt: row.updated_at,
  });
}

export function createDriveRepo(db: SqliteLike, now: () => string) {
  const getConnection = (): DriveConnection | null => {
    const row = db.getFirstSync<Record<string, unknown>>(`SELECT * FROM drive_connection WHERE id = 'primary'`);
    return row ? connectionFromRow(row) : null;
  };

  const getJob = (id: string): DriveBackupJob | null => {
    const row = db.getFirstSync<Record<string, unknown>>(`SELECT * FROM drive_backup_job WHERE id = ?`, id);
    return row ? jobFromRow(row) : null;
  };

  const getUploadSession = (id: string): DriveUploadSession | null => {
    const row = db.getFirstSync<Record<string, unknown>>(`SELECT * FROM drive_upload_session WHERE id = ?`, id);
    return row ? sessionFromRow(row) : null;
  };

  type JobPatch = Partial<Pick<DriveBackupJob,
    'snapshotId' | 'remoteFileId' | 'contentFingerprint' | 'bytesTotal' | 'bytesUploaded' |
    'itemCount' | 'errorCode' | 'errorDetailSafe' | 'cleanupPending'>>;

  const writeJobPatch = (id: string, patch: JobPatch): DriveBackupJob => {
    const current = getJob(id);
    if (!current) throw new Error('Drive backup job not found');
    const value = driveBackupJobSchema.parse({ ...current, ...patch });
    db.runSync(
      `UPDATE drive_backup_job SET snapshot_id=?, remote_file_id=?, content_fingerprint=?, bytes_total=?,
        bytes_uploaded=?, item_count=?, error_code=?, error_detail_safe=?, cleanup_pending=? WHERE id=?`,
      nullable(value.snapshotId), nullable(value.remoteFileId), nullable(value.contentFingerprint),
      nullable(value.bytesTotal), nullable(value.bytesUploaded), nullable(value.itemCount), nullable(value.errorCode),
      nullable(value.errorDetailSafe), value.cleanupPending ? 1 : 0, id,
    );
    return getJob(id)!;
  };

  return {
    getConnection,
    saveConnection(input: DriveConnection): DriveConnection {
      const value = driveConnectionSchema.parse(input);
      db.runSync(
        `INSERT INTO drive_connection (id, account_subject, account_email, account_display_name, device_id, device_label,
          connection_state, schedules_paused, pause_reason, owner_last_checked_at, connected_at, disconnected_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET account_subject=excluded.account_subject, account_email=excluded.account_email,
          account_display_name=excluded.account_display_name, device_id=excluded.device_id, device_label=excluded.device_label,
          connection_state=excluded.connection_state, schedules_paused=excluded.schedules_paused,
          pause_reason=excluded.pause_reason, owner_last_checked_at=excluded.owner_last_checked_at,
          connected_at=excluded.connected_at, disconnected_at=excluded.disconnected_at, updated_at=excluded.updated_at`,
        value.id, nullable(value.accountSubject), nullable(value.accountEmail), nullable(value.accountDisplayName),
        value.deviceId, value.deviceLabel, value.connectionState, value.schedulesPaused ? 1 : 0,
        nullable(value.pauseReason), nullable(value.ownerLastCheckedAt), nullable(value.connectedAt),
        nullable(value.disconnectedAt), value.updatedAt,
      );
      return getConnection()!;
    },
    listSchedules(): DriveSchedule[] {
      return db.getAllSync<Record<string, unknown>>(`SELECT * FROM drive_backup_schedule ORDER BY category`)
        .map(scheduleFromRow);
    },
    updateSchedule(input: Pick<DriveSchedule, 'category' | 'frequency' | 'networkPolicy'> & Partial<DriveSchedule>): DriveSchedule {
      const row = db.getFirstSync<Record<string, unknown>>(`SELECT * FROM drive_backup_schedule WHERE category = ?`, input.category);
      if (!row) throw new Error('Drive schedule not found');
      const current = scheduleFromRow(row);
      const value = driveScheduleSchema.parse({ ...current, ...input, updatedAt: now() });
      db.runSync(
        `UPDATE drive_backup_schedule SET frequency=?, network_policy=?, enabled_at=?, next_due_at=?, last_checked_at=?,
          last_attempt_at=?, last_success_at=?, last_fingerprint=?, last_result=?, paused_reason=?, updated_at=? WHERE category=?`,
        value.frequency, value.networkPolicy, nullable(value.enabledAt), nullable(value.nextDueAt),
        nullable(value.lastCheckedAt), nullable(value.lastAttemptAt), nullable(value.lastSuccessAt),
        nullable(value.lastFingerprint), nullable(value.lastResult), nullable(value.pausedReason), value.updatedAt, value.category,
      );
      return scheduleFromRow(db.getFirstSync<Record<string, unknown>>(`SELECT * FROM drive_backup_schedule WHERE category = ?`, value.category)!);
    },
    getJob,
    listJobs(category?: DriveCategory): DriveBackupJob[] {
      const rows = category
        ? db.getAllSync<Record<string, unknown>>(
          `SELECT * FROM drive_backup_job WHERE category = ? ORDER BY created_at DESC, id DESC`, category,
        )
        : db.getAllSync<Record<string, unknown>>(
          `SELECT * FROM drive_backup_job ORDER BY created_at DESC, id DESC`,
        );
      return rows.map(jobFromRow);
    },
    findActiveJob(category: DriveCategory): DriveBackupJob | null {
      const row = db.getFirstSync<Record<string, unknown>>(
        `SELECT * FROM drive_backup_job WHERE category = ? AND state IN ('queued','preparing','uploading','verifying')
         ORDER BY created_at DESC LIMIT 1`,
        category,
      );
      return row ? jobFromRow(row) : null;
    },
    createJob(
      input: { category: DriveCategory; trigger: DriveTrigger; deviceId: string; batchId?: string },
      createId: () => string,
    ): DriveBackupJob {
      const value = driveBackupJobSchema.parse({
        id: createId(), batchId: input.batchId, category: input.category, trigger: input.trigger,
        state: 'queued', deviceId: input.deviceId, cleanupPending: false, createdAt: now(),
      });
      db.runSync(
        `INSERT INTO drive_backup_job (id, batch_id, category, trigger, state, device_id, cleanup_pending, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        value.id, nullable(value.batchId), value.category, value.trigger, value.state, value.deviceId, value.createdAt,
      );
      return getJob(value.id)!;
    },
    transitionJob(id: string, expected: DriveJobState, next: DriveJobState, patch: JobPatch = {}): boolean {
      driveJobStateSchema.parse(expected);
      driveJobStateSchema.parse(next);
      if (!LEGAL_TRANSITIONS[expected].includes(next)) throw new Error(`Invalid Drive job transition ${expected} -> ${next}`);
      let changed = false;
      db.withTransactionSync(() => {
        const current = getJob(id);
        if (!current || current.state !== expected) return;
        const startedAt = next === 'preparing' ? now() : current.startedAt;
        const completedAt = ['committed', 'no_change', 'partial', 'failed', 'cancelled'].includes(next) ? now() : current.completedAt;
        const value = driveBackupJobSchema.parse({ ...current, ...patch, state: next, startedAt, completedAt });
        db.runSync(`UPDATE drive_backup_job SET state=?, started_at=?, completed_at=? WHERE id=? AND state=?`,
          value.state, nullable(value.startedAt), nullable(value.completedAt), id, expected);
        writeJobPatch(id, patch);
        changed = true;
      });
      return changed;
    },
    patchJob(id: string, patch: JobPatch): DriveBackupJob {
      return writeJobPatch(id, patch);
    },
    saveUploadSession(input: DriveUploadSession): DriveUploadSession {
      const value = driveUploadSessionSchema.parse(input);
      db.runSync(
        `INSERT INTO drive_upload_session (id, job_id, artifact_key, local_staging_path, session_uri_encrypted,
         uploaded_offset, total_bytes, expires_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET job_id=excluded.job_id, artifact_key=excluded.artifact_key, local_staging_path=excluded.local_staging_path,
          session_uri_encrypted=excluded.session_uri_encrypted, uploaded_offset=excluded.uploaded_offset,
          total_bytes=excluded.total_bytes, expires_at=excluded.expires_at, updated_at=excluded.updated_at`,
        value.id, value.jobId, value.artifactKey, value.localStagingPath, value.sessionUriSecretKey,
        value.uploadedOffset, value.totalBytes, value.expiresAt, value.updatedAt,
      );
      return getUploadSession(value.id)!;
    },
    getUploadSession,
    listUploadSessions(): DriveUploadSession[] {
      return db.getAllSync<Record<string, unknown>>(`SELECT * FROM drive_upload_session ORDER BY updated_at`)
        .map(sessionFromRow);
    },
    deleteUploadSession(id: string): void {
      db.runSync(`DELETE FROM drive_upload_session WHERE id = ?`, id);
    },
    acquireLease(holderId: string, operation: string, durationMs: number): boolean {
      if (!holderId || !operation || !Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error('Invalid Drive lease');
      const currentTime = now();
      const expiresAt = new Date(Date.parse(currentTime) + durationMs).toISOString();
      let acquired = false;
      db.withTransactionSync(() => {
        const current = db.getFirstSync<{ holder_id: string; lease_expires_at: string }>(
          `SELECT holder_id, lease_expires_at FROM drive_operation_lock WHERE id = 'drive-backup'`,
        );
        if (current && current.lease_expires_at > currentTime) return;
        db.runSync(
          `INSERT INTO drive_operation_lock (id, holder_id, operation, lease_expires_at, updated_at)
           VALUES ('drive-backup', ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET holder_id=excluded.holder_id, operation=excluded.operation,
             lease_expires_at=excluded.lease_expires_at, updated_at=excluded.updated_at`,
          holderId, operation, expiresAt, currentTime,
        );
        acquired = true;
      });
      return acquired;
    },
    releaseLease(holderId: string): boolean {
      const current = db.getFirstSync<{ holder_id: string }>(`SELECT holder_id FROM drive_operation_lock WHERE id = 'drive-backup'`);
      if (!current || current.holder_id !== holderId) return false;
      db.runSync(`DELETE FROM drive_operation_lock WHERE id = 'drive-backup' AND holder_id = ?`, holderId);
      return true;
    },
  };
}

export type DriveRepo = ReturnType<typeof createDriveRepo>;

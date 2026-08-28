import { z } from 'zod';

const isoTimestampSchema = z.string().datetime({ offset: true });
const safeIdSchema = z.string().min(1).max(500);
const safeTextSchema = z.string().max(500);

export const driveCategorySchema = z.enum(['data', 'media']);
export const driveFrequencySchema = z.enum(['off', 'daily', 'weekly', 'monthly']);
export const driveNetworkPolicySchema = z.enum(['any', 'wifi_only']);
export const driveConnectionStateSchema = z.enum(['connected', 'disconnected', 'auth_required']);
export const drivePauseReasonSchema = z.enum(['disconnected', 'owner_changed', 'auth_required']);
export const driveTriggerSchema = z.enum(['manual', 'scheduled', 'startup_catchup', 'notification_retry']);
export const driveJobStateSchema = z.enum([
  'queued', 'preparing', 'uploading', 'verifying', 'committed',
  'no_change', 'partial', 'failed', 'cancelled',
]);
export const driveResultSchema = z.enum(['success', 'no_change', 'partial', 'failed', 'deferred']);
export const driveErrorCodeSchema = z.enum([
  'AUTH_REQUIRED', 'NOT_OWNER', 'OFFLINE', 'NETWORK_POLICY', 'QUOTA_EXCEEDED',
  'RATE_LIMITED', 'UPLOAD_SESSION_EXPIRED', 'LOCAL_FILE_MISSING',
  'CHECKSUM_MISMATCH', 'BACKUP_INVALID', 'LOCKED', 'CANCELLED', 'UNKNOWN',
]);

export const driveConnectionSchema = z.object({
  id: z.literal('primary'),
  accountSubject: safeTextSchema.nullish(),
  accountEmail: z.string().email().max(320).nullish(),
  accountDisplayName: safeTextSchema.nullish(),
  deviceId: safeIdSchema,
  deviceLabel: safeTextSchema.min(1),
  connectionState: driveConnectionStateSchema,
  schedulesPaused: z.boolean(),
  pauseReason: drivePauseReasonSchema.nullish(),
  ownerLastCheckedAt: isoTimestampSchema.nullish(),
  connectedAt: isoTimestampSchema.nullish(),
  disconnectedAt: isoTimestampSchema.nullish(),
  updatedAt: isoTimestampSchema,
}).strict();

export const driveScheduleSchema = z.object({
  category: driveCategorySchema,
  frequency: driveFrequencySchema,
  networkPolicy: driveNetworkPolicySchema,
  enabledAt: isoTimestampSchema.nullish(),
  nextDueAt: isoTimestampSchema.nullish(),
  lastCheckedAt: isoTimestampSchema.nullish(),
  lastAttemptAt: isoTimestampSchema.nullish(),
  lastSuccessAt: isoTimestampSchema.nullish(),
  lastFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
  lastResult: driveResultSchema.nullish(),
  pausedReason: safeTextSchema.nullish(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();

export const driveBackupJobSchema = z.object({
  id: safeIdSchema,
  batchId: safeIdSchema.nullish(),
  category: driveCategorySchema,
  trigger: driveTriggerSchema,
  state: driveJobStateSchema,
  snapshotId: safeIdSchema.nullish(),
  remoteFileId: safeIdSchema.nullish(),
  deviceId: safeIdSchema,
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
  bytesTotal: z.number().int().nonnegative().nullish(),
  bytesUploaded: z.number().int().nonnegative().nullish(),
  itemCount: z.number().int().nonnegative().nullish(),
  errorCode: driveErrorCodeSchema.nullish(),
  errorDetailSafe: safeTextSchema.nullish(),
  cleanupPending: z.boolean(),
  createdAt: isoTimestampSchema,
  startedAt: isoTimestampSchema.nullish(),
  completedAt: isoTimestampSchema.nullish(),
}).strict();

export const driveUploadSessionSchema = z.object({
  id: safeIdSchema,
  jobId: safeIdSchema,
  artifactKey: safeIdSchema,
  localStagingPath: z.string().min(1).max(2_000),
  sessionUriSecretKey: z.string().regex(/^drive-session:[A-Za-z0-9._:-]{1,200}$/),
  uploadedOffset: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  expiresAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict().refine((value) => value.uploadedOffset <= value.totalBytes, {
  message: 'uploadedOffset must not exceed totalBytes', path: ['uploadedOffset'],
});

export const driveAppPropertiesSchema = z.object({
  app: z.literal('oshilog'),
  formatVersion: z.literal('1'),
  artifactType: z.enum(['owner', 'data', 'media_manifest', 'media_blob']),
  category: driveCategorySchema.optional(),
  snapshotId: safeIdSchema.optional(),
  deviceId: safeIdSchema.optional(),
  deviceLabel: safeTextSchema.optional(),
  createdAt: isoTimestampSchema.optional(),
  appVersion: safeTextSchema.optional(),
  schemaVersion: z.string().regex(/^\d+$/).optional(),
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  byteSize: z.string().regex(/^\d+$/).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  commitState: z.enum(['staging', 'committed']).optional(),
}).strict();

export const driveFileSchema = z.object({
  id: safeIdSchema,
  name: z.string().min(1).max(500),
  size: z.string().regex(/^\d+$/).optional(),
  sha256Checksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  modifiedTime: isoTimestampSchema.optional(),
  appProperties: driveAppPropertiesSchema.optional(),
}).strict();

export const driveFileListSchema = z.object({
  files: z.array(driveFileSchema),
  nextPageToken: z.string().min(1).optional(),
}).strict();

export type DriveConnection = z.infer<typeof driveConnectionSchema>;
export type DriveSchedule = z.infer<typeof driveScheduleSchema>;
export type DriveBackupJob = z.infer<typeof driveBackupJobSchema>;
export type DriveUploadSession = z.infer<typeof driveUploadSessionSchema>;
export type DriveJobState = z.infer<typeof driveJobStateSchema>;
export type DriveCategory = z.infer<typeof driveCategorySchema>;
export type DriveTrigger = z.infer<typeof driveTriggerSchema>;
export type DriveErrorCode = z.infer<typeof driveErrorCodeSchema>;
export type DriveFrequency = z.infer<typeof driveFrequencySchema>;
export type DriveNetworkPolicy = z.infer<typeof driveNetworkPolicySchema>;
export type DriveResult = z.infer<typeof driveResultSchema>;
export type DriveConnectionState = z.infer<typeof driveConnectionStateSchema>;
export type DrivePauseReason = z.infer<typeof drivePauseReasonSchema>;

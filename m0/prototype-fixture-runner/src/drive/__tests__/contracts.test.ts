import {
  driveAppPropertiesSchema,
  driveBackupJobSchema,
  driveConnectionSchema,
  driveErrorCodeSchema,
  driveFileSchema,
  driveScheduleSchema,
  driveUploadSessionSchema,
} from '../contracts';

describe('Drive domain contracts', () => {
  it('accepts complete valid local domain values', () => {
    expect(driveConnectionSchema.parse({
      id: 'primary', deviceId: 'device-1', deviceLabel: 'Pixel',
      connectionState: 'connected', schedulesPaused: false,
      accountSubject: 'subject', accountEmail: 'owner@example.test',
      updatedAt: '2026-08-16T00:00:00.000Z',
    }).connectionState).toBe('connected');
    expect(driveScheduleSchema.parse({
      category: 'data', frequency: 'daily', networkPolicy: 'any',
      createdAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-16T00:00:00.000Z',
    }).category).toBe('data');
    expect(driveBackupJobSchema.parse({
      id: 'job', category: 'media', trigger: 'manual', state: 'queued',
      deviceId: 'device-1', cleanupPending: false, createdAt: '2026-08-16T00:00:00.000Z',
    }).state).toBe('queued');
    expect(driveUploadSessionSchema.parse({
      id: 'session', jobId: 'job', artifactKey: 'blob-hash', localStagingPath: 'file:///safe',
      sessionUriSecretKey: 'drive-session:session', uploadedOffset: 0, totalBytes: 10,
      expiresAt: '2026-08-23T00:00:00.000Z', updatedAt: '2026-08-16T00:00:00.000Z',
    }).uploadedOffset).toBe(0);
  });

  it('rejects invalid enums, unsafe values, and malformed remote metadata', () => {
    expect(driveScheduleSchema.safeParse({ category: 'data', frequency: 'hourly', networkPolicy: 'any' }).success).toBe(false);
    expect(driveBackupJobSchema.safeParse({ id: 'job', category: 'media', trigger: 'auto', state: 'queued' }).success).toBe(false);
    expect(driveUploadSessionSchema.safeParse({ uploadedOffset: -1 }).success).toBe(false);
    expect(driveErrorCodeSchema.safeParse('TOKEN_VALUE').success).toBe(false);
    expect(driveFileSchema.safeParse({ id: '', name: 'x' }).success).toBe(false);
  });

  it('accepts only appDataFolder artifact properties', () => {
    expect(driveAppPropertiesSchema.safeParse({
      app: 'oshilog', formatVersion: '1', artifactType: 'data', category: 'data',
      snapshotId: 'snapshot', deviceId: 'device', sha256: 'a'.repeat(64), commitState: 'committed',
    }).success).toBe(true);
    expect(driveAppPropertiesSchema.safeParse({ app: 'other', formatVersion: '1', artifactType: 'data' }).success).toBe(false);
  });
});

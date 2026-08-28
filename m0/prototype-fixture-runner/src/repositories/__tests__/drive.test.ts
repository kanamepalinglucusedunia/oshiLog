import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createDriveRepo } from '@/repositories/drive';

describe('Drive local repository', () => {
  const start = '2026-08-16T00:00:00.000Z';

  it('stores connection metadata and validates schedule updates', () => {
    const repo = createDriveRepo(createNodeTestDb(), () => start);
    repo.saveConnection({
      id: 'primary', accountSubject: 'sub', accountEmail: 'owner@example.test',
      deviceId: 'device-1', deviceLabel: 'Pixel', connectionState: 'connected',
      schedulesPaused: false, connectedAt: start, updatedAt: start,
    });
    expect(repo.getConnection()).toMatchObject({ accountEmail: 'owner@example.test', connectionState: 'connected' });
    expect(repo.listSchedules()).toHaveLength(2);
    expect(repo.updateSchedule({ category: 'data', frequency: 'daily', networkPolicy: 'wifi_only' }))
      .toMatchObject({ frequency: 'daily', networkPolicy: 'wifi_only' });
    expect(() => repo.updateSchedule({ category: 'data', frequency: 'hourly' as never, networkPolicy: 'any' }))
      .toThrow(/invalid/i);
  });

  it('creates jobs, enforces compare-and-update transitions, and persists session references', () => {
    const repo = createDriveRepo(createNodeTestDb(), () => start);
    const job = repo.createJob({ category: 'data', trigger: 'manual', deviceId: 'device-1' }, () => 'job-1');
    expect(job).toMatchObject({ id: 'job-1', state: 'queued' });
    expect(repo.listJobs('data')).toEqual([job]);
    expect(repo.transitionJob('job-1', 'queued', 'preparing')).toBe(true);
    expect(repo.transitionJob('job-1', 'queued', 'preparing')).toBe(false);
    expect(() => repo.transitionJob('job-1', 'preparing', 'committed')).toThrow(/transition/i);

    repo.saveUploadSession({
      id: 'session-1', jobId: 'job-1', artifactKey: 'data-job-1', localStagingPath: 'file:///stage.json',
      sessionUriSecretKey: 'drive-session:session-1', uploadedOffset: 0, totalBytes: 42,
      expiresAt: '2026-08-23T00:00:00.000Z', updatedAt: start,
    });
    expect(repo.getUploadSession('session-1')).toMatchObject({ sessionUriSecretKey: 'drive-session:session-1' });
    expect(JSON.stringify(repo.getUploadSession('session-1'))).not.toContain('https://upload');
    repo.deleteUploadSession('session-1');
    expect(repo.getUploadSession('session-1')).toBeNull();
  });

  it('grants one operation lease, rejects contention, replaces expiry, and checks holder on release', () => {
    let currentTime = start;
    const repo = createDriveRepo(createNodeTestDb(), () => currentTime);
    expect(repo.acquireLease('first', 'data_backup', 60_000)).toBe(true);
    expect(repo.acquireLease('second', 'data_backup', 60_000)).toBe(false);
    expect(repo.releaseLease('second')).toBe(false);
    currentTime = '2026-08-16T00:01:00.001Z';
    expect(repo.acquireLease('second', 'data_backup', 60_000)).toBe(true);
    expect(repo.releaseLease('second')).toBe(true);
  });
});

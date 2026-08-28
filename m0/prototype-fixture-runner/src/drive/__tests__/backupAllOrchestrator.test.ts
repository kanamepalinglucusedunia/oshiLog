import { createBackupAllOrchestrator } from '@/drive/backupAllOrchestrator';
import type { DriveBackupJob } from '@/drive/contracts';

function job(category: 'data' | 'media', state: DriveBackupJob['state'], id: string): DriveBackupJob {
  return {
    id, category, trigger: 'manual', state, deviceId: 'device-1', cleanupPending: false,
    createdAt: '2026-08-16T04:00:00.000Z',
  };
}

describe('Backup All orchestration', () => {
  it('keeps Data success when Media fails and retries Media only', async () => {
    const data = { run: jest.fn(async () => job('data', 'committed', 'data-job')) };
    const media = {
      run: jest.fn()
        .mockResolvedValueOnce(job('media', 'failed', 'media-failed'))
        .mockResolvedValueOnce(job('media', 'committed', 'media-retry')),
    };
    const all = createBackupAllOrchestrator({ data, media, createId: () => 'batch-1' });

    const result = await all.run({ trigger: 'manual' });

    expect(result).toMatchObject({ batchId: 'batch-1', data: { state: 'committed' }, media: { state: 'failed' } });
    expect(data.run).toHaveBeenCalledWith({ trigger: 'manual', batchId: 'batch-1', signal: undefined });
    expect(media.run).toHaveBeenCalledWith({ trigger: 'manual', batchId: 'batch-1', signal: undefined });

    await expect(all.retryMedia(result)).resolves.toMatchObject({ state: 'committed', category: 'media' });
    expect(data.run).toHaveBeenCalledTimes(1);
    expect(media.run).toHaveBeenLastCalledWith({
      trigger: 'notification_retry', batchId: 'batch-1', retryJobId: 'media-failed', signal: undefined,
    });
  });
});

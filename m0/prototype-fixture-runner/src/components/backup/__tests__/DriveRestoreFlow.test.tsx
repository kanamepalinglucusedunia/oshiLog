import { fireEvent, render, screen } from '@testing-library/react-native';
import { DriveRestoreFlow } from '../DriveRestoreFlow';
import type { CloudHistoryItem } from '@/drive/cloudHistory';
import type { DataRestorePrepared } from '@/drive/driveRestore';

const NOW = '2026-08-17T09:00:00.000Z';

const dataItem: CloudHistoryItem = {
  category: 'data',
  remoteFileId: 'f1',
  snapshotId: 'snap-1',
  deviceId: 'device-1',
  deviceLabel: 'Pixel',
  createdAt: '2026-08-10T09:00:00.000Z',
  byteSize: 100,
  complete: true,
  status: 'committed',
  cleanupPending: false,
};

const mediaItem: CloudHistoryItem = {
  category: 'media',
  remoteFileId: 'f2',
  snapshotId: 'snap-2',
  deviceId: 'device-1',
  deviceLabel: 'Pixel',
  createdAt: '2026-08-09T09:00:00.000Z',
  byteSize: 200,
  complete: true,
  status: 'committed',
  cleanupPending: false,
};

const prepared: DataRestorePrepared = {
  kind: 'data',
  remoteFileId: 'f1',
  snapshotId: 'snap-1',
  deviceLabel: 'Pixel',
  createdAt: NOW,
  manifest: { records: {} } as DataRestorePrepared['manifest'],
  stagingPath: 'file:///cache/oshilog/drive-restore/drive-restore-data-f1.json',
  preview: { added: 2, updated: 1, deleted: 0, skipped: 3, missingMedia: 0 },
};

function props(overrides: Partial<Parameters<typeof DriveRestoreFlow>[0]> = {}) {
  return {
    visible: true,
    item: dataItem,
    prepared,
    prepareError: null,
    recommendation: { media: mediaItem, sameDevice: true, newerThanData: false },
    onClose: jest.fn(),
    busy: null,
    onApplyData: jest.fn(async () => ({ added: 2, updated: 1, deleted: 0, skipped: 3, missingMedia: 0, safetySnapshotPath: 'file:///safety.json' })),
    onPrepareMedia: jest.fn(async () => ({ kind: 'media' as const, remoteFileId: 'f2', snapshotId: 'snap-2', deviceLabel: 'Pixel', createdAt: NOW, entries: [], availableCount: 0, missingCount: 0 })),
    onApplyMedia: jest.fn(async () => ({ restored: 1, skipped: 0, missingRemote: 0, failed: 0 })),
    onReleaseStaging: jest.fn(),
    ...overrides,
  };
}

describe('DriveRestoreFlow', () => {
  it('shows the verified preview and the recommended Media snapshot', async () => {
    await render(<DriveRestoreFlow {...props()} />);
    expect(screen.getByText('Data snapshot · Aug 17, 2026 · Pixel')).toBeTruthy();
    expect(screen.getByText('Records added')).toBeTruthy();
    expect(screen.getByText(/Recommended: Aug 9, 2026/)).toBeTruthy();
    expect(screen.getByText('Restore now')).toBeTruthy();
  });

  it('warns when the recommended Media snapshot is from another device or newer', async () => {
    await render(<DriveRestoreFlow {...props({ recommendation: { media: mediaItem, sameDevice: false, newerThanData: true } })} />);
    expect(screen.getByText(/was created on another device/)).toBeTruthy();
    expect(screen.getByText(/is newer than the selected Data snapshot/)).toBeTruthy();
  });

  it('allows a Data-only restore when no Media recommendation exists', async () => {
    const onApplyData = jest.fn(async () => ({ added: 2, updated: 1, deleted: 0, skipped: 3, missingMedia: 0, safetySnapshotPath: 'file:///safety.json' }));
    const onApplyMedia = jest.fn(async () => ({ restored: 1, skipped: 0, missingRemote: 0, failed: 0 }));
    await render(<DriveRestoreFlow {...props({ recommendation: null, onApplyData, onApplyMedia })} />);
    expect(screen.getByText(/restoring Data only/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Restore now'));
    expect(await screen.findByText('Data restore result')).toBeTruthy();
    expect(onApplyData).toHaveBeenCalledTimes(1);
    expect(onApplyMedia).not.toHaveBeenCalled();
  });

  it('applies Data and the included Media snapshot and reports both results', async () => {
    const onApplyMedia = jest.fn(async () => ({ restored: 1, skipped: 0, missingRemote: 0, failed: 0 }));
    await render(<DriveRestoreFlow {...props({ onApplyMedia })} />);
    await fireEvent.press(screen.getByText('Restore now'));
    expect(await screen.findByText('Media restore result')).toBeTruthy();
    expect(screen.getByText(/Restored 1 · skipped 0 · missing remotely 0 · failed 0/)).toBeTruthy();
    expect(onApplyMedia).toHaveBeenCalledTimes(1);
  });

  it('releases staging on close', async () => {
    const onReleaseStaging = jest.fn();
    await render(<DriveRestoreFlow {...props({ onReleaseStaging })} />);
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onReleaseStaging).toHaveBeenCalledWith(prepared.stagingPath);
  });

  it('shows a safe error instead of a restore when preparation failed', async () => {
    await render(<DriveRestoreFlow {...props({ prepared: null, prepareError: 'The snapshot could not be verified.' })} />);
    expect(screen.getByText('The snapshot could not be verified.')).toBeTruthy();
    expect(screen.queryByText('Restore now')).toBeNull();
  });
});
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DriveBackupHistory } from '../DriveBackupHistory';
import type { CloudHistoryItem } from '@/drive/cloudHistory';

function item(overrides: Partial<CloudHistoryItem> = {}): CloudHistoryItem {
  return {
    category: 'data',
    remoteFileId: 'f1',
    snapshotId: 'snap-1',
    deviceId: 'device-1',
    deviceLabel: 'Pixel',
    createdAt: '2026-08-17T09:00:00.000Z',
    byteSize: 2048,
    complete: true,
    status: 'committed',
    cleanupPending: false,
    ...overrides,
  };
}

function props(overrides: Partial<Parameters<typeof DriveBackupHistory>[0]> = {}) {
  return {
    history: [item()],
    busy: null,
    onRefresh: jest.fn(async () => undefined),
    onRestoreData: jest.fn(),
    onRestoreMedia: jest.fn(),
    onDelete: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('DriveBackupHistory', () => {
  it('shows the empty state when there is no cloud history', async () => {
    await render(<DriveBackupHistory {...props({ history: [] })} />);
    expect(screen.getByText('No cloud backups yet')).toBeTruthy();
  });

  it('lists committed snapshots with a Complete badge and size', async () => {
    await render(<DriveBackupHistory {...props()} />);
    expect(screen.getByText('Data')).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
  });

  it('marks partial Media snapshots with a missing count', async () => {
    await render(<DriveBackupHistory {...props({ history: [item({
      category: 'media', complete: false, status: 'partial', missingCount: 2,
    })] })} />);
    expect(screen.getByText('Partial')).toBeTruthy();
    expect(screen.getByText(/2 missing/)).toBeTruthy();
  });

  it('surfaces in-progress jobs and failed states', async () => {
    await render(<DriveBackupHistory {...props({ history: [
      item({ jobState: 'uploading', jobId: 'j1', status: 'committed' }),
      item({ remoteFileId: 'f2', snapshotId: 'snap-2', status: 'failed', jobState: 'failed', jobId: 'j2' }),
    ] })} />);
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('requests restore for a Data snapshot and requires confirmation before delete', async () => {
    const onRestoreData = jest.fn();
    const onDelete = jest.fn(async () => undefined);
    await render(<DriveBackupHistory {...props({ onRestoreData, onDelete })} />);

    await fireEvent.press(screen.getByLabelText(/Restore Data snapshot/));
    expect(onRestoreData).toHaveBeenCalledWith(expect.objectContaining({ remoteFileId: 'f1' }));

    // Tapping delete only opens the native confirmation; the destructive action must not fire directly.
    await fireEvent.press(screen.getByLabelText(/Delete cloud backup/));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows the cleanup warning on committed snapshots with pending cleanup', async () => {
    await render(<DriveBackupHistory {...props({ history: [item({ cleanupPending: true })] })} />);
    expect(await screen.findByText('Cleanup pending')).toBeTruthy();
  });
});
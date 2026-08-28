import { fireEvent, render, screen } from '@testing-library/react-native';
import { DriveManualActions } from '../DriveManualActions';
import type { DriveBackupJob } from '@/drive/contracts';
import { driveBackupJobSchema } from '@/drive/contracts';

function job(category: 'data' | 'media', state: DriveBackupJob['state']): DriveBackupJob {
  return driveBackupJobSchema.parse({
    id: `job-${category}`, category, trigger: 'manual', state,
    deviceId: 'device-1', cleanupPending: false, createdAt: '2026-08-17T09:00:00.000Z',
  });
}

function props(overrides: Partial<Parameters<typeof DriveManualActions>[0]> = {}) {
  return {
    connected: true,
    schedules: [
      { category: 'data' as const, networkPolicy: 'any' as const },
      { category: 'media' as const, networkPolicy: 'wifi_only' as const },
    ],
    ownerStatus: { isOwner: true },
    busy: null,
    onRunManual: jest.fn(async () => ({ kind: 'job' as const, job: job('data', 'committed') })),
    onBackupAll: jest.fn(async () => undefined),
    onEstimate: jest.fn(async () => ({ bytes: 5_242_880, itemCount: 3 })),
    ...overrides,
  };
}

describe('DriveManualActions', () => {
  it('renders all manual commands', async () => {
    await render(<DriveManualActions {...props()} />);
    expect(screen.getByText('Backup Data now')).toBeTruthy();
    expect(screen.getByText('Backup Media now')).toBeTruthy();
    expect(screen.getByText('Backup All')).toBeTruthy();
  });

  it('disables manual commands while disconnected', async () => {
    await render(<DriveManualActions {...props({ connected: false })} />);
    expect(screen.getByText('Backup Data now').parent?.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('asks for a one-time cellular confirmation with the estimated size when wifi-only is unmet', async () => {
    const onRunManual = jest.fn(async () => ({ kind: 'network_policy' as const }));
    const onEstimate = jest.fn(async () => ({ bytes: 5_242_880, itemCount: 3 }));
    await render(<DriveManualActions {...props({ onRunManual, onEstimate })} />);

    await fireEvent.press(screen.getByText('Backup Media now'));

    expect(await screen.findByText('Use mobile data?')).toBeTruthy();
    expect(screen.getByText(/5\.0 MB/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Use mobile data once'));
    expect(onRunManual).toHaveBeenLastCalledWith('media', { allowCellular: true });
  });

  it('runs directly on an eligible network without a confirmation modal', async () => {
    const onRunManual = jest.fn(async () => ({ kind: 'job' as const, job: job('media', 'committed') }));
    await render(<DriveManualActions {...props({ onRunManual })} />);
    await fireEvent.press(screen.getByText('Backup Media now'));
    expect(onRunManual).toHaveBeenCalledWith('media', undefined);
    expect(screen.queryByText('Use mobile data?')).toBeNull();
  });

  it('runs Backup All through the shared batch command', async () => {
    const onBackupAll = jest.fn(async () => undefined);
    await render(<DriveManualActions {...props({ onBackupAll })} />);
    await fireEvent.press(screen.getByText('Backup All'));
    expect(onBackupAll).toHaveBeenCalledTimes(1);
  });
});
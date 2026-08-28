import { fireEvent, render, screen } from '@testing-library/react-native';
import { DriveScheduleCard } from '../DriveScheduleCard';
import type { DriveSchedule } from '@/drive/contracts';

const schedule: DriveSchedule = {
  category: 'data',
  frequency: 'off',
  networkPolicy: 'any',
  createdAt: '2026-08-17T09:00:00.000Z',
  updatedAt: '2026-08-17T09:00:00.000Z',
};

function props(overrides: Partial<Parameters<typeof DriveScheduleCard>[0]> = {}) {
  return {
    schedule,
    busy: null,
    disabled: false,
    onFrequency: jest.fn(async () => ({ kind: 'enabled' as const })),
    onNetworkPolicy: jest.fn(),
    onTakeOver: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('DriveScheduleCard', () => {
  it('shows the schedule category, frequency, and network policy chips', async () => {
    await render(<DriveScheduleCard {...props({ schedule: { ...schedule, frequency: 'daily', networkPolicy: 'wifi_only' } })} />);
    expect(screen.getByText('Data schedule')).toBeTruthy();
    expect(screen.getByText('Daily')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByText('Wi-Fi only')).toBeTruthy();
    expect(screen.getByText('Any network')).toBeTruthy();
  });

  it('sends the new frequency to the parent and does not show a takeover modal on success', async () => {
    const onFrequency = jest.fn(async () => ({ kind: 'enabled' as const }));
    await render(<DriveScheduleCard {...props({ onFrequency })} />);
    await fireEvent.press(screen.getByText('Weekly'));
    expect(onFrequency).toHaveBeenCalledWith({
      category: 'data', frequency: 'weekly', networkPolicy: 'any',
    });
    expect(screen.queryByText('Take over scheduled backups?')).toBeNull();
  });

  it('shows the takeover confirmation when another device owns the schedules', async () => {
    const onFrequency = jest.fn(async () => ({ kind: 'takeover_required' as const }));
    const onTakeOver = jest.fn(async () => undefined);
    await render(<DriveScheduleCard {...props({ onFrequency, onTakeOver })} />);
    await fireEvent.press(screen.getByText('Monthly'));
    expect(await screen.findByText('Take over scheduled backups?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Take over and enable'));
    expect(onTakeOver).toHaveBeenCalledWith({
      category: 'data', frequency: 'monthly', networkPolicy: 'any',
    });
  });

  it('updates the network policy independently of the frequency', async () => {
    const onNetworkPolicy = jest.fn();
    await render(<DriveScheduleCard {...props({ onNetworkPolicy })} />);
    await fireEvent.press(screen.getByText('Wi-Fi only'));
    expect(onNetworkPolicy).toHaveBeenCalledWith('wifi_only');
  });

  it('disables controls while a drive operation is running', async () => {
    const onFrequency = jest.fn(async () => ({ kind: 'enabled' as const }));
    await render(<DriveScheduleCard {...props({ busy: 'backup-data', onFrequency })} />);
    await fireEvent.press(screen.getByText('Daily'));
    expect(onFrequency).not.toHaveBeenCalled();
  });

  it('reports paused, deferred, and due state text', async () => {
    await render(<DriveScheduleCard {...props({
      schedule: {
        ...schedule,
        frequency: 'daily',
        pausedReason: 'owner_changed',
        lastResult: 'deferred',
        nextDueAt: '2026-08-18T09:00:00.000Z',
      },
    })} />);
    expect(screen.getByText(/another device owns scheduled backups/)).toBeTruthy();
    expect(screen.getByText(/Waiting for an eligible network/)).toBeTruthy();
    expect(screen.getByText(/Next due: Aug 18, 2026/)).toBeTruthy();
  });
});
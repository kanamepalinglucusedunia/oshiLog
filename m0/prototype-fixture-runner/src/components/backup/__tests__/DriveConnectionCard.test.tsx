import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { DriveConnectionCard } from '../DriveConnectionCard';
import type { DriveConnection } from '@/drive/contracts';

const connected: DriveConnection = {
  id: 'primary',
  accountSubject: 'subject-1',
  accountEmail: 'owner@example.test',
  accountDisplayName: 'Oshi',
  deviceId: 'device-1',
  deviceLabel: 'Pixel',
  connectionState: 'connected',
  schedulesPaused: false,
  pauseReason: null,
  connectedAt: '2026-08-17T09:00:00.000Z',
  updatedAt: '2026-08-17T09:00:00.000Z',
};

function props(overrides: Partial<Parameters<typeof DriveConnectionCard>[0]> = {}) {
  return {
    connection: connected,
    ownerStatus: { isOwner: true, ownerDeviceLabel: 'Pixel' },
    busy: null,
    onConnect: jest.fn(),
    onReconnect: jest.fn(),
    onDisconnect: jest.fn(),
    onResume: jest.fn(),
    ...overrides,
  };
}

describe('DriveConnectionCard', () => {
  it('offers to connect when no connection exists', async () => {
    await render(<DriveConnectionCard {...props({ connection: null })} />);
    expect(screen.getByText('Connect Google Drive')).toBeTruthy();
    expect(screen.queryByText('Disconnect')).toBeNull();
  });

  it('shows the connected account and a disconnect action', async () => {
    await render(<DriveConnectionCard {...props()} />);
    expect(screen.getByText('owner@example.test')).toBeTruthy();
    expect(screen.getByText('Disconnect')).toBeTruthy();
    expect(screen.queryByText('Connect Google Drive')).toBeNull();
  });

  it('reconnects when authorization is required and shows the paused state', async () => {
    await render(<DriveConnectionCard {...props({
      connection: { ...connected, connectionState: 'auth_required', schedulesPaused: true, pauseReason: 'auth_required' },
    })} />);
    expect(screen.getByText(/Google authorization was revoked/)).toBeTruthy();
    expect(screen.getByText('Reconnect Google Drive')).toBeTruthy();
  });

  it('shows non-owner status and a resume action when paused after takeover', async () => {
    await render(<DriveConnectionCard {...props({
      ownerStatus: { isOwner: false, ownerDeviceLabel: 'Tablet' },
      connection: { ...connected, schedulesPaused: true, pauseReason: 'owner_changed' },
    })} />);
    expect(screen.getByText(/Scheduled owner: Tablet/)).toBeTruthy();
    expect(screen.getByText(/another device took over/)).toBeTruthy();
    expect(screen.getByText('Resume schedules')).toBeTruthy();
  });

  it('forwards disconnect presses to the parent', async () => {
    const onDisconnect = jest.fn();
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DriveConnectionCard {...props({ onDisconnect })} />);
    await fireEvent.press(screen.getByText('Disconnect'));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
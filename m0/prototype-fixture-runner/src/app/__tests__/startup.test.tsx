import React from 'react';
import { render } from '@testing-library/react-native';
import { getDb } from '@/db';
import { useSettingsStore } from '@/stores/settingsStore';
import RootLayout from '../_layout';

jest.mock('expo-router', () => {
  const Stack = ({ children }: { children?: React.ReactNode }) => children;
  Stack.Screen = function MockStackScreen() { return null; };
  return { Stack, useRouter: () => ({ push: jest.fn() }) };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
}));

jest.mock('@/db', () => ({ getDb: jest.fn() }));
jest.mock('@/services/media', () => ({
  ensureAppDirs: jest.fn(),
  cleanupTombstonedMedia: jest.fn(),
}));
jest.mock('@/services/notificationsBridge', () => ({
  subscribeToNotificationResponses: jest.fn(() => jest.fn()),
}));

describe('application startup', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, countries: [], loaded: false, loadError: null });
    jest.clearAllMocks();
  });

  it('shows a recoverable screen when database initialization fails', async () => {
    (getDb as jest.Mock).mockImplementation(() => {
      throw new Error('migration failed');
    });

    const view = await render(<RootLayout />);

    expect(await view.findByText('OshiLog could not start')).toBeTruthy();
    expect(view.getByText('Retry')).toBeTruthy();
    expect(view.getByText('migration failed')).toBeTruthy();
  });
});

/* eslint-disable import/first -- import stays below hoist-sensitive Jest mock state */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.setTimeout(15000);

const mockRunInteractiveProbe = jest.fn(async () => ({
  accountMetadataPresent: true,
  fileCount: 1,
}));
const mockClearCachedToken = jest.fn(async () => undefined);
const mockTriggerWorker = jest.fn(async () => true);
const mockUnregisterWorker = jest.fn(async () => undefined);

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('../installedSpikeController', () => ({
  createInstalledGoogleDriveAuthSpikeController: () => ({
    runInteractiveProbe: mockRunInteractiveProbe,
    clearLastCachedAccessToken: mockClearCachedToken,
    triggerRegisteredBackgroundProbe: mockTriggerWorker,
  }),
}));
jest.mock('../backgroundTask', () => ({
  unregisterGoogleDriveAuthSpikeTask: mockUnregisterWorker,
}));
jest.mock('../evidenceStore', () => ({
  readAuthSpikeEvidence: () => [
    {
      adapter: 'nitro',
      phase: 'background',
      status: 'success',
      startedAt: '2026-08-16T01:00:00.000Z',
      completedAt: '2026-08-16T01:00:01.000Z',
      tokenAcquired: true,
      accountMetadataPresent: true,
      driveListSucceeded: true,
      fileCount: 1,
    },
  ],
}));

import { GoogleDriveAuthSpikeScreen } from '../GoogleDriveAuthSpikeScreen';

describe('Google Drive authorization spike screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('guides the operator through grant, token clear, and forced background execution', async () => {
    await render(<GoogleDriveAuthSpikeScreen />);

    await fireEvent.press(screen.getByLabelText('1. Grant access and list appDataFolder'));
    await waitFor(() =>
      expect(screen.getByText(/Interactive probe passed; account metadata returned/)).toBeTruthy(),
    );
    expect(screen.queryByText(/owner@example\.test/)).toBeNull();

    await fireEvent.press(screen.getByLabelText('2. Clear cached access token'));
    await waitFor(() =>
      expect(screen.getByText('Cached access token cleared.')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByLabelText('3. Register and trigger background worker'));
    await waitFor(() =>
      expect(screen.getByText('Expo background worker was triggered.')).toBeTruthy(),
    );

    expect(mockRunInteractiveProbe).toHaveBeenCalledTimes(1);
    expect(mockClearCachedToken).toHaveBeenCalledTimes(1);
    expect(mockTriggerWorker).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/background \| success \| token yes \| Drive yes/)).toBeTruthy();
  });
});

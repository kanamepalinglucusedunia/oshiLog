import { render, userEvent, waitFor } from '@testing-library/react-native';
import { MediaViewer } from '../MediaViewer';
import type { AlbumMediaRow } from '@/repositories/event';
import * as Sharing from 'expo-sharing/build/Sharing';

jest.mock('expo-image', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Image: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

jest.mock('expo-video', () => ({
  useVideoPlayer: jest.fn(() => ({ loop: false })),
  VideoView: () => null,
}));

jest.mock('expo-media-library', () => ({
  Asset: { create: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}), { virtual: true });

jest.mock('expo-sharing/build/Sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}), { virtual: true });

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    color: {
      background: '#FCFBFD',
      surface: '#FFFFFF',
      surfaceMuted: '#FAFAFA',
      text: '#1C1C1C',
      textMuted: '#666666',
      accent: '#7F6EB5',
      accentSurface: '#F2F1F8',
      accentSoft: '#CBC4E1',
      onAccent: '#FFFFFF',
      border: '#1C1C1C',
      borderLight: '#EBEBEB',
    },
    surface: {
      style: 'outline',
      borderWidth: 1,
      borderColor: '#1C1C1C',
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    radius: { sm: 8, md: 16, lg: 16, pill: 9999 },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));

const asset = {
  id: 'cheki-1',
  kind: 'cheki',
  contentHash: 'hash',
  mimeType: 'image/jpeg',
  fileSize: 1,
  width: 600,
  height: 800,
  durationMs: null,
  localPath: 'file:///document/oshilog/originals/cheki-1.jpg',
  thumbnailPath: null,
  instaxPreset: 'wide',
  schemaVersion: 1,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  deletedAt: null,
  source: 'cheki',
  entryId: 'entry-1',
  position: 1,
  idolNameSnapshot: 'Kohana Mona',
  groupNameSnapshot: 'AQA',
} as AlbumMediaRow;

describe('MediaViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  });

  it('renders a fullscreen header, edge-to-edge media, and historical metadata chips', async () => {
    const view = await render(<MediaViewer asset={asset} onClose={jest.fn()} />);

    expect(view.getByLabelText('Back from media viewer')).toBeTruthy();
    expect(view.getByText('8 August 2026')).toBeTruthy();
    expect(view.getByLabelText('Share media')).toBeTruthy();
    expect(view.getByText('Cheki')).toBeTruthy();
    expect(view.getByText('Wide')).toBeTruthy();
    expect(view.getByText('AQA')).toBeTruthy();
    expect(view.getByText('Kohana Mona')).toBeTruthy();
    expect(view.getByTestId('media-viewer-media')).toBeTruthy();
  });

  it('offers save and native app sharing from the share button', async () => {
    const view = await render(<MediaViewer asset={asset} onClose={jest.fn()} />);
    const user = userEvent.setup();

    await user.press(view.getByLabelText('Share media'));
    expect(view.getByLabelText('Save to gallery')).toBeTruthy();
    expect(view.getByLabelText('Share to other apps')).toBeTruthy();

    await user.press(view.getByLabelText('Share to other apps'));

    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith(asset.localPath, expect.objectContaining({ mimeType: 'image/jpeg' })));
  });
});

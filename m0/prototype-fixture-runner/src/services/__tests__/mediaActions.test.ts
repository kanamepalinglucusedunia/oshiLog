import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing/build/Sharing';
import { saveMediaToGallery, shareMediaToApps } from '../mediaActions';

jest.mock('expo-media-library', () => ({
  Asset: { create: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}), { virtual: true });

jest.mock('expo-sharing/build/Sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}), { virtual: true });

describe('media actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests gallery permission before saving the local media file', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });

    await saveMediaToGallery('file:///document/oshilog/originals/photo.jpg');

    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith('file:///document/oshilog/originals/photo.jpg');
  });

  it('rejects a gallery save when the user denies permission', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await expect(saveMediaToGallery('file:///photo.jpg')).rejects.toThrow('Media library permission was not granted');
    expect(MediaLibrary.Asset.create).not.toHaveBeenCalled();
  });

  it('shares a local media file through the native share sheet', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);

    await shareMediaToApps('file:///document/oshilog/originals/clip.mp4', 'video/mp4');

    expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///document/oshilog/originals/clip.mp4',
      { mimeType: 'video/mp4', dialogTitle: 'Share media' },
    );
  });

  it('rejects sharing when the device has no native share sheet', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    await expect(shareMediaToApps('file:///photo.jpg', 'image/jpeg')).rejects.toThrow('Sharing is not available');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

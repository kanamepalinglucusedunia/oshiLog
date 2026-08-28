type MediaLibraryModule = typeof import('expo-media-library');
type SharingModule = typeof import('expo-sharing/build/Sharing');

function getMediaLibrary(): MediaLibraryModule {
  // These native modules must load only when an action is invoked so Jest can import screens safely.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-media-library') as MediaLibraryModule;
}

function getSharing(): SharingModule {
  // Avoid the package root's optional incoming-share re-export on Android.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-sharing/build/Sharing') as SharingModule;
}

/** Saves an app-owned local media file into the device gallery. */
export async function saveMediaToGallery(localUri: string): Promise<void> {
  if (!localUri) throw new Error('Media file is not available.');

  const MediaLibrary = getMediaLibrary();
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('Media library permission was not granted.');
  }

  await MediaLibrary.Asset.create(localUri);
}

/** Opens the native share sheet for a local photo or video file. */
export async function shareMediaToApps(localUri: string, mimeType: string): Promise<void> {
  if (!localUri) throw new Error('Media file is not available.');

  const Sharing = getSharing();
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(localUri, {
    mimeType,
    dialogTitle: 'Share media',
  });
}

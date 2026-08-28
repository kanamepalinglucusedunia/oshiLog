import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GroupForm, createOrUpdateGroup } from '@/components/forms/GroupForm';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { getDb } from '@/db';
import { createEventRepo } from '@/repositories/event';
import { createIdolRepo } from '@/repositories/idol';
import { useSettingsStore } from '@/stores/settingsStore';
import { fetchSocialAvatarPreview } from '@/services/socialAvatar';
import { importImageFromUri } from '@/services/media';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/components/ui/CountryFlag', () => ({ CountryFlag: () => null }));
jest.mock('@/db', () => ({ getDb: jest.fn() }));
jest.mock('@/services/socialAvatar', () => ({
  SocialAvatarError: class extends Error {},
  fetchSocialAvatarPreview: jest.fn(),
}));
jest.mock('@/services/media', () => ({
  importImageFromUri: jest.fn(),
  cropImageUri: jest.fn(async (uri: string) => uri),
  stageSourceImage: jest.fn(async (uri: string) => uri),
  deleteStagedFile: jest.fn(),
}));

const testDb = createNodeTestDb();
(getDb as jest.Mock).mockReturnValue(testDb);

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ settings: null, countries: [], loaded: false });
});

describe('GroupForm social profiles and photos', () => {
  it('opens the photo source chooser, then crops a locally picked photo', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked.jpg', width: 400, height: 300 }],
    });
    (importImageFromUri as jest.Mock).mockResolvedValue({ assetId: 'group-local-photo', deduplicated: false, width: 400, height: 300 });
    await render(<GroupForm />);
    await fireEvent.press(screen.getByLabelText('Pick Group Photo'));
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('popup-modal')).toBeVisible();
    await fireEvent.press(screen.getByLabelText('Upload from device'));
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
    // The crop screen opens with the picked photo before any import happens.
    expect(screen.getByLabelText('Done cropping')).toBeTruthy();
    expect(importImageFromUri).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Done cropping'));
    await waitFor(() => expect(importImageFromUri).toHaveBeenCalledTimes(1));

    // Re-cropping re-opens the editor and imports again from the same source.
    await fireEvent.press(screen.getByLabelText('Crop photo again'));
    expect(screen.getByLabelText('Done cropping')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Done cropping'));
    await waitFor(() => expect(importImageFromUri).toHaveBeenCalledTimes(2));
  });

  it('imports one social photo, preserves the name, and saves three canonical links', async () => {
    createEventRepo(getDb()).insertMediaAsset({
      id: 'group-social-photo', kind: 'photo', contentHash: 'group-social-photo-hash', mimeType: 'image/jpeg',
      fileSize: 3, width: 64, height: 64, localPath: 'file:///group-social-photo.jpg',
    });
    new File('file:///group-social-photo.jpg').write('x');
    (fetchSocialAvatarPreview as jest.Mock).mockResolvedValue({
      profile: {
        platform: 'tiktok', username: 'teamx', profileUrl: 'https://www.tiktok.com/@teamx',
        avatarUrl: 'https://unavatar.io/tiktok/teamx?fallback=false',
      },
      stagingUri: 'file:///staging/teamx.jpg', mimeType: 'image/jpeg', byteLength: 3, dispose: jest.fn(),
    });
    (importImageFromUri as jest.Mock).mockResolvedValue({ assetId: 'group-social-photo', deduplicated: false, width: 64, height: 64 });
    const onSubmit = jest.fn((values, photoMediaId) => createOrUpdateGroup(values, photoMediaId));
    await render(<GroupForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('Group Name'), 'Original Group');
    await fireEvent.press(screen.getByLabelText('Social Media'));
    await fireEvent.changeText(screen.getByLabelText('X profile'), '@TeamX');
    await fireEvent.changeText(screen.getByLabelText('Instagram profile'), '@Team.X');

    await fireEvent.press(screen.getByLabelText('Pick Group Photo'));
    await fireEvent.press(screen.getByLabelText('Import from social media'));
    await fireEvent.press(screen.getByLabelText('Choose TikTok'));
    await fireEvent.changeText(screen.getByLabelText('Social profile'), 'TeamX');
    await fireEvent.press(screen.getByLabelText('Preview profile photo'));
    await fireEvent.press(await screen.findByLabelText('Select TikTok profile teamx'));
    await fireEvent.press(screen.getByLabelText('Confirm social photo import'));
    expect(screen.getByLabelText('Group Name')).toHaveProp('value', 'Original Group');

    // The avatar stays re-croppable from the form via the new crop button.
    expect(screen.getByLabelText('Crop photo again')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Save Group'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const saved = createIdolRepo(getDb()).listGroups().find((group) => group.name === 'Original Group');
    expect(saved).toMatchObject({
      photoMediaId: 'group-social-photo',
      xProfileUrl: 'https://x.com/teamx',
      instagramProfileUrl: 'https://www.instagram.com/team.x/',
      tiktokProfileUrl: 'https://www.tiktok.com/@teamx',
    });
  });
});

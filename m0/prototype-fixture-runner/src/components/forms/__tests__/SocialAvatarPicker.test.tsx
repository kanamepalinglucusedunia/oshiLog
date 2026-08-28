import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SocialAvatarPicker } from '@/components/forms/SocialAvatarPicker';
import { fetchSocialAvatarPreview } from '@/services/socialAvatar';
import { importImageFromUri, stageSourceImage } from '@/services/media';

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/db', () => ({ getDb: jest.fn(() => ({})) }));
jest.mock('@/services/socialAvatar', () => ({
  SocialAvatarError: class extends Error {},
  fetchSocialAvatarPreview: jest.fn(),
}));
jest.mock('@/services/media', () => ({
  importImageFromUri: jest.fn(),
  stageSourceImage: jest.fn(async (uri: string) => `staged:${uri}`),
}));

describe('SocialAvatarPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchSocialAvatarPreview as jest.Mock).mockResolvedValue({
      profile: {
        platform: 'instagram',
        username: 'rina',
        profileUrl: 'https://www.instagram.com/rina/',
        avatarUrl: 'https://unavatar.io/instagram/rina?fallback=false',
      },
      stagingUri: 'file:///staging/rina.jpg',
      mimeType: 'image/jpeg',
      byteLength: 3,
      dispose: jest.fn(),
    });
    (importImageFromUri as jest.Mock).mockResolvedValue({ assetId: 'photo-1', deduplicated: false });
  });

  it('lists exactly three platforms and does not fetch while typing', async () => {
    await render(<SocialAvatarPicker visible onClose={jest.fn()} onComplete={jest.fn()} />);
    expect(screen.getByLabelText('Choose X')).toBeTruthy();
    expect(screen.getByLabelText('Choose Instagram')).toBeTruthy();
    expect(screen.getByLabelText('Choose TikTok')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Social profile'), 'rina');
    expect(fetchSocialAvatarPreview).not.toHaveBeenCalled();
  });

  it('opens as a centered fade popup instead of a slide-up bottom sheet', async () => {
    await render(<SocialAvatarPicker visible onClose={jest.fn()} onComplete={jest.fn()} />);

    expect(screen.getByTestId('popup-modal')).toBeVisible();
  });

  it('previews once, requires confirmation, imports locally, and emits only the matching profile', async () => {
    const onComplete = jest.fn();
    await render(<SocialAvatarPicker visible onClose={jest.fn()} onComplete={onComplete} />);
    await fireEvent.press(screen.getByLabelText('Choose Instagram'));
    await fireEvent.changeText(screen.getByLabelText('Social profile'), 'rina');
    await fireEvent.press(screen.getByLabelText('Preview profile photo'));

    await waitFor(() => expect(fetchSocialAvatarPreview).toHaveBeenCalledTimes(1));
    expect(fetchSocialAvatarPreview).toHaveBeenCalledWith(expect.objectContaining({ platform: 'instagram', value: 'rina' }));
    await fireEvent.press(await screen.findByLabelText('Select Instagram profile rina'));
    expect(screen.getByText(/copied to oshiLog/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Confirm social photo import'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
      platform: 'instagram',
      profileUrl: 'https://www.instagram.com/rina/',
      mediaAssetId: 'photo-1',
      newlyCreated: true,
      sourceUri: null,
      sourceWidth: null,
      sourceHeight: null,
    }));
  });

  it('returns a session-owned staged source copy when keepStagingSource is set', async () => {
    const onComplete = jest.fn();
    (importImageFromUri as jest.Mock).mockResolvedValue({ assetId: 'photo-1', deduplicated: false, width: 64, height: 64 });
    await render(<SocialAvatarPicker visible onClose={jest.fn()} onComplete={onComplete} keepStagingSource />);
    await fireEvent.press(screen.getByLabelText('Choose Instagram'));
    await fireEvent.changeText(screen.getByLabelText('Social profile'), 'rina');
    await fireEvent.press(screen.getByLabelText('Preview profile photo'));
    await fireEvent.press(await screen.findByLabelText('Select Instagram profile rina'));
    await fireEvent.press(screen.getByLabelText('Confirm social photo import'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      sourceUri: 'staged:file:///staging/rina.jpg',
      sourceWidth: 64,
      sourceHeight: 64,
    })));
    expect(stageSourceImage).toHaveBeenCalledWith('file:///staging/rina.jpg');
  });

  it('shows replacement context and links directly to Unavatar attribution', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(
      <SocialAvatarPicker
        visible
        existingProfileUrls={{ instagram: 'https://www.instagram.com/oldrina/' }}
        onClose={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Choose Instagram'));
    await fireEvent.changeText(screen.getByLabelText('Social profile'), 'rina');
    await fireEvent.press(screen.getByLabelText('Preview profile photo'));
    await fireEvent.press(await screen.findByLabelText('Select Instagram profile rina'));
    expect(screen.getByText(/oldrina.*rina/i)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Avatars provided by Unavatar'));
    expect(openUrl).toHaveBeenCalledWith('https://unavatar.io');
    openUrl.mockRestore();
  });
});

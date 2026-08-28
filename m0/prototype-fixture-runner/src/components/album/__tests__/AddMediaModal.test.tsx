/* eslint-disable import/first -- imports stay below hoist-sensitive Jest mock state */
jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('@/services/media', () => ({
  cropImageUri: jest.fn(async (uri: string) => `cropped:${uri}`),
  importImageFromUri: jest.fn(async () => ({ assetId: 'asset-1', deduplicated: false })),
  importVideoFromUri: jest.fn(async () => ({ assetId: 'asset-2', deduplicated: false })),
}));

jest.mock('@/repositories/event', () => ({
  createEventRepo: jest.fn(() => ({ attachMediaToIdol: jest.fn() })),
}));

jest.mock('@/db', () => ({
  getDb: jest.fn(() => ({})),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('@/components/ui/DateField', () => ({
  // Cheap stand-in so the calendar modal never opens during the test.
  DateField: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TextInput } = require('react-native');
    return <TextInput accessibilityLabel="Date" value={value} onChangeText={onChange} placeholder={placeholder} />;
  },
}));

import { render, screen, waitFor, userEvent } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { AddMediaModal } from '../AddMediaModal';
import { cropImageUri, importImageFromUri, importVideoFromUri } from '@/services/media';

beforeEach(() => {
  jest.clearAllMocks();
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
});

async function renderModal(onClose = jest.fn()) {
  await render(<AddMediaModal visible idolId="idol-1" onClose={onClose} />);
  return onClose;
}

describe('AddMediaModal', () => {
  it('imports multiple photos with a shared date', async () => {
    const onClose = await renderModal();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', width: 400, height: 300 },
        { uri: 'file:///b.jpg', width: 300, height: 400 },
      ],
    });
    const user = userEvent.setup();

    await user.press(screen.getByLabelText('Add photos'));
    await waitFor(() => expect(screen.getAllByLabelText('Remove photo')).toHaveLength(2));
    await user.type(screen.getByLabelText('Date'), '2023-05-04');

    await user.press(screen.getByLabelText('Add 2 items'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(importImageFromUri).toHaveBeenCalledTimes(2);
    expect(importImageFromUri).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'file:///a.jpg',
      'photo',
      expect.objectContaining({ createdAt: '2023-05-04' }),
    );
    expect(importImageFromUri).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'file:///b.jpg',
      'photo',
      expect.objectContaining({ createdAt: '2023-05-04' }),
    );
  });

  it('imports videos without a date when the date is left empty', async () => {
    const onClose = await renderModal();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///clip.mp4' }],
    });
    const user = userEvent.setup();

    await user.press(screen.getByLabelText('Add videos'));
    await waitFor(() => expect(screen.getByLabelText('Remove video')).toBeTruthy());

    await user.press(await screen.findByLabelText('Add 1 item'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(importVideoFromUri).toHaveBeenCalledWith(
      expect.anything(),
      'file:///clip.mp4',
      expect.objectContaining({ createdAt: undefined }),
    );
  });

  it('crops a photo through the editor before importing', async () => {
    const onClose = await renderModal();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 400, height: 300 }],
    });
    const user = userEvent.setup();

    await user.press(screen.getByLabelText('Add photos'));
    await waitFor(() => expect(screen.getByLabelText('Crop photo 1')).toBeTruthy());

    await user.press(screen.getByLabelText('Crop photo 1'));
    await user.press(screen.getByLabelText('Crop ratio 3:4'));
    await user.press(screen.getByLabelText('Done cropping'));
    await waitFor(() => expect(screen.getByText('Cropped')).toBeTruthy());

    await user.press(await screen.findByLabelText('Add 1 item'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(cropImageUri).toHaveBeenCalledWith('file:///a.jpg', { crop: { originX: 88, originY: 0, width: 225, height: 300 } });
    expect(importImageFromUri).toHaveBeenCalledWith(
      expect.anything(),
      'cropped:file:///a.jpg',
      'photo',
      expect.objectContaining({ createdAt: undefined }),
    );
  });

  it('updates the selected thumbnail before the final add', async () => {
    await renderModal();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///preview.jpg', width: 400, height: 300 }],
    });
    const user = userEvent.setup();

    await user.press(screen.getByLabelText('Add photos'));
    await waitFor(() => expect(screen.getByLabelText('Crop photo 1')).toBeTruthy());
    await user.press(screen.getByLabelText('Crop photo 1'));
    await user.press(screen.getByLabelText('Crop ratio 3:4'));
    await user.press(screen.getByLabelText('Apply'));

    await waitFor(() =>
      expect(cropImageUri).toHaveBeenCalledWith('file:///preview.jpg', {
        crop: { originX: 88, originY: 0, width: 225, height: 300 },
      }),
    );
    expect(screen.getByText('Cropped')).toBeTruthy();
    expect(screen.getByLabelText('Done cropping')).toBeTruthy();

    await user.press(screen.getByLabelText('Done cropping'));

    await user.press(await screen.findByLabelText('Add 1 item'));
    await waitFor(() => expect(importImageFromUri).toHaveBeenCalled());
    expect(cropImageUri).toHaveBeenCalledTimes(1);
    expect(importImageFromUri).toHaveBeenCalledWith(
      expect.anything(),
      'cropped:file:///preview.jpg',
      'photo',
      expect.objectContaining({ createdAt: undefined }),
    );
  });

  it('restores the ORIGINAL file and border when the crop button is pressed again', async () => {
    const onClose = await renderModal();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 400, height: 300 }],
    });
    const user = userEvent.setup();

    await user.press(screen.getByLabelText('Add photos'));
    await waitFor(() => expect(screen.getByLabelText('Crop photo 1')).toBeTruthy());

    // Round 1: crop 3:4, preview it, close the editor.
    await user.press(screen.getByLabelText('Crop photo 1'));
    await user.press(screen.getByLabelText('Crop ratio 3:4'));
    await user.press(screen.getByLabelText('Apply'));
    await waitFor(() =>
      expect(cropImageUri).toHaveBeenCalledWith('file:///a.jpg', { crop: { originX: 88, originY: 0, width: 225, height: 300 } }),
    );
    await user.press(screen.getByLabelText('Done cropping'));
    await waitFor(() => expect(screen.queryByLabelText('Done cropping')).toBeNull());

    // Round 2: reopen. The editor must crop the ORIGINAL pick again with the
    // same border restored — never the already-cropped preview.
    await user.press(screen.getByLabelText('Crop photo 1'));
    await user.press(screen.getByLabelText('Done cropping'));
    await waitFor(() => expect(screen.queryByLabelText('Done cropping')).toBeNull());
    expect(cropImageUri).toHaveBeenCalledTimes(2);
    expect(cropImageUri).toHaveBeenNthCalledWith(
      2,
      'file:///a.jpg',
      { crop: { originX: 88, originY: 0, width: 225, height: 300 } },
    );

    // Importing uses the single-encode preview derived from the original.
    await user.press(await screen.findByLabelText('Add 1 item'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(importImageFromUri).toHaveBeenCalledWith(
      expect.anything(),
      'cropped:file:///a.jpg',
      'photo',
      expect.objectContaining({ createdAt: undefined }),
    );
  });

  it('removes a selected file before adding', async () => {
    const onClose = await renderModal();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', width: 400, height: 300 }],
    });
    const user = userEvent.setup();

    await user.press(screen.getByLabelText('Add photos'));
    await waitFor(() => expect(screen.getByLabelText('Remove photo')).toBeTruthy());

    await user.press(screen.getByLabelText('Remove photo'));
    expect(screen.queryByLabelText('Remove photo')).toBeNull();
    expect(screen.getByLabelText('Add items')).toBeTruthy();

    await user.press(screen.getByLabelText('Add items'));
    expect(importImageFromUri).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

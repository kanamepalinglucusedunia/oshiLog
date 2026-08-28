/* eslint-disable import/first -- mock registration stays above imports */
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/services/media', () => ({
  cropImageUri: jest.fn(async (uri: string) => `preview:${uri}`),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ImageCropEditor, type CropPhoto } from '../ImageCropEditor';
import type { PerspectiveQuad } from '@/utils/geometry';

const photo = (key: number, width = 400, height = 300): CropPhoto => ({
  key,
  uri: `file:///photo-${key}.jpg`,
  width,
  height,
});

const QUAD: PerspectiveQuad = {
  tl: { x: 0.1, y: 0.1 },
  tr: { x: 0.9, y: 0.1 },
  br: { x: 0.9, y: 0.9 },
  bl: { x: 0.1, y: 0.9 },
};

const TALL_QUAD: PerspectiveQuad = {
  tl: { x: 0.2, y: 0.05 },
  tr: { x: 0.8, y: 0.05 },
  br: { x: 0.8, y: 0.95 },
  bl: { x: 0.2, y: 0.95 },
};

async function measurePreview(): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId('crop-preview'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });
  });
}

describe('ImageCropEditor instax tools', () => {
  it('hides the Auto and Enhance controls when the callbacks are absent', async () => {
    await render(<ImageCropEditor visible photos={[photo(1)]} initialKey={1} onCancel={jest.fn()} onDone={jest.fn()} />);
    expect(screen.queryByLabelText('Auto-detect instax card')).toBeNull();
    expect(screen.queryByLabelText('Enhance Light')).toBeNull();
  });

  it('auto-detect uses the default mini preset, then accepts a manual size choice', async () => {
    const onAutoDetect = jest.fn(async (_uri: string, preset: string) => (preset === 'mini' || preset === 'square' ? QUAD : null));
    await render(
      <ImageCropEditor visible photos={[photo(1)]} initialKey={1} onCancel={jest.fn()} onDone={jest.fn()} onAutoDetect={onAutoDetect} />,
    );
    await measurePreview();

    // Default = mini.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Auto-detect instax card'));
    });
    expect(onAutoDetect).toHaveBeenCalledWith('file:///photo-1.jpg', 'mini');
    expect(await screen.findByLabelText('Perspective handle top-left')).toBeTruthy();

    // Switching the card-size preset changes what the detector receives.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Card size Square'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Auto-detect instax card'));
    });
    expect(onAutoDetect).toHaveBeenLastCalledWith('file:///photo-1.jpg', 'square');

    // A preset where detection fails surfaces a targeted message.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Card size Wide'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Auto-detect instax card'));
    });
    expect(onAutoDetect).toHaveBeenLastCalledWith('file:///photo-1.jpg', 'wide');
    expect(await screen.findByText('No wide instax card detected. Adjust the perspective corners manually.')).toBeTruthy();
  });

  it('keeps Card size selection per active photo and returns the selected presets', async () => {
    const onDone = jest.fn();
    await render(
      <ImageCropEditor
        visible
        photos={[photo(1), photo(2)]}
        initialKey={1}
        onCancel={jest.fn()}
        onDone={onDone}
        onAutoDetect={jest.fn(async () => QUAD)}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Card size Square'));
    await fireEvent.press(screen.getByLabelText('Crop strip photo 2'));
    expect(screen.getByLabelText('Card size Mini').props.accessibilityState?.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText('Card size Wide'));
    await fireEvent.press(screen.getByLabelText('Crop strip photo 1'));
    expect(screen.getByLabelText('Card size Square').props.accessibilityState?.selected).toBe(true);

    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({}, undefined, { 1: 'square', 2: 'wide' });
  });

  it('reports the perspective output aspect when committing a preview', async () => {
    const onAutoDetect = jest.fn(async () => TALL_QUAD);
    const onPreviewUpdate = jest.fn();
    await render(
      <ImageCropEditor
        visible
        photos={[photo(1)]}
        initialKey={1}
        onCancel={jest.fn()}
        onDone={jest.fn()}
        onPreviewUpdate={onPreviewUpdate}
        onAutoDetect={onAutoDetect}
      />,
    );
    await measurePreview();

    await fireEvent.press(screen.getByLabelText('Auto-detect instax card'));
    await fireEvent.press(screen.getByLabelText('Apply'));

    expect(onPreviewUpdate).toHaveBeenCalledWith(
      1,
      {
        key: 1,
        uri: 'preview:file:///photo-1.jpg',
        width: 267,
        height: 300,
      },
      { perspective: TALL_QUAD },
    );
  });

  it('drives a debounced enhance preview and reports the level on Done', async () => {
    jest.useFakeTimers();
    try {
      const onEnhancePreview = jest.fn(async () => 'enhanced:file:///photo-1.jpg');
      const onDone = jest.fn();
      await render(
        <ImageCropEditor visible photos={[photo(1)]} initialKey={1} onCancel={jest.fn()} onDone={onDone} onEnhancePreview={onEnhancePreview} />,
      );

      await fireEvent.press(screen.getByLabelText('Enhance Light'));
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      await waitFor(() => expect(onEnhancePreview).toHaveBeenCalledWith('file:///photo-1.jpg', 1));

      await fireEvent.press(screen.getByLabelText('Done cropping'));
      expect(onDone).toHaveBeenCalledWith({}, { 1: 1 });
    } finally {
      jest.useRealTimers();
    }
  });
});

/* eslint-disable import/first -- mock registration stays above imports */
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/services/media', () => ({
  cropImageUri: jest.fn(async (uri: string) => uri),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ProfilePhotoCropEditor } from '../ProfilePhotoCropEditor';
import type { CropBox } from '@/components/album/ImageCropEditor';

function expectBox(actual: CropBox, expected: CropBox) {
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    expect(actual[key]).toBeCloseTo(expected[key], 6);
  }
}

async function renderEditor(overrides: Partial<React.ComponentProps<typeof ProfilePhotoCropEditor>> = {}) {
  const onDone = jest.fn();
  const onCancel = jest.fn();
  await render(
    <ProfilePhotoCropEditor
      visible
      uri="file:///photo.jpg"
      width={400}
      height={300}
      ratio={1}
      onCancel={onCancel}
      onDone={onDone}
      {...overrides}
    />,
  );
  // Give the preview a measured layout so overlays (dims, box, guide) render.
  await act(async () => {
    fireEvent(screen.getByTestId('profile-crop-preview'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } },
    });
  });
  return { onDone, onCancel };
}

describe('ProfilePhotoCropEditor', () => {
  it('reports the largest centered ratio-locked box when nothing is moved', async () => {
    const { onDone } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledTimes(1);
    expectBox(onDone.mock.calls[0][0], { x: 0.125, y: 0, w: 0.75, h: 1 });
  });

  it('applies the 4:3 ratio as a full-frame box on a 4:3 image', async () => {
    const { onDone } = await renderEditor({ ratio: 4 / 3 });

    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expectBox(onDone.mock.calls[0][0], { x: 0, y: 0, w: 1, h: 1 });
  });

  it('honors an initial box so re-crops resume from the saved crop', async () => {
    const { onDone } = await renderEditor({ initialBox: { x: 0.2, y: 0.1, w: 0.4, h: 0.4 } });

    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expectBox(onDone.mock.calls[0][0], { x: 0.2, y: 0.1, w: 0.4, h: 0.4 });
  });

  it('Reset restores the largest centered ratio box', async () => {
    const { onDone } = await renderEditor({ initialBox: { x: 0.2, y: 0.1, w: 0.4, h: 0.4 } });

    await fireEvent.press(screen.getByLabelText('Reset crop'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expectBox(onDone.mock.calls[0][0], { x: 0.125, y: 0, w: 0.75, h: 1 });
  });

  it('shows the 1:1 guide only when requested and the box is not square', async () => {
    await renderEditor({ ratio: 4 / 3, showSquareGuide: true });
    expect(screen.getByLabelText('1:1 card preview guide')).toBeTruthy();
  });

  it('omits the 1:1 guide when the crop box is already square', async () => {
    await renderEditor({ showSquareGuide: true });
    expect(screen.queryByLabelText('1:1 card preview guide')).toBeNull();
  });

  it('does not render the guide when showSquareGuide is off', async () => {
    await renderEditor({ ratio: 4 / 3 });
    expect(screen.queryByLabelText('1:1 card preview guide')).toBeNull();
  });

  it('cancels without reporting a crop', async () => {
    const { onDone, onCancel } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Cancel crop'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('disables Done while busy', async () => {
    await renderEditor({ busy: true });

    expect(screen.getByLabelText('Done cropping').props.accessibilityState?.disabled).toBe(true);
  });

  it('shows the apply error when the caller reports a failure', async () => {
    await renderEditor({ error: 'Could not apply the crop. Please try again or cancel.' });

    expect(screen.getByText('Could not apply the crop. Please try again or cancel.')).toBeTruthy();
  });
});

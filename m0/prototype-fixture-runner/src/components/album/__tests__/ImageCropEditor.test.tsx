/* eslint-disable import/first -- mock registration stays above imports */
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/services/media', () => ({
  cropImageUri: jest.fn(async (uri: string) => `preview:${uri}`),
}));

import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { ImageCropEditor, composeTransforms, cropTransformFromDraft, draftFromTransform, loupeLayout, loupePlacement, resizeBoxFromCorner } from '../ImageCropEditor';
import type { CropPhoto } from '../ImageCropEditor';
import { cropImageUri } from '@/services/media';

const photo = (key: number, width = 400, height = 300): CropPhoto => ({
  key,
  uri: `file:///photo-${key}.jpg`,
  width,
  height,
});

async function renderEditor(onDone = jest.fn(), onCancel = jest.fn()) {
  await render(
    <ImageCropEditor visible photos={[photo(1)]} initialKey={1} onCancel={onCancel} onDone={onDone} />,
  );
  return { onDone, onCancel };
}

function expectBox(actual: { x: number; y: number; w: number; h: number }, expected: { x: number; y: number; w: number; h: number }) {
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    expect(actual[key]).toBeCloseTo(expected[key], 6);
  }
}

describe('ImageCropEditor', () => {
  it('applies no crop when nothing is edited', async () => {
    const { onDone } = await renderEditor();

    expect(screen.getByTestId('apply-crop-preview-icon')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({});
  });

  it('keeps Apply disabled until the active photo changes', async () => {
    const user = userEvent.setup();
    await renderEditor();

    expect(screen.getByLabelText('Apply').props.accessibilityState?.disabled).toBe(true);
    await user.press(screen.getByLabelText('Crop ratio 3:4'));
    expect(screen.getByLabelText('Apply').props.accessibilityState?.disabled).toBe(false);
  });

  it('applies the active edit to the preview and stays in the editor', async () => {
    const user = userEvent.setup();
    const onPreviewUpdate = jest.fn();
    (cropImageUri as jest.Mock).mockClear();
    await render(
      <ImageCropEditor
        visible
        photos={[photo(1)]}
        initialKey={1}
        onCancel={jest.fn()}
        onDone={jest.fn()}
        onPreviewUpdate={onPreviewUpdate}
      />,
    );

    await user.press(screen.getByLabelText('Crop ratio 3:4'));
    await user.press(screen.getByLabelText('Apply'));

    expect(cropImageUri).toHaveBeenCalledWith('file:///photo-1.jpg', {
      crop: { originX: 88, originY: 0, width: 225, height: 300 },
    });
    expect(onPreviewUpdate).toHaveBeenCalledWith(
      1,
      {
        key: 1,
        uri: 'preview:file:///photo-1.jpg',
        width: 225,
        height: 300,
      },
      { crop: { originX: 88, originY: 0, width: 225, height: 300 } },
    );
    expect(screen.getByLabelText('Done cropping')).toBeTruthy();
    expect(screen.getByLabelText('Apply').props.accessibilityState?.disabled).toBe(true);
  });

  it('reports a ratio-locked crop box in final pixel coordinates', async () => {
    const { onDone } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Crop ratio 3:4'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({ 1: { crop: { originX: 88, originY: 0, width: 225, height: 300 } } });
  });

  it('applies 1:1 as a true square on a landscape image', async () => {
    const { onDone } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Crop ratio 1:1'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({ 1: { crop: { originX: 50, originY: 0, width: 300, height: 300 } } });
  });

  it('applies 16:9 as a true wide box on a landscape image', async () => {
    const { onDone } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Crop ratio 16:9'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({ 1: { crop: { originX: 0, originY: 38, width: 400, height: 225 } } });
  });

  it('reports rotation after rotating 90° with the box reset to full frame', async () => {
    const { onDone } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Rotate image'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({ 1: { rotateDegrees: 90 } });
  });

  it('reports flip combined with a crop', async () => {
    const { onDone } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Flip image'));
    await fireEvent.press(screen.getByLabelText('Crop ratio 3:4'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({ 1: { flipped: true, crop: { originX: 88, originY: 0, width: 225, height: 300 } } });
  });

  it('cancels without applying', async () => {
    const { onDone, onCancel } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Cancel crop'));

    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('resets rotation, flip, ratio and the box', async () => {
    const { onDone } = await renderEditor();

    await fireEvent.press(screen.getByLabelText('Rotate image'));
    await fireEvent.press(screen.getByLabelText('Flip image'));
    await fireEvent.press(screen.getByLabelText('Crop ratio 16:9'));
    await fireEvent.press(screen.getByLabelText('Reset crop'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({});
  });

  it('crops every selected photo in one screen via the strip', async () => {
    const onDone = jest.fn();
    await render(
      <ImageCropEditor
        visible
        photos={[photo(1, 400, 300), photo(2, 300, 400)]}
        initialKey={1}
        onCancel={jest.fn()}
        onDone={onDone}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Crop ratio 3:4'));
    await fireEvent.press(screen.getByLabelText('Crop strip photo 2'));
    await fireEvent.press(screen.getByLabelText('Crop ratio 1:1'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({
      1: { crop: { originX: 88, originY: 0, width: 225, height: 300 } },
      2: { crop: { originX: 0, originY: 50, width: 300, height: 300 } },
    });
  });

  it('excludes untouched photos from the crop results', async () => {
    const onDone = jest.fn();
    await render(
      <ImageCropEditor
        visible
        photos={[photo(1, 400, 300), photo(2, 300, 400)]}
        initialKey={1}
        onCancel={jest.fn()}
        onDone={onDone}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Crop strip photo 2'));
    await fireEvent.press(screen.getByLabelText('Crop ratio 1:1'));
    await fireEvent.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({ 2: { crop: { originX: 0, originY: 50, width: 300, height: 300 } } });
  });

  it('shows perspective handles and hides ratios in perspective mode', async () => {
    const user = userEvent.setup();
    const { onDone } = await renderEditor();
    // Mimic layout measurement so the preview overlay (crop/perspective) renders.
    fireEvent(screen.getByTestId('crop-preview'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });

    await user.press(screen.getByLabelText('Switch to perspective mode'));

    expect(screen.getByLabelText('Perspective handle top-left')).toBeTruthy();
    expect(screen.getByLabelText('Perspective handle bottom-right')).toBeTruthy();
    expect(screen.queryByLabelText('Crop ratio 1:1')).toBeNull();
    expect(screen.queryByLabelText('Crop handle top-left')).toBeNull();

    // Leaving perspective restores the normal crop UI.
    await user.press(screen.getByLabelText('Switch to crop mode'));
    await screen.findByLabelText('Crop ratio 1:1');
    expect(screen.queryByLabelText('Perspective handle top-left')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('produces no transform when perspective mode is untouched', async () => {
    const user = userEvent.setup();
    const { onDone } = await renderEditor();

    await user.press(screen.getByLabelText('Switch to perspective mode'));
    await user.press(screen.getByLabelText('Done cropping'));

    expect(onDone).toHaveBeenCalledWith({});
  });

  it('centers the magnifier loupe on the dragged corner (unit)', () => {
    const fitted = { dispX: 0, dispY: 0, dispW: 400, dispH: 300, drawW: 400, drawH: 300 };
    const layout = loupeLayout(fitted, { x: 200, y: 150 }, 2.4);
    // The corner must land at the local loupe center, not at its preview
    // coordinates: left + cornerOffset*zoom === loupeDiameter / 2.
    expect(layout.left + (200 - fitted.dispX) * 2.4).toBeCloseTo(54, 6);
    expect(layout.top + (150 - fitted.dispY) * 2.4).toBeCloseTo(54, 6);
    expect(layout.width).toBeCloseTo(400 * 2.4, 6);
    // Non-rotated: the draw rect fills the oriented rect, so no inner offset.
    expect(layout.imageLeft).toBeCloseTo(0, 6);
    expect(layout.imageTop).toBeCloseTo(0, 6);
  });

  it('offsets the loupe image for a rotated preview (unit)', () => {
    // 90°-rotated landscape: oriented box (300x400) around a draw rect (400x300).
    const fitted = { dispX: 0, dispY: 0, dispW: 300, dispH: 400, drawW: 400, drawH: 300 };
    const layout = loupeLayout(fitted, { x: 150, y: 200 }, 2);
    expect(layout.width).toBeCloseTo(600, 6);
    expect(layout.height).toBeCloseTo(800, 6);
    expect(layout.imageLeft).toBeCloseTo((300 - 400) * 2 / 2, 6);
    expect(layout.imageTop).toBeCloseTo((400 - 300) * 2 / 2, 6);
  });

  it('keeps the loupe fixed in the upper-left for right-side handles (unit)', () => {
    const container = { w: 400, h: 600 };
    const diameter = 108;
    const br = loupePlacement('br', diameter, container);
    const tr = loupePlacement('tr', diameter, container);
    expect(br).toEqual({ left: 0, top: 24 });
    expect(tr).toEqual(br);
  });

  it('keeps the loupe fixed in the upper-right for left-side handles (unit)', () => {
    const container = { w: 400, h: 600 };
    const diameter = 108;
    const tl = loupePlacement('tl', diameter, container);
    const bl = loupePlacement('bl', diameter, container);
    expect(tl).toEqual({ left: 292, top: 24 });
    expect(bl).toEqual(tl);
  });

  it('clamps the loupe inside the preview container (unit)', () => {
    const container = { w: 80, h: 80 };
    const diameter = 108;
    const clamped = loupePlacement('br', diameter, container);
    expect(clamped.left).toBe(0);
    expect(clamped.top).toBe(0);
  });

  it('reports a perspective transform from a full-frame draft (unit)', () => {
    const quad = {
      tl: { x: 0.05, y: 0 },
      tr: { x: 0.95, y: 0 },
      br: { x: 1, y: 1 },
      bl: { x: 0, y: 1 },
    };
    const transform = cropTransformFromDraft(
      { rotation: 0, flipped: false, box: { x: 0, y: 0, w: 1, h: 1 }, perspective: quad },
      400,
      300,
    );
    expect(transform).toEqual({ perspective: quad });
  });

  it('ignores the box crop while a perspective transform is active (unit)', () => {
    const quad = {
      tl: { x: 0.1, y: 0.1 },
      tr: { x: 0.9, y: 0 },
      br: { x: 0.9, y: 1 },
      bl: { x: 0.2, y: 1 },
    };
    const transform = cropTransformFromDraft(
      { rotation: 0, flipped: false, box: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, perspective: quad },
      400,
      300,
    );
    expect(transform).toEqual({ perspective: quad });
  });

  it('resizes an existing box keeping the opposite corner fixed (unit)', () => {
    // Drag top-left by (+0.2, +0.1): bottom-right stays fixed at the frame.
    expectBox(resizeBoxFromCorner({ x: 0, y: 0, w: 1, h: 1 }, 'tl', 0.2, 0.1, null, 4 / 3), { x: 0.2, y: 0.1, w: 0.8, h: 0.9 });
  });

  it('keeps the opposite corner fixed when dragging each corner', () => {
    const frame = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    expectBox(resizeBoxFromCorner(frame, 'tr', -0.1, 0, null, 4 / 3), { x: 0.1, y: 0.1, w: 0.7, h: 0.8 });
    expectBox(resizeBoxFromCorner(frame, 'bl', 0, -0.1, null, 4 / 3), { x: 0.1, y: 0.1, w: 0.8, h: 0.7 });
    expectBox(resizeBoxFromCorner(frame, 'br', -0.1, -0.1, null, 4 / 3), { x: 0.1, y: 0.1, w: 0.7, h: 0.7 });
    expectBox(resizeBoxFromCorner(frame, 'tl', 0.1, 0.1, null, 4 / 3), { x: 0.2, y: 0.2, w: 0.7, h: 0.7 });
  });

  it('keeps the pixel ratio when resizing with a locked ratio', () => {
    const result = resizeBoxFromCorner({ x: 0, y: 0, w: 1, h: 1 }, 'tl', 0.2, 0.1, 16 / 9, 4 / 3);
    expectBox(result, { x: 0.2, y: 0.4, w: 0.8, h: 0.6 });
    expect((result.w * 400) / (result.h * 300)).toBeCloseTo(16 / 9, 5);
  });

  it('restores a ratio crop as a draft over the ORIGINAL dims (unit)', () => {
    const draft = draftFromTransform({ crop: { originX: 88, originY: 0, width: 225, height: 300 } }, 400, 300);
    expectBox(draft.box, { x: 0.22, y: 0, w: 0.5625, h: 1 });
    expect(draft.rotation).toBe(0);
    expect(draft.flipped).toBe(false);
    expect(draft.ratioKey).toBe('3:4');
    expect(draft.perspective).toBeNull();
  });

  it('restores a rotated crop against the swapped dims (unit)', () => {
    const draft = draftFromTransform({ rotateDegrees: 90, crop: { originX: 75, originY: 100, width: 150, height: 150 } }, 400, 300);
    // 90° rotation swaps the final dims to 300×400.
    expectBox(draft.box, { x: 0.25, y: 0.25, w: 0.5, h: 0.375 });
    expect(draft.rotation).toBe(1);
    expect(draft.ratioKey).toBe('1:1');
  });

  it('restores a perspective transform as a perspective draft (unit)', () => {
    const quad = { tl: { x: 0.1, y: 0.1 }, tr: { x: 0.9, y: 0.1 }, br: { x: 0.9, y: 0.9 }, bl: { x: 0.1, y: 0.9 } };
    const draft = draftFromTransform({ perspective: quad }, 400, 300);
    expect(draft.perspective).toEqual(quad);
    expect(draft.ratioKey).toBe('free');
    expect(draft.rotation).toBe(0);
  });

  it('composes a follow-up crop onto the previous crop origin (unit)', () => {
    expect(
      composeTransforms(
        { crop: { originX: 88, originY: 0, width: 225, height: 300 } },
        { crop: { originX: 10, originY: 20, width: 100, height: 80 } },
      ),
    ).toEqual({ crop: { originX: 98, originY: 20, width: 100, height: 80 } });
  });

  it('keeps the base rotation/flip when composing (unit)', () => {
    expect(
      composeTransforms(
        { rotateDegrees: 90 as const, flipped: true, crop: { originX: 50, originY: 60, width: 200, height: 150 } },
        { crop: { originX: 5, originY: 6, width: 100, height: 90 } },
      ),
    ).toEqual({ rotateDegrees: 90, flipped: true, crop: { originX: 55, originY: 66, width: 100, height: 90 } });
  });

  it('returns the follow-up unchanged when it rotates/flips or uses perspective (unit)', () => {
    const rotated = { rotateDegrees: 90 as const, crop: { originX: 0, originY: 0, width: 100, height: 100 } };
    expect(composeTransforms({ crop: { originX: 10, originY: 10, width: 50, height: 50 } }, rotated)).toEqual(rotated);
    const perspective = { perspective: { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } } };
    expect(composeTransforms({ crop: { originX: 10, originY: 10, width: 50, height: 50 } }, perspective)).toEqual(perspective);
  });

  it('restores the previous border over the original image when reopened with initialCrops', async () => {
    const onDone = jest.fn();
    await render(
      <ImageCropEditor
        visible
        photos={[photo(1)]}
        initialKey={1}
        initialCrops={{ 1: { crop: { originX: 88, originY: 0, width: 225, height: 300 } } }}
        onCancel={jest.fn()}
        onDone={onDone}
      />,
    );

    // The seeded border counts as a change, so Apply is immediately available.
    expect(screen.getByLabelText('Apply').props.accessibilityState?.disabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('Done cropping'));
    // Done without edits re-reports the restored transform unchanged.
    expect(onDone).toHaveBeenCalledWith({ 1: { crop: { originX: 88, originY: 0, width: 225, height: 300 } } });
  });

  it('chains a post-preview edit back into the original pixel space on Done', async () => {
    const user = userEvent.setup();
    const onPreviewUpdate = jest.fn();
    const onDone = jest.fn();
    await render(
      <ImageCropEditor
        visible
        photos={[photo(1)]}
        initialKey={1}
        onCancel={jest.fn()}
        onDone={onDone}
        onPreviewUpdate={onPreviewUpdate}
      />,
    );

    // First crop: 3:4 over the original 400×300 → preview + stored transform.
    await user.press(screen.getByLabelText('Crop ratio 3:4'));
    await user.press(screen.getByLabelText('Apply'));
    expect(onPreviewUpdate).toHaveBeenCalledWith(1, expect.anything(), {
      crop: { originX: 88, originY: 0, width: 225, height: 300 },
    });

    // Second edit on the 225×300 preview: a 1:1 box starting at (0, 38) there.
    await user.press(screen.getByLabelText('Crop ratio 1:1'));
    await user.press(screen.getByLabelText('Done cropping'));

    // Composed in the ORIGINAL space: offset 3:4 origin (88, 0) by (0, 38).
    expect(onDone).toHaveBeenCalledWith({ 1: { crop: { originX: 88, originY: 38, width: 225, height: 225 } } });
  });
});

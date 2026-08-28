import { getModalRelativeAnchor, type OverlayFrame } from '@/components/forms/dropdownOverlay';

describe('dropdown overlay geometry', () => {
  it('converts a window anchor into the native modal coordinate space', () => {
    const anchor: OverlayFrame = { x: 16, y: 220, width: 162, height: 36 };
    const modal: OverlayFrame = { x: 0, y: 24, width: 360, height: 752 };

    expect(getModalRelativeAnchor(anchor, modal)).toEqual({
      x: 16,
      y: 196,
      width: 162,
      height: 36,
    });
  });

  it('keeps the window anchor when the modal frame is not available yet', () => {
    const anchor: OverlayFrame = { x: 16, y: 220, width: 162, height: 36 };

    expect(getModalRelativeAnchor(anchor, null)).toEqual(anchor);
  });
});

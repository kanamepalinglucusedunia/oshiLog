export interface OverlayFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getModalRelativeAnchor(
  anchor: OverlayFrame,
  modalFrame: OverlayFrame | null,
): OverlayFrame {
  if (!modalFrame) return anchor;

  return {
    ...anchor,
    x: anchor.x - modalFrame.x,
    y: anchor.y - modalFrame.y,
  };
}

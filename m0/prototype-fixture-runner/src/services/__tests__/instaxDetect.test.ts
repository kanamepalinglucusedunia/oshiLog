import { detectInstaxQuad, expandQuadForPreset, ratioAccepted } from '../instaxDetect';

interface Pt {
  x: number;
  y: number;
}

function pointInQuad(px: number, py: number, quad: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const xi = quad[i].x;
    const yi = quad[i].y;
    const xj = quad[j].x;
    const yj = quad[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function rotatePoints(points: Pt[], angleDeg: number, cx: number, cy: number): Pt[] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((p) => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }));
}

/** Draws a card (border + darker photo area) over a background into RGBA. */
function makeCardImage(
  width: number,
  height: number,
  corners: Pt[],
  options: {
    background: [number, number, number];
    border: [number, number, number];
    photo: [number, number, number];
    borderWidth: number;
  },
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const cardW = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const cardH = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  const shrink = 1 - (options.borderWidth * 2) / Math.min(cardW, cardH);
  const centroid = {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
  };
  const inner = corners.map((p) => ({
    x: centroid.x + (p.x - centroid.x) * shrink,
    y: centroid.y + (p.y - centroid.y) * shrink,
  }));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color = options.background;
      if (pointInQuad(x + 0.5, y + 0.5, corners)) {
        color = pointInQuad(x + 0.5, y + 0.5, inner) ? options.photo : options.border;
      }
      const i = (y * width + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function drawStroke(rgba: Uint8Array, width: number, height: number, points: Pt[], color: [number, number, number] = [24, 24, 24]): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y)));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = Math.round(start.x + (end.x - start.x) * t);
      const y = Math.round(start.y + (end.y - start.y) * t);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          const offset = (py * width + px) * 4;
          rgba[offset] = color[0];
          rgba[offset + 1] = color[1];
          rgba[offset + 2] = color[2];
        }
      }
    }
  }
}

function expectQuadClose(actual: { tl: Pt; tr: Pt; br: Pt; bl: Pt }, expected: Pt[], tolerance = 0.035) {
  const names = ['tl', 'tr', 'br', 'bl'] as const;
  names.forEach((name, index) => {
    expect(Math.abs(actual[name].x - expected[index].x)).toBeLessThan(tolerance);
    expect(Math.abs(actual[name].y - expected[index].y)).toBeLessThan(tolerance);
  });
}

/** Card quad centered in the frame with the given pixel size (no rotation). */
function centeredCard(width: number, height: number, cardW: number, cardH: number): Pt[] {
  const left = (width - cardW) / 2;
  const top = (height - cardH) / 2;
  return [
    { x: left, y: top },
    { x: left + cardW, y: top },
    { x: left + cardW, y: top + cardH },
    { x: left, y: top + cardH },
  ];
}

const DARK_BG: [number, number, number] = [48, 48, 48];
const WHITE_BORDER: [number, number, number] = [245, 245, 245];
const PHOTO: [number, number, number] = [118, 118, 118];

function insetQuad(corners: Pt[], amount: number): Pt[] {
  const cardW = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const cardH = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  const shrink = 1 - (amount * 2) / Math.min(cardW, cardH);
  const centroid = {
    x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
    y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
  };
  return corners.map((p) => ({ x: centroid.x + (p.x - centroid.x) * shrink, y: centroid.y + (p.y - centroid.y) * shrink }));
}

/** One bright card + one dark distractor quad over a dark background. */
function makeCardWithDistractor(width: number, height: number, card: Pt[], distractor: Pt[]): Uint8Array {
  const inner = insetQuad(card, 10);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color = DARK_BG;
      if (pointInQuad(x + 0.5, y + 0.5, distractor)) color = [25, 25, 25];
      if (pointInQuad(x + 0.5, y + 0.5, card)) color = pointInQuad(x + 0.5, y + 0.5, inner) ? PHOTO : WHITE_BORDER;
      const i = (y * width + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

describe('detectInstaxQuad', () => {
  it('detects a straight instax-mini card with a white border', () => {
    const w = 192;
    const h = 256;
    const corners = centeredCard(w, h, 140, 220);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });

    const result = detectInstaxQuad(rgba, w, h);

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })));
    expect(result!.confidence).toBeGreaterThan(0.6);
  });

  it('detects a tilted card (8°) via perspective corners', () => {
    const w = 192;
    const h = 256;
    const corners = rotatePoints(centeredCard(w, h, 150, 230), 8, w / 2, h / 2);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });

    const result = detectInstaxQuad(rgba, w, h);

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })), 0.04);
  });

  it('keeps the full mini border when the lower margin contains handwriting', () => {
    const w = 192;
    const h = 256;
    const corners = centeredCard(w, h, 140, 223);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });
    drawStroke(rgba, w, h, [
      { x: 48, y: 22 }, { x: 58, y: 27 }, { x: 68, y: 21 }, { x: 78, y: 27 },
      { x: 88, y: 21 }, { x: 98, y: 27 }, { x: 108, y: 21 }, { x: 118, y: 27 },
      { x: 128, y: 22 }, { x: 140, y: 27 },
    ]);
    drawStroke(rgba, w, h, [
      { x: 46, y: 229 }, { x: 56, y: 234 }, { x: 66, y: 228 }, { x: 76, y: 234 },
      { x: 86, y: 228 }, { x: 96, y: 234 }, { x: 106, y: 228 }, { x: 116, y: 234 },
      { x: 126, y: 229 }, { x: 140, y: 234 },
    ]);

    const result = detectInstaxQuad(rgba, w, h, 'mini');

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })), 0.035);
  });

  it('keeps the full border for a tilted handwritten mini card', () => {
    const w = 192;
    const h = 256;
    const center = { x: w / 2, y: h / 2 };
    const baseCorners = centeredCard(w, h, 140, 223);
    const corners = rotatePoints(baseCorners, 8, center.x, center.y);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });
    const topInk = [
      { x: 48, y: 22 }, { x: 58, y: 27 }, { x: 68, y: 21 }, { x: 78, y: 27 },
      { x: 88, y: 21 }, { x: 98, y: 27 }, { x: 108, y: 21 }, { x: 118, y: 27 },
    ];
    const bottomInk = [
      { x: 46, y: 229 }, { x: 56, y: 234 }, { x: 66, y: 228 }, { x: 76, y: 234 },
      { x: 86, y: 228 }, { x: 96, y: 234 }, { x: 106, y: 228 }, { x: 116, y: 234 },
    ];
    drawStroke(rgba, w, h, rotatePoints(topInk, 8, center.x, center.y));
    drawStroke(rgba, w, h, rotatePoints(bottomInk, 8, center.x, center.y));

    const result = detectInstaxQuad(rgba, w, h, 'mini');

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })), 0.04);
  });

  it('does not select a long high-contrast line inside the photo as the card edge', () => {
    const w = 192;
    const h = 256;
    const corners = centeredCard(w, h, 140, 220);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });
    drawStroke(rgba, w, h, [
      { x: 28, y: 68 }, { x: 58, y: 66 }, { x: 92, y: 69 }, { x: 126, y: 66 }, { x: 164, y: 68 },
    ]);

    const result = detectInstaxQuad(rgba, w, h, 'mini');

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })), 0.035);
  });

  it('detects a square instax card (1:1) with the square preset', () => {
    const w = 192;
    const h = 192;
    const corners = centeredCard(w, h, 140, 140);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });

    const result = detectInstaxQuad(rgba, w, h, 'square');

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })));
  });

  it('rejects a square card under the mini preset (ratio filtering)', () => {
    const w = 192;
    const h = 192;
    const corners = centeredCard(w, h, 140, 140);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });

    expect(detectInstaxQuad(rgba, w, h, 'mini')).toBeNull();

    const acceptSquare = detectInstaxQuad(rgba, w, h, 'square');
    expect(acceptSquare).not.toBeNull();
  });

  it('detects a wide (landscape) instax card with the wide preset', () => {
    const w = 256;
    const h = 192;
    const corners = centeredCard(w, h, 210, 132);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });

    const result = detectInstaxQuad(rgba, w, h, 'wide');

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })));
  });

  it('detects a landscape-oriented mini card with the mini preset', () => {
    const w = 256;
    const h = 192;
    const corners = centeredCard(w, h, 210, 132);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });

    const result = detectInstaxQuad(rgba, w, h, 'mini');

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })));
  });

  it('detects a white mini card on a bright background (inner photo edge only)', () => {
    const w = 192;
    const h = 256;
    const corners = centeredCard(w, h, 140, 220);
    const rgba = makeCardImage(w, h, corners, { background: [230, 230, 230], border: WHITE_BORDER, photo: PHOTO, borderWidth: 10 });

    const result = detectInstaxQuad(rgba, w, h, 'mini');

    expect(result).not.toBeNull();
    // Either the full card or the photo area – both are plausible mini aspects.
    const quad = result!.quad;
    // Aspect in PIXEL space (the frame is not square).
    const ratio = ((quad.tr.x - quad.tl.x) * w) / Math.max(1e-6, (quad.bl.y - quad.tl.y) * h);
    expect(Math.abs(ratio - 0.636)).toBeLessThan(0.15);
  });

  it('detects a card with a colored (custom) border', () => {
    const w = 192;
    const h = 256;
    const corners = centeredCard(w, h, 140, 220);
    const rgba = makeCardImage(w, h, corners, {
      background: DARK_BG,
      border: [46, 140, 84],
      photo: PHOTO,
      borderWidth: 10,
    });

    const result = detectInstaxQuad(rgba, w, h);

    expect(result).not.toBeNull();
    expectQuadClose(result!.quad, corners.map((p) => ({ x: p.x / w, y: p.y / h })));
  });

  it('rejects a low-contrast image with no card (falls back to manual)', () => {
    const w = 192;
    const h = 256;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      const value = 200 + ((i / 4) % 8); // nearly uniform bright background
      rgba[i] = value;
      rgba[i + 1] = value;
      rgba[i + 2] = value;
      rgba[i + 3] = 255;
    }

    const result = detectInstaxQuad(rgba, w, h);

    expect(result).toBeNull();
  });

  it('rejects a too-small card (below the minimum area)', () => {
    const w = 192;
    const h = 256;
    const corners = centeredCard(w, h, 60, 60);
    const rgba = makeCardImage(w, h, corners, { background: DARK_BG, border: WHITE_BORDER, photo: PHOTO, borderWidth: 6 });

    expect(detectInstaxQuad(rgba, w, h)).toBeNull();
  });

  it('rejects tiny images', () => {
    const rgba = new Uint8Array(16 * 16 * 4);
    expect(detectInstaxQuad(rgba, 16, 16)).toBeNull();
  });

  it('ratioAccepted filters per preset', () => {
    expect(ratioAccepted(0.636, 'mini')).toBe(true);
    expect(ratioAccepted(1.0, 'mini')).toBe(false);
    expect(ratioAccepted(1.0, 'square')).toBe(true);
    expect(ratioAccepted(0.636, 'wide')).toBe(true);
    expect(ratioAccepted(1.59, 'wide')).toBe(true);
    expect(ratioAccepted(1.0, 'wide')).toBe(false);
    expect(ratioAccepted(1.0, 'auto')).toBe(true);
  });

  it('expandQuadForPreset grows a mini photo-area quad to the full card', () => {
    const photoArea = {
      tl: { x: 0.3, y: 0.35 },
      tr: { x: 0.7, y: 0.35 },
      br: { x: 0.7, y: 0.65 },
      bl: { x: 0.3, y: 0.65 },
    };
    const expanded = expandQuadForPreset(photoArea, 'mini');
    // Centre stays put; each axis scales by the card/photo ratio of instax mini.
    expect(expanded.tl.x).toBeCloseTo(0.5 - 0.2 * (54 / 46), 4);
    expect(expanded.tl.y).toBeCloseTo(0.5 - 0.15 * (86 / 62), 4);
    expect(expanded.br.x).toBeCloseTo(0.5 + 0.2 * (54 / 46), 4);
    expect(expanded.br.y).toBeCloseTo(0.5 + 0.15 * (86 / 62), 4);
    // A non-expanding preset returns the quad unchanged.
    expect(expandQuadForPreset(photoArea, 'square')).toEqual(photoArea);
  });

  it('mini preset prefers the mini card over a square distractor in the frame', () => {
    const w = 256;
    const h = 256;
    const card = centeredCard(w, h, 130, 205);
    const distractor = [
      { x: 176, y: 20 },
      { x: 246, y: 20 },
      { x: 246, y: 90 },
      { x: 176, y: 90 },
    ];
    const rgba = makeCardWithDistractor(w, h, card, distractor);

    const result = detectInstaxQuad(rgba, w, h, 'mini');

    expect(result).not.toBeNull();
    // Must be the portrait mini card, not the square distractor.
    const quad = result!.quad;
    const ratio = ((quad.tr.x - quad.tl.x) * w) / Math.max(1e-6, (quad.bl.y - quad.tl.y) * h);
    expect(Math.abs(ratio - 130 / 205)).toBeLessThan(0.08);
  });
});

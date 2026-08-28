import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import type { PerspectiveQuad, Point } from '@/utils/geometry';

export interface InstaxDetection {
  /** Card corners normalized to 0..1 in the ORIGINAL image's pixel space. */
  quad: PerspectiveQuad;
  /** 0..1 – mean inlier ratio of the four fitted edges. */
  confidence: number;
}

/** Detection target; constrains the accepted aspect ratio (and expands the
 * border for the classic white instax mini). */
export type InstaxPreset = 'auto' | 'mini' | 'square' | 'wide';

export const INSTAX_PRESETS: { key: InstaxPreset; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'mini', label: 'Mini' },
  { key: 'square', label: 'Square' },
  { key: 'wide', label: 'Wide' },
];

/**
 * Accepted card aspect ratio ranges (width/height) per preset. Mini and Wide
 * can both be held either way.
 */
const PRESET_RATIO_RANGES: Record<InstaxPreset, [number, number][]> = {
  auto: [[0.45, 1.7]],
  mini: [
    [0.5, 0.8],
    [1.25, 1.7],
  ],
  square: [[0.82, 1.25]],
  wide: [
    [0.5, 0.72],
    [1.4, 1.8],
  ],
};

/**
 * Full-card / photo-area scale per axis, used to grow an inner-card detection
 * to the actual card border. Instax mini: 54×86mm card around a 46×62mm image.
 */
const PRESET_EXPANSION: Record<InstaxPreset, { x: number; y: number }> = {
  auto: { x: 1, y: 1 },
  mini: { x: 54 / 46, y: 86 / 62 },
  square: { x: 1, y: 1 },
  wide: { x: 1, y: 1 },
};

/** Aspect ratio of a full instax mini card (54mm / 86mm). */
const MINI_CARD_RATIO = 54 / 86;

/** Reference card aspect ratios used to disambiguate multiple detections. */
const PRESET_TARGET_RATIOS: Record<InstaxPreset, number[]> = {
  auto: [],
  mini: [MINI_CARD_RATIO, 1 / MINI_CARD_RATIO],
  square: [1],
  wide: [62 / 99, 99 / 62], // 0.626 portrait or 1.596 landscape
};

function distanceToTargetRatio(ratio: number, preset: InstaxPreset): number {
  const targets = PRESET_TARGET_RATIOS[preset];
  if (targets.length === 0) return Infinity;
  return Math.min(...targets.map((target) => Math.abs(ratio - target)));
}

/**
 * Disambiguates the bright/dark interpretations. For a concrete size preset we
 * pick whichever candidate is closest to the target card ratio – a shadow or a
 * background object rarely matches, so the real card wins. For `auto` we fall
 * back to edge confidence and prefer the brighter card on a tie.
 */
function chooseQuad(
  bright: { corners: { x: number; y: number }[]; confidence: number } | null,
  dark: { corners: { x: number; y: number }[]; confidence: number } | null,
  preset: InstaxPreset,
): { corners: { x: number; y: number }[]; confidence: number } | null {
  if (!bright) return dark;
  if (!dark) return bright;
  const brightDist = distanceToTargetRatio(quadSideRatio(bright.corners), preset);
  const darkDist = distanceToTargetRatio(quadSideRatio(dark.corners), preset);
  const hasTarget = Number.isFinite(brightDist);
  if (hasTarget && brightDist !== darkDist) return brightDist < darkDist ? bright : dark;
  // No target (auto) or tied: prefer the brighter (actual card) interpretation.
  return bright.confidence >= dark.confidence ? bright : dark;
}

const MAX_DETECT_DIM = 256;
const MIN_AREA_FRACTION = 0.12;
const LINE_TOLERANCE_PX = 2.5;
/** A side needs at least this many inlier points. */
const MIN_SIDE_POINTS = 10;
/** Max |slope| (dy/dx) accepted for a fitted side – cards are tilted < ~25°. */
const MAX_SLOPE = 0.6;

/** True when `ratio` (w/h) falls inside any accepted range for the preset. */
export function ratioAccepted(ratio: number, preset: InstaxPreset): boolean {
  return PRESET_RATIO_RANGES[preset].some(([min, max]) => ratio >= min && ratio <= max);
}

/** Scale factors used to grow a normalized quad up to the card border. */
export function expansionScale(preset: InstaxPreset): { x: number; y: number } {
  return PRESET_EXPANSION[preset];
}

/** Grows a quad from the photo area toward the full card for `preset`. */
export function expandQuadForPreset(quad: PerspectiveQuad, preset: InstaxPreset): PerspectiveQuad {
  const factor = PRESET_EXPANSION[preset];
  if (factor.x === 1 && factor.y === 1) return quad;
  const cx = (quad.tl.x + quad.tr.x + quad.br.x + quad.bl.x) / 4;
  const cy = (quad.tl.y + quad.tr.y + quad.br.y + quad.bl.y) / 4;
  const clamp = (p: Point): Point => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) });
  const scale = (p: Point): Point => clamp({ x: cx + (p.x - cx) * factor.x, y: cy + (p.y - cy) * factor.y });
  return { tl: scale(quad.tl), tr: scale(quad.tr), br: scale(quad.br), bl: scale(quad.bl) };
}

/** Uses the matching physical border dimensions when a Mini is landscape. */
function detectedExpansion(preset: InstaxPreset, ratio: number): { x: number; y: number } {
  const factor = PRESET_EXPANSION[preset];
  return preset === 'mini' && ratio > 1 ? { x: factor.y, y: factor.x } : factor;
}

/** Average width/height ratio of a quad ([tl,tr,br,bl]) in pixel space. */
function quadSideRatio(corners: { x: number; y: number }[]): number {
  const [tl, tr, br, bl] = corners;
  const sideW = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - br.x, bl.y - br.y)) / 2;
  const sideH = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2;
  return sideW / Math.max(1, sideH);
}

// ────────────────────────────────────────────────────────────────────────────
// Pure detection core – operates on raw RGBA pixels so it is fully testable
// without native Skia.
// ────────────────────────────────────────────────────────────────────────────

function toGray(rgba: Uint8Array, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return gray;
}

/** Small separable Gaussian approximation to suppress handwriting strokes. */
/** Sobel gradients with SIGN (direction preserved, magnitude clipped). */
function sobelGradient(gray: Float32Array, width: number, height: number): { gx: Float32Array; gy: Float32Array } {
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const tl = gray[(y - 1) * width + (x - 1)];
      const t = gray[(y - 1) * width + x];
      const tr = gray[(y - 1) * width + (x + 1)];
      const l = gray[y * width + (x - 1)];
      const r = gray[y * width + (x + 1)];
      const bl = gray[(y + 1) * width + (x - 1)];
      const b = gray[(y + 1) * width + x];
      const br = gray[(y + 1) * width + (x + 1)];
      const gxv = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gyv = (bl + 2 * b + br) - (tl + 2 * t + tr);
      gx[y * width + x] = Math.max(-255, Math.min(255, gxv));
      gy[y * width + x] = Math.max(-255, Math.min(255, gyv));
    }
  }
  return { gx, gy };
}

/**
 * Edge mask for one side's polarity. `positive` means the card brightens
 * toward that side (top: brighter below, bottom: brighter above, left:
 * brighter right, right: brighter left). Real scenes can have the card either
 * brighter OR darker than the background, so detectors try BOTH polarities and
 * keep the stronger line (see detectSide).
 */
function directionalMask(
  gx: Float32Array,
  gy: Float32Array,
  width: number,
  height: number,
  side: 'top' | 'bottom' | 'left' | 'right',
  positive: boolean,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (side === 'top' || side === 'bottom') {
    for (let i = 0; i < mask.length; i += 1) {
      const v = gy[i];
      mask[i] = positive ? (v > 0 ? 1 : 0) : v < 0 ? 1 : 0;
    }
  } else {
    for (let i = 0; i < mask.length; i += 1) {
      const v = gx[i];
      mask[i] = positive ? (v > 0 ? 1 : 0) : v < 0 ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Fits one side with an explicit polarity (see directionalMask). `top`/
 * `left` use the positive polarity; `bottom`/`right` the negative one.
 */
function sideLine(
  strong: Uint8Array,
  gx: Float32Array,
  gy: Float32Array,
  width: number,
  height: number,
  side: 'top' | 'bottom' | 'left' | 'right',
  cardBrighter: boolean,
): LineFit | null {
  const vertical = side === 'left' || side === 'right';
  // Base polarity per side for a card that is BRIGHTER than its background.
  const basePositive = side === 'top' || side === 'left';
  const polarity = cardBrighter ? basePositive : !basePositive;
  return fitLine(scanEdge(strong, directionalMask(gx, gy, width, height, side, polarity), width, height, side), vertical);
}

/**
 * Builds a complete card quad from a CONSISTENT polarity set (all sides agree
 * whether the card is brighter or darker than the background). Mixing
 * polarities would combine the outer border edge on one side with the inner
 * photo edge on another, producing a distorted quad.
 */
function tryQuadSet(
  strong: Uint8Array,
  gx: Float32Array,
  gy: Float32Array,
  width: number,
  height: number,
  cardBrighter: boolean,
): { corners: { x: number; y: number }[]; confidence: number } | null {
  const top = sideLine(strong, gx, gy, width, height, 'top', cardBrighter);
  const bottom = sideLine(strong, gx, gy, width, height, 'bottom', cardBrighter);
  const left = sideLine(strong, gx, gy, width, height, 'left', cardBrighter);
  const right = sideLine(strong, gx, gy, width, height, 'right', cardBrighter);
  if (!top || !bottom || !left || !right) return null;

  const tl = intersectLines(top.line, left.line);
  const tr = intersectLines(top.line, right.line);
  const bl = intersectLines(bottom.line, left.line);
  const br = intersectLines(bottom.line, right.line);
  if (!tl || !tr || !bl || !br) return null;

  // Corners may overflow the frame slightly; clamp generous while measuring.
  const margin = Math.max(width, height) * 0.08;
  const corners = [tl, tr, br, bl].map((p) => ({
    x: Math.min(Math.max(p.x, -margin), width + margin),
    y: Math.min(Math.max(p.y, -margin), height + margin),
  }));
  const confidence = (top.inlierRatio + bottom.inlierRatio + left.inlierRatio + right.inlierRatio) / 4;
  return { corners, confidence };
}

/** Otsu threshold over a 256-bin histogram; falls back to a fixed floor. */
function otsuThreshold(mag: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < mag.length; i += 1) hist[Math.min(255, mag[i] | 0)] += 1;
  const total = mag.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVariance = 0;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return Math.max(8, best);
}

interface Line2D {
  /** y = a + b·x for horizontal sides; x = a + b·y for vertical sides. */
  a: number;
  b: number;
}

interface LineFit {
  line: Line2D;
  inlierRatio: number;
  pointCount: number;
}

/** Least-squares line through `points` as y = a + b·x. */
function fitLineY(points: { x: number; y: number }[]): Line2D {
  const n = points.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return { a: sy / n, b: 0 };
  const b = (n * sxy - sx * sy) / denom;
  return { a: (sy - b * sx) / n, b };
}

/** Points of one edge: every inward-continuous strong, direction-matched run
 * on each scanline, restricted to the frame half the side belongs to (the card
 * is always smaller than the frame, and this keeps the opposite side out). */
function scanEdge(
  strong: Uint8Array,
  direction: Uint8Array,
  width: number,
  height: number,
  side: 'top' | 'bottom' | 'left' | 'right',
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const step = Math.max(1, Math.round(Math.min(width, height) / 48));
  const matched = (idx: number): boolean => strong[idx] === 1 && direction[idx] === 1;
  if (side === 'top' || side === 'bottom') {
    const startY = side === 'top' ? 0 : Math.ceil(height / 2);
    const endY = side === 'top' ? Math.min(height - 3, Math.floor(height / 2) - 1) : height - 1;
    const inward = startY < endY ? 1 : -1;
    for (let x = 0; x < width; x += step) {
      for (let y = startY; startY < endY ? y <= endY : y >= endY; y += inward) {
        const idx = y * width + x;
        // Continuity in the scan direction filters single-pixel noise while
        // keeping tilted edges detectable.
        if (matched(idx) && matched(idx + inward * width)) points.push({ x, y });
      }
    }
  } else {
    const startX = side === 'left' ? 0 : Math.ceil(width / 2);
    const endX = side === 'left' ? Math.min(width - 3, Math.floor(width / 2) - 1) : width - 1;
    const inward = startX < endX ? 1 : -1;
    for (let y = 0; y < height; y += step) {
      for (let x = startX; startX < endX ? x <= endX : x >= endX; x += inward) {
        const idx = y * width + x;
        if (matched(idx) && matched(idx + inward)) points.push({ x, y });
      }
    }
  }
  return points;
}

/** Finds the first bright run from the frame edge toward the card. */
function scanBrightEdge(
  gray: Float32Array,
  width: number,
  height: number,
  side: 'top' | 'bottom' | 'left' | 'right',
  threshold: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const step = Math.max(1, Math.round(Math.min(width, height) / 48));
  const bright = (idx: number): boolean => gray[idx] >= threshold;
  if (side === 'top' || side === 'bottom') {
    const startY = side === 'top' ? 0 : height - 1;
    const endY = side === 'top' ? Math.min(height - 3, Math.floor(height / 2) - 1) : Math.ceil(height / 2);
    const inward = side === 'top' ? 1 : -1;
    for (let x = 0; x < width; x += step) {
      for (let y = startY; startY < endY ? y <= endY : y >= endY; y += inward) {
        const idx = y * width + x;
        if (bright(idx) && bright(idx + inward * width)) {
          points.push({ x, y });
          break;
        }
      }
    }
  } else {
    const startX = side === 'left' ? 0 : width - 1;
    const endX = side === 'left' ? Math.min(width - 3, Math.floor(width / 2) - 1) : Math.ceil(width / 2);
    const inward = side === 'left' ? 1 : -1;
    for (let y = 0; y < height; y += step) {
      for (let x = startX; startX < endX ? x <= endX : x >= endX; x += inward) {
        const idx = y * width + x;
        if (bright(idx) && bright(idx + inward)) {
          points.push({ x, y });
          break;
        }
      }
    }
  }
  return points;
}

/**
 * Fits the strongest line through the candidates. A tilted card's scanline
 * points mix several parallel edges (outer border, inner photo edge, the
 * opposite side), so a plain least-squares fit fails. Instead, seed candidate
 * lines from spread point pairs, keep the model with the most inliers, and
 * re-fit on those. Deterministic (no random sampling).
 */
function fitLine(points: { x: number; y: number }[], vertical: boolean): LineFit | null {
  if (points.length < 6) return null;
  const mapped = points.map((p) => (vertical ? { x: p.y, y: p.x } : p));
  const residual = (p: { x: number; y: number }, line: Line2D) =>
    (vertical ? Math.abs(p.x - (line.a + line.b * p.y)) : Math.abs(p.y - (line.a + line.b * p.x)));

  // Fine-grained deterministic seeds: coarse fractions (0.1 steps) can miss
  // pairs on the same true edge, letting a polluted model win.
  const fractions: number[] = [];
  for (let f = 0.05; f <= 0.95; f += 0.05) fractions.push(f);
  let bestInliers: { x: number; y: number }[] = [];
  let bestScore = 0;
  for (let i = 0; i < fractions.length; i += 1) {
    for (let j = i + 1; j < fractions.length; j += 1) {
      const a = mapped[Math.floor(mapped.length * fractions[i])];
      const b = mapped[Math.floor(mapped.length * fractions[j])];
      if (Math.abs(b.x - a.x) < 1e-9) continue;
      const slope = (b.y - a.y) / (b.x - a.x);
      // Reject near-vertical models: the scan can pick up the card's own side
      // edge as a long vertical run, which must never win a horizontal side.
      if (Math.abs(slope) > MAX_SLOPE) continue;
      const line: Line2D = { a: a.y - slope * a.x, b: slope };
      const inliers = points.filter((p) => residual(p, line) <= LINE_TOLERANCE_PX);
      // A handwriting stroke can produce many nearby inliers, but a card edge
      // has support across most of the side. Rank both properties so short
      // internal marks cannot replace the document boundary.
      const longitudinal = inliers.map((p) => (vertical ? p.y : p.x));
      const extent = longitudinal.length > 0 ? Math.max(...longitudinal) - Math.min(...longitudinal) : 0;
      const score = (extent * inliers.length) / Math.max(1, points.length);
      if (score > bestScore || (score === bestScore && inliers.length > bestInliers.length)) {
        bestScore = score;
        bestInliers = inliers;
      }
    }
  }
  // Absolute floor only: the scan also collects long vertical runs along the
  // card's own sides (a tilted card's side edge, the border's inner edge), so
  // a percentage-based floor would reject the true outer edge.
  const minInliers = MIN_SIDE_POINTS;
  if (bestInliers.length < minInliers) return null;
  const refinedMapped = bestInliers.map((p) => (vertical ? { x: p.y, y: p.x } : p));
  const refined = fitLineY(refinedMapped);
  return { line: refined, inlierRatio: bestInliers.length / points.length, pointCount: bestInliers.length };
}

/**
 * Intersection of a horizontal line (y = ha + hb·x) and a vertical line
 * (x = va + vb·y). Degenerate (axis-aligned) lines are handled explicitly.
 */
function intersectLines(h: Line2D, v: Line2D): { x: number; y: number } | null {
  if (Math.abs(v.b) < 1e-6) {
    // v is vertical: x = va. If h is also axis-aligned its y is constant too.
    const x = v.a;
    return { x, y: Math.abs(h.b) < 1e-6 ? h.a : h.a + h.b * x };
  }
  if (Math.abs(h.b) < 1e-6) return { x: v.a + v.b * h.a, y: h.a };
  // y = ha + hb·(va + vb·y)  →  y·(1 − hb·vb) = ha + hb·va
  const denominator = 1 - h.b * v.b;
  if (Math.abs(denominator) < 1e-6) return null;
  const y = (h.a + h.b * v.a) / denominator;
  const x = v.a + v.b * y;
  return { x, y };
}

function brightBoundaryQuad(gray: Float32Array, width: number, height: number, threshold: number): { corners: { x: number; y: number }[]; confidence: number } | null {
  const top = fitLine(scanBrightEdge(gray, width, height, 'top', threshold), false);
  const bottom = fitLine(scanBrightEdge(gray, width, height, 'bottom', threshold), false);
  const left = fitLine(scanBrightEdge(gray, width, height, 'left', threshold), true);
  const right = fitLine(scanBrightEdge(gray, width, height, 'right', threshold), true);
  if (!top || !bottom || !left || !right) return null;

  const tl = intersectLines(top.line, left.line);
  const tr = intersectLines(top.line, right.line);
  const bl = intersectLines(bottom.line, left.line);
  const br = intersectLines(bottom.line, right.line);
  if (!tl || !tr || !bl || !br) return null;

  const margin = Math.max(width, height) * 0.08;
  const corners = [tl, tr, br, bl].map((p) => ({
    x: Math.min(Math.max(p.x, -margin), width + margin),
    y: Math.min(Math.max(p.y, -margin), height + margin),
  }));
  return {
    corners,
    confidence: (top.inlierRatio + bottom.inlierRatio + left.inlierRatio + right.inlierRatio) / 4,
  };
}

function quadArea(corners: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function quadGeometryAccepted(corners: { x: number; y: number }[], width: number, height: number, preset: InstaxPreset): boolean {
  if (!ratioAccepted(quadSideRatio(corners), preset)) return false;
  if (quadArea(corners) < width * height * MIN_AREA_FRACTION) return false;
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const c = corners[(i + 2) % 4];
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const cb = { x: b.x - c.x, y: b.y - c.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const len = Math.max(1e-6, Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y));
    if (Math.abs(dot / len) > Math.cos((Math.PI * 70) / 180)) return false;
  }
  return true;
}

/**
 * Detects an instax card in an RGBA image. Pure and deterministic – no native
 * APIs, so it is unit-testable. For the `mini` preset the detection is
 * interpreted as the photo area and expanded to the full printed border when
 * that yields a card-aspect result (handles the classic white instax mini shot
 * on a bright background, where only the inner photo edge has contrast).
 */
export function detectInstaxQuad(
  rgba: Uint8Array,
  width: number,
  height: number,
  preset: InstaxPreset = 'mini',
): InstaxDetection | null {
  if (width < 24 || height < 24) return null;
  const gray = toGray(rgba, width, height);
  const brightThreshold = Math.min(245, Math.max(160, otsuThreshold(gray) + 8));
  const boundary = brightBoundaryQuad(gray, width, height, brightThreshold);
  const { gx, gy } = sobelGradient(gray, width, height);
  const mag = new Float32Array(width * height);
  for (let i = 0; i < mag.length; i += 1) mag[i] = Math.min(255, Math.hypot(gx[i], gy[i]));
  const threshold = Math.max(12, otsuThreshold(mag));
  const strong = new Uint8Array(width * height);
  for (let i = 0; i < mag.length; i += 1) strong[i] = mag[i] >= threshold ? 1 : 0;

  const bright = tryQuadSet(strong, gx, gy, width, height, true);
  const dark = tryQuadSet(strong, gx, gy, width, height, false);
  const gradientChosen = chooseQuad(bright, dark, preset);
  const boundaryChosen = boundary
    && quadArea(boundary.corners) < width * height * 0.85
    && quadGeometryAccepted(boundary.corners, width, height, preset)
    ? boundary
    : null;
  if (!boundaryChosen && !gradientChosen) return null;
  const chosen = boundaryChosen ?? gradientChosen;
  if (!chosen) return null;
  let corners = chosen.corners;
  let confidence = chosen.confidence;

  // Mini: prefer the interpretation (photoarea vs full card) whose aspect ends
  // up closest to the known mini card ratio.
  if (preset === 'mini') {
    const factor = detectedExpansion(preset, quadSideRatio(corners));
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4;
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
    const expanded = corners.map((p) => ({ x: cx + (p.x - cx) * factor.x, y: cy + (p.y - cy) * factor.y }));
    if (Math.abs(quadSideRatio(expanded) - MINI_CARD_RATIO) < Math.abs(quadSideRatio(corners) - MINI_CARD_RATIO)) {
      corners = expanded;
    }
  }

  if (!quadGeometryAccepted(corners, width, height, preset)) return null;

  const quad: PerspectiveQuad = {
    tl: { x: clamp01(corners[0].x / width), y: clamp01(corners[0].y / height) },
    tr: { x: clamp01(corners[1].x / width), y: clamp01(corners[1].y / height) },
    br: { x: clamp01(corners[2].x / width), y: clamp01(corners[2].y / height) },
    bl: { x: clamp01(corners[3].x / width), y: clamp01(corners[3].y / height) },
  };
  return { quad, confidence };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// ────────────────────────────────────────────────────────────────────────────
// Skia wrapper – decodes, downscales, and feeds pixels to the core detector.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Detects an instax card in an image file (`preset` restricts the accepted
 * aspect ratio and applies border expansion for `mini`). Returns the card
 * corners normalized to the ORIGINAL image or null when nothing plausible is
 * found.
 */
export async function detectInstaxFromUri(uri: string, preset: InstaxPreset = 'mini'): Promise<InstaxDetection | null> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Instax detection failed: could not decode the image');
  const iw = image.width();
  const ih = image.height();
  const scale = Math.min(1, MAX_DETECT_DIM / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.drawImageRect(
    image,
    { x: 0, y: 0, width: iw, height: ih },
    { x: 0, y: 0, width: w, height: h },
    Skia.Paint(),
  );
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const pixels = snapshot.readPixels(0, 0, {
    width: w,
    height: h,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) return null;
  const bytes = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  return detectInstaxQuad(bytes, w, h, preset);
}

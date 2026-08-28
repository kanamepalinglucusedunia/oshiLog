/** A 2D point (normalized 0..1 or pixel coordinates). */
export type Point = { x: number; y: number };

/** Four corner points in `tl → tr → br → bl` order (clockwise from top-left). */
export type PerspectiveQuad = {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Full-frame quadrilateral in normalized space (identity – no correction). */
export function defaultQuad(): PerspectiveQuad {
  return { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } };
}

export function isIdentityQuad(quad: PerspectiveQuad, epsilon = 0.001): boolean {
  const identity = defaultQuad();
  return (
    Math.abs(quad.tl.x - identity.tl.x) <= epsilon &&
    Math.abs(quad.tl.y - identity.tl.y) <= epsilon &&
    Math.abs(quad.tr.x - identity.tr.x) <= epsilon &&
    Math.abs(quad.tr.y - identity.tr.y) <= epsilon &&
    Math.abs(quad.br.x - identity.br.x) <= epsilon &&
    Math.abs(quad.br.y - identity.br.y) <= epsilon &&
    Math.abs(quad.bl.x - identity.bl.x) <= epsilon &&
    Math.abs(quad.bl.y - identity.bl.y) <= epsilon
  );
}

/** Scales normalized quad coordinates into pixel space. */
export function quadToPixels(quad: PerspectiveQuad, width: number, height: number): PerspectiveQuad {
  const scale = (p: Point): Point => ({ x: p.x * width, y: p.y * height });
  return { tl: scale(quad.tl), tr: scale(quad.tr), br: scale(quad.br), bl: scale(quad.bl) };
}

/** Moves a single corner by normalized deltas, clamped to stay inside the frame. */
export function moveQuadCorner(
  quad: PerspectiveQuad,
  corner: keyof PerspectiveQuad,
  dx: number,
  dy: number,
  margin = 0.02,
): PerspectiveQuad {
  const current = quad[corner];
  return { ...quad, [corner]: { x: clamp(current.x + dx, margin, 1 - margin), y: clamp(current.y + dy, margin, 1 - margin) } };
}

/** Solves `A * x = b` for an n×n system using Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) {
      throw new Error('Singular homography system');
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const divisor = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

/**
 * Computes a 2D homography mapping the four `src` corners to the four `dst`
 * corners (both in `tl,tr,br,bl` order). Returns a row-major 3x3 matrix
 * [a,b,c, d,e,f, g,h,i] with the bottom-right entry normalized to 1.
 */
export function computeHomography(src: PerspectiveQuad, dst: PerspectiveQuad): number[] {
  const s = [src.tl, src.tr, src.br, src.bl];
  const d = [dst.tl, dst.tr, dst.br, dst.bl];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = s[i];
    const { x, y } = d[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  return [...solveLinear(A, b), 1];
}

/** Applies a row-major 3x3 homography to a point (homogeneous, perspective divide). */
export function applyHomography(h: number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  const inverse = w === 0 ? 1e9 : 1 / w;
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) * inverse,
    y: (h[3] * p.x + h[4] * p.y + h[5]) * inverse,
  };
}

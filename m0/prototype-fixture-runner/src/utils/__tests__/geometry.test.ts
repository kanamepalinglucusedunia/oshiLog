import {
  applyHomography,
  computeHomography,
  defaultQuad,
  isIdentityQuad,
  moveQuadCorner,
  quadToPixels,
  type PerspectiveQuad,
} from '../geometry';

const quad = (tl: [number, number], tr: [number, number], br: [number, number], bl: [number, number]): PerspectiveQuad => ({
  tl: { x: tl[0], y: tl[1] },
  tr: { x: tr[0], y: tr[1] },
  br: { x: br[0], y: br[1] },
  bl: { x: bl[0], y: bl[1] },
});

function expectMatrix(actual: number[], expected: number[], digits = 6) {
  expect(actual).toHaveLength(9);
  for (let i = 0; i < 9; i++) expect(actual[i]).toBeCloseTo(expected[i], digits);
}

describe('geometry', () => {
  describe('defaultQuad / isIdentityQuad', () => {
    it('returns the full-frame quad and recognizes it as identity', () => {
      expect(defaultQuad()).toEqual({ tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } });
      expect(isIdentityQuad(defaultQuad())).toBe(true);
    });

    it('rejects quads whose corners leave the full frame', () => {
      expect(isIdentityQuad(quad([0.05, 0], [1, 0], [1, 1], [0, 1]))).toBe(false);
    });
  });

  describe('quadToPixels', () => {
    it('scales normalized corners into pixel space', () => {
      const pixels = quadToPixels(defaultQuad(), 400, 300);
      expect(pixels.tl).toEqual({ x: 0, y: 0 });
      expect(pixels.tr).toEqual({ x: 400, y: 0 });
      expect(pixels.br).toEqual({ x: 400, y: 300 });
      expect(pixels.bl).toEqual({ x: 0, y: 300 });
    });
  });

  describe('moveQuadCorner', () => {
    it('moves only the given corner and leaves the rest untouched', () => {
      const start = quad([0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]);
      const next = moveQuadCorner(start, 'tl', 0.1, -0.05);
      expect(next.tl.x).toBeCloseTo(0.3, 9);
      expect(next.tl.y).toBeCloseTo(0.15, 9);
      expect(next.tr).toEqual(start.tr);
      expect(next.br).toEqual(start.br);
      expect(next.bl).toEqual(start.bl);
    });

    it('clamps corners inside the frame with a margin', () => {
      const next = moveQuadCorner(defaultQuad(), 'br', 10, -10);
      expect(next.br.x).toBeCloseTo(0.98, 6);
      expect(next.br.y).toBeCloseTo(0.02, 6);
    });
  });

  describe('computeHomography', () => {
    it('maps each source corner to its destination corner', () => {
      const src = quad([0, 0], [400, 0], [400, 300], [0, 300]);
      // A keystone: top edge pulled inward.
      const dst = quad([60, 0], [340, 0], [400, 300], [0, 300]);
      const h = computeHomography(src, dst);
      const corners = [
        { label: 'tl', p: src.tl, expected: dst.tl },
        { label: 'tr', p: src.tr, expected: dst.tr },
        { label: 'br', p: src.br, expected: dst.br },
        { label: 'bl', p: src.bl, expected: dst.bl },
      ];
      for (const { p, expected } of corners) {
        const mapped = applyHomography(h, p);
        expect(mapped.x).toBeCloseTo(expected.x, 4);
        expect(mapped.y).toBeCloseTo(expected.y, 4);
      }
    });

    it('reproduces a pure translation', () => {
      const h = computeHomography(quad([0, 0], [4, 0], [4, 3], [0, 3]), quad([2, 1], [6, 1], [6, 4], [2, 4]));
      expectMatrix(h, [1, 0, 2, 0, 1, 1, 0, 0, 1]);
    });

    it('reproduces a uniform scale', () => {
      const h = computeHomography(quad([0, 0], [2, 0], [2, 2], [0, 2]), quad([0, 0], [4, 0], [4, 4], [0, 4]));
      expectMatrix(h, [2, 0, 0, 0, 2, 0, 0, 0, 1]);
    });

    it('returns identity when source and destination match', () => {
      expectMatrix(computeHomography(defaultQuad(), defaultQuad()), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    });

    it('produces a projective (non-affine) matrix for a trapezoid', () => {
      const h = computeHomography(quad([0, 0], [100, 0], [100, 100], [0, 100]), quad([25, 0], [75, 0], [100, 100], [0, 100]));
      // The last row must carry real perspective weight for this mapping.
      expect(Math.abs(h[6]) + Math.abs(h[7])).toBeGreaterThan(1e-6);
    });
  });

});

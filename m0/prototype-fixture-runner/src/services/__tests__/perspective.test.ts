import { perspectiveHomography, perspectiveOutputSize, perspectiveWarpUri } from '../perspective';
import { applyHomography, defaultQuad, quadToPixels, type PerspectiveQuad } from '@/utils/geometry';

const quad: PerspectiveQuad = {
  tl: { x: 0.1, y: 0.08 },
  tr: { x: 0.9, y: 0.04 },
  br: { x: 0.96, y: 0.94 },
  bl: { x: 0.05, y: 0.9 },
};

describe('perspectiveWarpUri', () => {
  it('returns the source uri unchanged for an identity quad without touching Skia', async () => {
    const uri = 'file:///source.jpg';
    expect(await perspectiveWarpUri(uri, defaultQuad())).toBe(uri);
  });

  it('maps the selected source quad onto the output frame', () => {
    const width = 400;
    const height = 300;
    const matrix = perspectiveHomography(quad, width, height, width, height);
    const source = quadToPixels(quad, width, height);
    const target = defaultQuad();
    const targetPixels = quadToPixels(target, width, height);

    for (const [corner, expected] of [
      ['tl', targetPixels.tl],
      ['tr', targetPixels.tr],
      ['br', targetPixels.br],
      ['bl', targetPixels.bl],
    ] as const) {
      const actual = applyHomography(matrix, source[corner]);
      expect(actual.x).toBeCloseTo(expected.x, 4);
      expect(actual.y).toBeCloseTo(expected.y, 4);
    }
  });

  it('maps source pixels to a differently sized output frame', () => {
    const sourceWidth = 3000;
    const sourceHeight = 4000;
    const output = perspectiveOutputSize(quad, sourceWidth, sourceHeight);
    const matrix = perspectiveHomography(quad, sourceWidth, sourceHeight, output.width, output.height);
    const source = quadToPixels(quad, sourceWidth, sourceHeight);
    const targetPixels = quadToPixels(defaultQuad(), output.width, output.height);

    for (const [corner, expected] of [
      ['tl', targetPixels.tl],
      ['tr', targetPixels.tr],
      ['br', targetPixels.br],
      ['bl', targetPixels.bl],
    ] as const) {
      const actual = applyHomography(matrix, source[corner]);
      expect(actual.x).toBeCloseTo(expected.x, 4);
      expect(actual.y).toBeCloseTo(expected.y, 4);
    }
  });

  it('sizes the output to the quad aspect instead of the source frame', () => {
    // Portrait photo (3:4) containing a landscape card quad (~4:3).
    const size = perspectiveOutputSize(
      {
        tl: { x: 0.1, y: 0.35 },
        tr: { x: 0.9, y: 0.35 },
        br: { x: 0.9, y: 0.8 },
        bl: { x: 0.1, y: 0.8 },
      },
      3000,
      4000,
    );

    expect(size.width).toBe(3000);
    expect(size.height).toBeLessThan(4000);
    expect(Math.abs(size.width / size.height - 4 / 3)).toBeLessThan(0.02);
  });

  it('keeps a portrait quad portrait', () => {
    const size = perspectiveOutputSize(
      {
        tl: { x: 0.3, y: 0.05 },
        tr: { x: 0.7, y: 0.05 },
        br: { x: 0.7, y: 0.95 },
        bl: { x: 0.3, y: 0.95 },
      },
      3000,
      4000,
    );

    expect(size.height).toBe(4000);
    expect(Math.abs(size.width / size.height - 1 / 3)).toBeLessThan(0.02);
  });
});

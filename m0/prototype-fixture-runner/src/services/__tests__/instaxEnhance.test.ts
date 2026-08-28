import {
  buildEnhanceColorMatrix,
  composeColorMatrices,
  computeEnhanceStats,
  type EnhanceStats,
} from '../instaxEnhance';

function solidImage(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  }
  return rgba;
}

const NEUTRAL: EnhanceStats = { blackPoint: 0.1, whitePoint: 0.9, redGain: 1, blueGain: 1 };

describe('computeEnhanceStats', () => {
  it('detects a dark image and returns a low black point', () => {
    const stats = computeEnhanceStats(solidImage(8, 8, 30, 30, 30), 8, 8);
    expect(stats.blackPoint).toBeCloseTo(30 / 255, 2);
    expect(stats.whitePoint).toBeGreaterThanOrEqual(0.55);
  });

  it('balances a warm (yellow-ish) image toward neutral', () => {
    // Neutral-ish pixels with a warm cast → blue gain should rise.
    const rgba = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 200;
      rgba[i + 1] = 185;
      rgba[i + 2] = 160;
      rgba[i + 3] = 255;
    }
    const stats = computeEnhanceStats(rgba, 8, 8);
    expect(stats.blueGain).toBeGreaterThan(1.05);
    expect(stats.redGain).toBeLessThan(0.98);
  });
});

describe('buildEnhanceColorMatrix', () => {
  it('maps the neutral black point to zero and white point to one', () => {
    const matrix = buildEnhanceColorMatrix(NEUTRAL, 1);
    expect(matrix).toHaveLength(20);
    // Neutral input (x,x,x) → levels only: row sum ≡ scale, plus the offset.
    const rowR = matrix[0] + matrix[1] + matrix[2];
    expect(rowR * 0.1 + matrix[4]).toBeCloseTo(0, 4);
    expect(rowR * 0.9 + matrix[4]).toBeCloseTo(1, 4);
  });

  it('increases saturation with intensity', () => {
    const light = buildEnhanceColorMatrix(NEUTRAL, 1);
    const strong = buildEnhanceColorMatrix(NEUTRAL, 2);
    // Diagonal entries move further away from the identity as saturation grows.
    expect(Math.abs(strong[0] - 1)).toBeGreaterThan(Math.abs(light[0] - 1));
  });

  it('applies white-balance gains', () => {
    const matrix = buildEnhanceColorMatrix({ ...NEUTRAL, redGain: 1.2, blueGain: 0.8 }, 1);
    // Diagonal scales per channel: R boosted, B reduced relative to G.
    expect(matrix[0]).toBeGreaterThan(matrix[6]); // R diagonal > G diagonal
    expect(matrix[12]).toBeLessThan(matrix[6]); // B diagonal < G diagonal
  });
});

describe('composeColorMatrices', () => {
  it('composes offsets correctly', () => {
    const a = buildEnhanceColorMatrix(NEUTRAL, 1);
    const identity = composeColorMatrices(a, [
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ] as const);
    expect(identity).toEqual(a);
  });
});

import { calculateContrastRatio, getAccessibleOnAccentColor, generateAccentShades, calculateRelativeLuminance } from '../accentGenerator';
import { withAlpha } from '../colors';

describe('accent generator', () => {
  it('handles 3-digit hex inputs', () => {
    expect(calculateRelativeLuminance('#000')).toBe(0);
    expect(calculateRelativeLuminance('#fff')).toBe(1);
    expect(withAlpha('#7F6', 0.5)).toMatch(/^rgba\(/);
  });
  it('computes WCAG contrast ratio', () => {
    expect(calculateContrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(calculateContrastRatio('#000000', '#000000')).toBeCloseTo(1, 0);
  });

  it('computes relative luminance', () => {
    expect(calculateRelativeLuminance('#000000')).toBe(0);
    expect(calculateRelativeLuminance('#FFFFFF')).toBe(1);
  });

  it('chooses white foreground for dark accents and black for light ones', () => {
    expect(getAccessibleOnAccentColor('#000000')).toBe('#FFFFFF');
    expect(getAccessibleOnAccentColor('#FFFFFF')).toBe('#000000');
  });

  it('derives pressed, surface, and onAccent shades', () => {
    const shades = generateAccentShades('#7F6EB5');
    expect(shades.accent).toBe('#7F6EB5');
    expect(shades.accentPressed).toMatch(/^#[0-9A-F]{6}$/);
    expect(shades.accentSurface).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('guarantees safe contrast for onAccent (3.5:1+ or best effort)', () => {
    for (const hex of ['#7F6EB5', '#D65A7B', '#4A9BC7', '#2E9E6B', '#C98A2D', '#D96C4F', '#2E9E9E', '#5B6CC6', '#000000', '#FFFFFF']) {
      const { accent, onAccent } = generateAccentShades(hex);
      const ratio = calculateContrastRatio(accent, onAccent);
      expect(ratio).toBeGreaterThanOrEqual(3.5);
    }
  });
});

/**
 * Utility for deriving accent color shades and WCAG 2.1 compliant foreground colors.
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex;

  const num = parseInt(fullHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = ((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0');
  return `#${hex.toUpperCase()}`;
}

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB color.
 * L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin
 */
export function calculateRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);

  const linearize = (val: number) => {
    const c = val / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculates contrast ratio between two colors (1 to 21).
 */
export function calculateContrastRatio(hex1: string, hex2: string): number {
  const l1 = calculateRelativeLuminance(hex1);
  const l2 = calculateRelativeLuminance(hex2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Derives foreground text color (#000000 vs #FFFFFF) for accent backgrounds.
 * Uses black (#000000) only for very high-luminance accents (e.g. bright yellow/pure white),
 * and clean white (#FFFFFF) for standard and dark accents.
 */
export function getAccessibleOnAccentColor(accentHex: string): '#000000' | '#FFFFFF' {
  const luminance = calculateRelativeLuminance(accentHex);
  return luminance > 0.25 ? '#000000' : '#FFFFFF';
}

/**
 * Generates pressed variant (slightly darker) and surface tint (light tint) for accent.
 */
export function generateAccentShades(accentHex: string) {
  const { r, g, b } = hexToRgb(accentHex);

  // Pressed: 15% darker
  const accentPressed = rgbToHex(r * 0.85, g * 0.85, b * 0.85);

  // Surface tint: blended 95% with white for elements (chips, badges, active tabs)
  const accentSurface = rgbToHex(
    r * 0.05 + 255 * 0.95,
    g * 0.05 + 255 * 0.95,
    b * 0.05 + 255 * 0.95
  );

  // Soft accent (P75): blended 60% with white
  const accentSoft = rgbToHex(
    r * 0.4 + 255 * 0.6,
    g * 0.4 + 255 * 0.6,
    b * 0.4 + 255 * 0.6
  );

  // Muted accent (P100): blended 45% with white
  const accentMuted = rgbToHex(
    r * 0.55 + 255 * 0.45,
    g * 0.55 + 255 * 0.45,
    b * 0.55 + 255 * 0.45
  );

  // Strong muted accent (P200): blended 20% with white
  const accentStrong = rgbToHex(
    r * 0.8 + 255 * 0.2,
    g * 0.8 + 255 * 0.2,
    b * 0.8 + 255 * 0.2
  );

  const onAccent = getAccessibleOnAccentColor(accentHex);

  return {
    accent: accentHex.toUpperCase(),
    accentPressed,
    accentSurface,
    accentSoft,
    accentMuted,
    accentStrong,
    onAccent,
  };
}

/**
 * Generates accent shades for dark surfaces: tints blended toward black
 * instead of white, so accent-tinted surfaces stay low-key on dark themes.
 */
export function generateDarkAccentShades(accentHex: string) {
  const { r, g, b } = hexToRgb(accentHex);

  const blend = (factor: number) =>
    rgbToHex(r * factor, g * factor, b * factor);

  // Pressed: 15% darker (buttons keep the same accent base in both modes)
  const accentPressed = rgbToHex(r * 0.85, g * 0.85, b * 0.85);

  return {
    accent: accentHex.toUpperCase(),
    accentPressed,
    accentSurface: blend(0.09),
    accentSoft: blend(0.24),
    accentMuted: blend(0.36),
    accentStrong: blend(0.5),
    onAccent: getAccessibleOnAccentColor(accentHex),
  };
}

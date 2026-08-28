import { BLACK_SCALE, GREEN_SCALE, RED_SCALE, YELLOW_SCALE, generatePrimaryScale } from './colors';
import { generateAccentShades, generateDarkAccentShades } from './accentGenerator';
import { getSurfaceTokens, RADIUS, SPACING, type SurfaceStyle, type ThemeTokens } from './theme';
import type { ThemeMode } from '@/types/domain';

const LIGHT_NEUTRALS = {
  surface: BLACK_SCALE.B0,
  surfaceMuted: BLACK_SCALE.B10,
  text: BLACK_SCALE.B700,
  textMuted: BLACK_SCALE.B200,
  border: BLACK_SCALE.B700,
  borderLight: BLACK_SCALE.B30,
};

const DARK_NEUTRALS = {
  background: '#121216',
  surface: '#1C1C22',
  surfaceMuted: '#26262E',
  text: '#F4F4F6',
  textMuted: '#9A9AA6',
  border: '#6E6E7A',
  borderLight: '#33333D',
};

export function buildTheme(surfaceStyle: SurfaceStyle, accentColor: string, mode: ThemeMode = 'light'): ThemeTokens {
  const dark = mode === 'dark';
  const shades = dark ? generateDarkAccentShades(accentColor) : generateAccentShades(accentColor);
  const neutrals = dark ? DARK_NEUTRALS : LIGHT_NEUTRALS;
  const primaryScale = generatePrimaryScale(accentColor);

  return {
    color: {
      // Light mode backgrounds use the P10 tint; dark mode uses a neutral base.
      background: dark ? DARK_NEUTRALS.background : primaryScale.P10,
      surface: neutrals.surface,
      surfaceMuted: neutrals.surfaceMuted,
      text: neutrals.text,
      textMuted: neutrals.textMuted,
      accent: shades.accent,
      accentPressed: shades.accentPressed,
      accentSurface: shades.accentSurface,
      accentSoft: shades.accentSoft,
      accentMuted: shades.accentMuted,
      accentStrong: shades.accentStrong,
      onAccent: shades.onAccent,
      border: neutrals.border,
      borderLight: neutrals.borderLight,
      success: GREEN_SCALE.G300,
      warning: YELLOW_SCALE.Y300,
      danger: RED_SCALE.R200,
    },
    surface: getSurfaceTokens(surfaceStyle, { borderColor: dark ? neutrals.border : undefined, dark }),
    spacing: SPACING,
    radius: RADIUS,
  };
}

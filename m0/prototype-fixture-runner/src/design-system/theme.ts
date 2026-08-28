import { BLACK_SCALE, DEFAULT_PRIMARY_SCALE, GREEN_SCALE, RED_SCALE, YELLOW_SCALE } from './colors';
export type SurfaceStyle = 'outline' | 'soft-shadow';

export * from './typography';
export * from './colors';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  accent: string;
  accentPressed: string;
  accentSurface: string;
  accentSoft: string;
  accentMuted: string;
  accentStrong: string;
  onAccent: string;
  border: string;
  borderLight: string;
  success: string;
  warning: string;
  danger: string;
}

export interface SurfaceTokens {
  style: SurfaceStyle;
  borderWidth: number;
  borderColor: string;
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface ThemeTokens {
  color: ThemeColors;
  surface: SurfaceTokens;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
}

export const BASE_COLORS = {
  background: DEFAULT_PRIMARY_SCALE.P10,
  surface: BLACK_SCALE.B0,
  surfaceMuted: BLACK_SCALE.B10,
  text: BLACK_SCALE.B700,
  textMuted: BLACK_SCALE.B200,
  border: BLACK_SCALE.B700,
  borderLight: BLACK_SCALE.B30,
  success: GREEN_SCALE.G300,
  warning: YELLOW_SCALE.Y300,
  danger: RED_SCALE.R200,
  defaultAccent: DEFAULT_PRIMARY_SCALE.P300,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

/** Standard vertical rhythm between sibling cards. */
export const CARD_STACK_GAP = SPACING.md;

/** Deliberate denser rhythm used only by the combined main Idol/Group tab. */
export const MAIN_IDOL_GROUP_CARD_STACK_GAP = SPACING.sm;

/** Corner radius scale: only 8px and 16px exist (plus the pill shape). */
export const RADIUS = {
  sm: 8,
  md: 16,
  lg: 16,
  pill: 9999,
};

export const DIVIDER_THICKNESS = {
  major: 1,
  inner: 0.5,
} as const;

export const DIVIDER_OPACITY = {
  major: 1,
  inner: 0.15,
} as const;

export function getSurfaceTokens(style: SurfaceStyle, options?: { borderColor?: string; dark?: boolean }): SurfaceTokens {
  const dark = options?.dark ?? false;
  if (style === 'outline') {
    return {
      style: 'outline',
      borderWidth: 1,
      borderColor: options?.borderColor || BASE_COLORS.border,
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    };
  }

  return {
    style: 'soft-shadow',
    borderWidth: 1,
    borderColor: options?.borderColor || BASE_COLORS.borderLight,
    shadowColor: dark ? '#000000' : BLACK_SCALE.B700,
    shadowOpacity: dark ? 0.28 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  };
}

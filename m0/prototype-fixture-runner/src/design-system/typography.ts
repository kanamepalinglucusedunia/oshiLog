import { TextStyle } from 'react-native';

export const FONT_FAMILY_LIGHT = 'Nunito-Light';
export const FONT_FAMILY_REGULAR = 'Nunito-Regular';
export const FONT_FAMILY_SEMIBOLD = 'Nunito-SemiBold';
export const FONT_FAMILY_BOLD = 'Nunito-Bold';

export const TYPOGRAPHY = {
  // --- LIGHT (fontWeight: 300) ---
  light: {
    xs: { fontFamily: FONT_FAMILY_LIGHT, fontSize: 10, lineHeight: 12 } as TextStyle,
    small: { fontFamily: FONT_FAMILY_LIGHT, fontSize: 12, lineHeight: 14 } as TextStyle,
    body: { fontFamily: FONT_FAMILY_LIGHT, fontSize: 16, lineHeight: 20 } as TextStyle,
    large: { fontFamily: FONT_FAMILY_LIGHT, fontSize: 20, lineHeight: 24 } as TextStyle,
    h3: { fontFamily: FONT_FAMILY_LIGHT, fontSize: 24, lineHeight: 30 } as TextStyle,
    h2: { fontFamily: FONT_FAMILY_LIGHT, fontSize: 32, lineHeight: 38 } as TextStyle,
    h1: { fontFamily: FONT_FAMILY_LIGHT, fontSize: 48, lineHeight: 56 } as TextStyle,
  },

  // --- REGULAR (fontWeight: 400) ---
  regular: {
    xs: { fontFamily: FONT_FAMILY_REGULAR, fontSize: 10, lineHeight: 12 } as TextStyle,
    small: { fontFamily: FONT_FAMILY_REGULAR, fontSize: 12, lineHeight: 14 } as TextStyle,
    body: { fontFamily: FONT_FAMILY_REGULAR, fontSize: 16, lineHeight: 20 } as TextStyle,
    large: { fontFamily: FONT_FAMILY_REGULAR, fontSize: 20, lineHeight: 24 } as TextStyle,
    h3: { fontFamily: FONT_FAMILY_REGULAR, fontSize: 24, lineHeight: 30 } as TextStyle,
    h2: { fontFamily: FONT_FAMILY_REGULAR, fontSize: 32, lineHeight: 38 } as TextStyle,
    h1: { fontFamily: FONT_FAMILY_REGULAR, fontSize: 48, lineHeight: 56 } as TextStyle,
  },

  // --- SEMIBOLD (fontWeight: 600) ---
  semibold: {
    xs: { fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 10, lineHeight: 12 } as TextStyle,
    small: { fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 12, lineHeight: 14 } as TextStyle,
    body: { fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 16, lineHeight: 20 } as TextStyle,
    large: { fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 20, lineHeight: 24 } as TextStyle,
    h3: { fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 24, lineHeight: 30 } as TextStyle,
    h2: { fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 32, lineHeight: 38 } as TextStyle,
    h1: { fontFamily: FONT_FAMILY_SEMIBOLD, fontSize: 48, lineHeight: 56 } as TextStyle,
  },

  // --- BOLD (fontWeight: 700) ---
  bold: {
    xs: { fontFamily: FONT_FAMILY_BOLD, fontSize: 10, lineHeight: 12 } as TextStyle,
    small: { fontFamily: FONT_FAMILY_BOLD, fontSize: 12, lineHeight: 14 } as TextStyle,
    body: { fontFamily: FONT_FAMILY_BOLD, fontSize: 16, lineHeight: 20 } as TextStyle,
    large: { fontFamily: FONT_FAMILY_BOLD, fontSize: 20, lineHeight: 24 } as TextStyle,
    h3: { fontFamily: FONT_FAMILY_BOLD, fontSize: 24, lineHeight: 30 } as TextStyle,
    h2: { fontFamily: FONT_FAMILY_BOLD, fontSize: 32, lineHeight: 38 } as TextStyle,
    h1: { fontFamily: FONT_FAMILY_BOLD, fontSize: 48, lineHeight: 56 } as TextStyle,
  },
} as const;

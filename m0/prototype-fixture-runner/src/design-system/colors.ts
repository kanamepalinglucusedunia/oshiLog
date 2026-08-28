export const BLACK_SCALE = {
  B0: '#FFFFFF',
  B10: '#FAFAFA',
  B20: '#F5F5F5',
  B30: '#EBEBEB',
  B40: '#DEDEDE',
  B50: '#BFBFBF',
  B60: '#B0B0B0',
  B70: '#A3A3A3',
  B80: '#949494',
  B90: '#858585',
  B100: '#757575',
  B200: '#666666',
  B300: '#575757',
  B400: '#4A4A4A',
  B500: '#3B3B3B',
  B600: '#2E2E2E',
  B700: '#1C1C1C',
  B800: '#0D0D0D',
  B900: '#000000',
} as const;

export const GREEN_SCALE = {
  G50: '#EAF6EC',
  G75: '#A7DBB3',
  G100: '#82CC93',
  G200: '#4DB665',
  G300: '#28A745',
  G400: '#1C7530',
  G500: '#18662A',
} as const;

export const YELLOW_SCALE = {
  Y50: '#FFF9E6',
  Y75: '#FFE699',
  Y100: '#FFDB6F',
  Y200: '#FFCC31',
  Y300: '#FFC107',
  Y400: '#B38705',
  Y500: '#9C7604',
} as const;

export const RED_SCALE = {
  R50: '#FCEBEC',
  R75: '#F1ACB3',
  R100: '#EB8A93',
  R200: '#E25765',
  R300: '#DC3545',
  R400: '#9A2530',
  R500: '#86202A',
} as const;

export const DEFAULT_PRIMARY_SCALE = {
  P10: '#FCFBFD',
  P25: '#F9F8FB',
  P50: '#F2F1F8',
  P75: '#CBC4E1',
  P100: '#B5ABD4',
  P200: '#9587C2',
  P300: '#7F6EB5',
  P400: '#594D7F',
  P500: '#4D436E',
} as const;

export interface PrimaryScale {
  P10: string;
  P25: string;
  P50: string;
  P75: string;
  P100: string;
  P200: string;
  P300: string;
  P400: string;
  P500: string;
}

/**
 * Converts a hex token into an rgba() string with the given alpha.
 */
export function withAlpha(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map((c) => c + c).join('')
    : cleanHex;
  const num = parseInt(fullHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function generatePrimaryScale(accentHex?: string): PrimaryScale {
  if (!accentHex || accentHex.toUpperCase() === '#7F6EB5') {
    return DEFAULT_PRIMARY_SCALE;
  }
  const cleanHex = accentHex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 127;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 110;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 181;

  const blend = (factor: number) => {
    let nr = r;
    let ng = g;
    let nb = b;
    if (factor > 0) {
      nr = Math.round(r + (255 - r) * factor);
      ng = Math.round(g + (255 - g) * factor);
      nb = Math.round(b + (255 - b) * factor);
    } else {
      nr = Math.round(r * (1 + factor));
      ng = Math.round(g * (1 + factor));
      nb = Math.round(b * (1 + factor));
    }
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`.toUpperCase();
  };

  return {
    P10: blend(0.975),
    P25: blend(0.95),
    P50: blend(0.85),
    P75: blend(0.60),
    P100: blend(0.45),
    P200: blend(0.20),
    P300: accentHex.toUpperCase(),
    P400: blend(-0.30),
    P500: blend(-0.40),
  };
}

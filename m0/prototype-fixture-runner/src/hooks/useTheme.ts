import { useMemo } from 'react';
import { buildTheme } from '@/design-system/resolveTheme';
import type { ThemeTokens } from '@/design-system/theme';
import { useSettingsStore } from '@/stores/settingsStore';

export function useTheme(): ThemeTokens {
  const surfaceStyle = useSettingsStore((s) => s.settings?.surfaceStyle ?? 'outline');
  const themeMode = useSettingsStore((s) => s.settings?.themeMode ?? 'light');
  const accentColor = useSettingsStore((s) => s.settings?.accentColor ?? '#7F6EB5');
  return useMemo(() => buildTheme(surfaceStyle, accentColor, themeMode), [surfaceStyle, accentColor, themeMode]);
}

export { TYPOGRAPHY } from '@/design-system/typography';
export type { ThemeTokens } from '@/design-system/theme';

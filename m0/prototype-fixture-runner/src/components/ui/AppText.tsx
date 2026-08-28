import { Text, type TextProps, type TextStyle } from 'react-native';
import { TYPOGRAPHY } from '@/design-system/typography';
import { useTheme } from '@/hooks/useTheme';

type Weight = 'light' | 'regular' | 'semibold' | 'bold';
type Size = 'xs' | 'small' | 'body' | 'large' | 'h3' | 'h2' | 'h1';

export interface AppTextProps extends TextProps {
  weight?: Weight;
  size?: Size;
  muted?: boolean;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function AppText({
  weight = 'regular',
  size = 'body',
  muted,
  color,
  align,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  const typography = TYPOGRAPHY[weight][size];
  return (
    <Text
      style={[
        typography,
        { color: color ?? (muted ? theme.color.textMuted : theme.color.text) },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}

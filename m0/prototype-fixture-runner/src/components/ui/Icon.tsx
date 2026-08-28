import { useTheme } from '@/hooks/useTheme';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { ICONS, type IconName } from './icons';

export type { IconName } from './icons';

export interface IconProps {
  name: IconName;
  size?: number;
  height?: number;
  width?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
  viewBoxPadding?: number;
  style?: StyleProp<ViewStyle>;
}

export function Icon({
  name,
  size,
  height,
  width,
  color,
  fill = 'none',
  strokeWidth = 1,
  viewBoxPadding = 0,
  style,
}: IconProps) {
  const theme = useTheme();
  const def = ICONS[name];

  // Ratio is locked from SVG definition, height is the sizing driver
  const effectiveHeight = height ?? size ?? (width ? (width * def.height) / def.width : 24);
  const effectiveWidth = width ?? (effectiveHeight * def.width) / def.height;

  const viewBox = `${-viewBoxPadding} ${-viewBoxPadding} ${def.width + viewBoxPadding * 2} ${def.height + viewBoxPadding * 2}`;

  return (
    <Svg width={effectiveWidth} height={effectiveHeight} viewBox={viewBox} style={style}>
      <G
        fill={fill}
        stroke={color ?? theme.color.text}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {def.paths.map((d, index) => (
          <Path key={index} d={d} />
        ))}
      </G>
    </Svg>
  );
}

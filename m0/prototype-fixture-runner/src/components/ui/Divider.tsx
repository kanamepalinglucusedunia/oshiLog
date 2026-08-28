import { View, type StyleProp, type ViewStyle, type DimensionValue } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';
import { DIVIDER_THICKNESS, DIVIDER_OPACITY } from '@/design-system/theme';

export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerVariant = 'major' | 'inner';
export type DividerThickness = 1 | 0.5;
export type DividerLineStyle = 'solid' | 'dashed';

export interface DividerProps {
  orientation?: DividerOrientation;
  variant?: DividerVariant;
  thickness?: DividerThickness;
  color?: string;
  length?: DimensionValue;
  opacity?: number;
  lineStyle?: DividerLineStyle;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Divider({
  orientation = 'horizontal',
  variant = 'major',
  thickness,
  color,
  length,
  opacity,
  lineStyle = 'solid',
  style,
  testID,
}: DividerProps) {
  const theme = useTheme();

  const effectiveThickness = thickness ?? DIVIDER_THICKNESS[variant];
  const effectiveOpacity = opacity ?? DIVIDER_OPACITY[variant];
  const effectiveColor = color ?? (variant === 'inner' ? theme.color.text : theme.surface.borderColor);

  const isHorizontal = orientation === 'horizontal';

  const baseStyle: ViewStyle = isHorizontal
    ? {
        height: effectiveThickness,
        width: length ?? '100%',
        backgroundColor: effectiveColor,
        opacity: effectiveOpacity,
      }
    : {
        width: effectiveThickness,
        height: length,
        backgroundColor: effectiveColor,
        opacity: effectiveOpacity,
      };

  if (lineStyle === 'dashed') {
    return (
      <View
        testID={testID}
        style={[{ ...baseStyle, backgroundColor: 'transparent' }, style]}
      >
        <Svg width="100%" height="100%">
          <Line
            testID={testID ? `${testID}-line` : undefined}
            x1={isHorizontal ? 0.5 : effectiveThickness / 2}
            y1={isHorizontal ? effectiveThickness / 2 : 0.5}
            x2={isHorizontal ? '100%' : effectiveThickness / 2}
            y2={isHorizontal ? effectiveThickness / 2 : '100%'}
            stroke={effectiveColor}
            strokeWidth={effectiveThickness}
            strokeLinecap="round"
            strokeDasharray={[10, 10]}
          />
        </Svg>
      </View>
    );
  }

  return <View testID={testID} style={[baseStyle, style]} />;
}

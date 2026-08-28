import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: boolean;
  pressed?: boolean;
  testID?: string;
}

/**
 * Surface container that follows the active Surface Style (outline or soft-shadow).
 */
export function Card({ children, style, accent, pressed, testID }: CardProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        {
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.lg,
          borderWidth: theme.surface.borderWidth,
          borderColor: accent ? theme.color.accent : theme.surface.borderColor,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.shadowOpacity,
          shadowRadius: theme.surface.shadowRadius,
          shadowOffset: { width: 0, height: 2 },
          elevation: theme.surface.elevation,
        },
        pressed ? { opacity: 0.8 } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 16,
  },
});

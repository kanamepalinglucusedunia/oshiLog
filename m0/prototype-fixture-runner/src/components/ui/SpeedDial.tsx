import { View, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from '@/hooks/useTheme';

export interface SpeedDialAction {
  label: string;
  icon: IconName;
  onPress: () => void;
}

export interface SpeedDialProps {
  actions: SpeedDialAction[];
  style?: StyleProp<ViewStyle>;
}

export function SpeedDial({ actions, style }: SpeedDialProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, style]}>
      {actions.map((action) => (
        <View key={action.label} style={styles.row}>
          <AppText size="large" weight="light" color={theme.color.surface} style={styles.label}>
            {action.label}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.miniFab,
              {
                backgroundColor: theme.color.accentSurface,
                borderColor: theme.surface.borderColor,
                borderWidth: theme.surface.borderWidth,
              },
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <View style={styles.iconBox}>
              <Icon name={action.icon} size={24} color={theme.color.text} strokeWidth={1} />
            </View>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    paddingRight: 8,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    lineHeight: 22,
  },
  miniFab: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

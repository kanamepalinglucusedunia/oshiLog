import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

export interface FabProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Fab({ onPress, icon = 'add' }: FabProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick action"
        onPress={onPress}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: pressed ? theme.color.accentPressed : theme.color.accent,
            borderRadius: 28,
            borderWidth: theme.surface.style === 'outline' ? 2 : 0,
            borderColor: theme.color.border,
            shadowColor: theme.surface.shadowColor,
            shadowOpacity: theme.surface.style === 'soft-shadow' ? 0.25 : 0,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: theme.surface.style === 'soft-shadow' ? 6 : 0,
          },
        ]}
      >
        <Ionicons name={icon} size={28} color={theme.color.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    zIndex: 10,
  },
  fab: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

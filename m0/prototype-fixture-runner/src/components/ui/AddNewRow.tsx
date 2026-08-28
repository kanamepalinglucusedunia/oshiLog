import { Keyboard, Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';

export interface AddNewRowProps {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}

/**
 * Figma "Add new Dropdown List": top-bordered picker footer row with a
 * plus-circle action, shared by the idol and venue pickers.
 */
export function AddNewRow({ label, accessibilityLabel, onPress }: AddNewRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        Keyboard.dismiss();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          borderTopWidth: theme.surface.borderWidth,
          borderTopColor: theme.surface.borderColor,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name="plusCircle" size={20} color={theme.color.accent} strokeWidth={1} />
      <AppText size="body" weight="light" color={theme.color.accent}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});

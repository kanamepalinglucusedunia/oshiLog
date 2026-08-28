import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BLACK_SCALE } from '@/design-system/colors';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';

export type FavoriteButtonVariant = 'large' | 'small';

export interface FavoriteButtonProps {
  isFavorite: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  variant?: FavoriteButtonVariant;
  size?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}

export function FavoriteButton({
  isFavorite,
  onPress,
  accessibilityLabel,
  variant = 'large',
  size,
  iconSize,
  style,
}: FavoriteButtonProps) {
  const theme = useTheme();
  const isSmall = variant === 'small';
  const buttonSize = size ?? (isSmall ? 20 : 40);
  const heartSize = iconSize ?? (isSmall ? 14 : 24);
  const heart = isSmall ? (
    <View pointerEvents="none" style={styles.smallIconFrame}>
      <View style={styles.smallIconAspect}>
        <Icon
          name="favoriteHeartSmall"
          width={13}
          height={11.2427}
          color={BLACK_SCALE.B900}
          fill={isFavorite ? theme.color.accentMuted : 'none'}
          strokeWidth={1}
          style={styles.smallIconAsset}
        />
      </View>
    </View>
  ) : (
    <Icon
      name="favoriteHeartLarge"
      size={heartSize}
      color={BLACK_SCALE.B900}
      fill={isFavorite ? theme.color.accentMuted : 'none'}
      strokeWidth={1}
    />
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (isFavorite ? 'Remove from favorites' : 'Add to favorites')}
      accessibilityState={{ selected: isFavorite }}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.button,
        {
          width: buttonSize,
          height: buttonSize,
          backgroundColor: BLACK_SCALE.B0,
          borderColor: BLACK_SCALE.B900,
          borderWidth: 1,
          borderRadius: isSmall ? 10 : 16,
        },
        pressed ? { opacity: 0.7 } : null,
        style,
      ]}
    >
      {heart}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Figma FavoriteButton/Small: the frame is visually centered after
  // compensating for the button's 1px border in React Native.
  smallIconFrame: {
    position: 'absolute',
    left: 2,
    top: 3,
    width: 14,
    height: 14,
  },
  smallIconAspect: {
    position: 'absolute',
    left: 1,
    top: 1,
    width: 12,
    height: 10.2427,
  },
  smallIconAsset: {
    position: 'absolute',
    left: -0.5,
    top: -0.5,
  },
});

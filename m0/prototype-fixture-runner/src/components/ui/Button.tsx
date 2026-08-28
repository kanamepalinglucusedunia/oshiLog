import { Keyboard, Pressable, type ViewStyle, type PressableProps, type StyleProp } from 'react-native';
import { AppText, type AppTextProps } from './AppText';
import { useTheme } from '@/hooks/useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends PressableProps {
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  loading?: boolean;
  labelSize?: AppTextProps['size'];
  labelWeight?: AppTextProps['weight'];
}

export function Button({
  label,
  variant = 'primary',
  disabled,
  loading,
  labelSize = 'large',
  labelWeight = 'semibold',
  style,
  onPress,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';

  const base: ViewStyle = {
    borderRadius: theme.radius.lg,
    height: 40,
    minHeight: 40,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  };

  let container: ViewStyle = { ...base };
  if (isPrimary) {
    container.backgroundColor = disabled ? theme.color.surfaceMuted : theme.color.accent;
    container.borderWidth = 0;
    container.elevation = 0;
  } else if (isGhost) {
    container.borderWidth = 0;
    container.backgroundColor = 'transparent';
  } else if (isDanger) {
    container.backgroundColor = disabled ? theme.color.surfaceMuted : theme.color.surface;
    container.borderWidth = theme.surface.style === 'outline' ? 2 : 1;
    container.borderColor = isDanger ? theme.color.danger : theme.color.borderLight;
  } else {
    container.backgroundColor = disabled ? theme.color.surfaceMuted : theme.color.surface;
    container.borderWidth = theme.surface.style === 'outline' ? 2 : 1;
    container.borderColor = theme.color.border;
    container.shadowColor = theme.surface.shadowColor;
    container.shadowOpacity = theme.surface.shadowOpacity;
    container.shadowRadius = theme.surface.shadowRadius;
    container.shadowOffset = { width: 0, height: 2 };
    container.elevation = theme.surface.elevation;
  }

  const labelColor = isPrimary
    ? disabled
      ? theme.color.textMuted
      : '#FFFFFF'
    : isDanger
      ? theme.color.danger
      : isGhost
        ? theme.color.accent
        : theme.color.text;

  const handlePress = onPress
    ? (event: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
        Keyboard.dismiss();
        onPress(event);
      }
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || !!loading }}
      disabled={disabled || loading}
      onPress={handlePress}
      style={({ pressed }) => [
        container,
        pressed && !disabled ? { opacity: 0.75 } : null,
        style,
      ]}
      {...rest}
    >
      {loading ? <AppText weight={labelWeight ?? (isPrimary ? 'bold' : 'semibold')} size={labelSize} color={labelColor}>…</AppText> : null}
      <AppText weight={labelWeight ?? (isPrimary ? 'bold' : 'semibold')} size={labelSize} color={labelColor}>
        {label}
      </AppText>
    </Pressable>
  );
}

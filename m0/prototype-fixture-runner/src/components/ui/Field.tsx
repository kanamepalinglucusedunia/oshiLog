import { useState } from 'react';
import { TextInput, View, StyleSheet, Pressable, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { ICONS } from './icons';
import { useTheme } from '@/hooks/useTheme';
import { TYPOGRAPHY } from '@/design-system/typography';

export interface FieldProps extends TextInputProps {
  label?: string;
  labelWeight?: 'light' | 'regular' | 'semibold' | 'bold';
  icon?: string;       // Icon name for left slot (e.g. "star", "globe", "calendar", "locationMarker", "ticket")
  iconColor?: string;  // Color for left icon (defaults to dynamic theme.color.accent)
  rightIcon?: string;  // Icon name for right slot (e.g. "chevronDown")
  onRightIconPress?: () => void;
  error?: string | null;
  hint?: string | null;
  variant?: 'regular' | 'block'; // 'regular' = 36px pill matching Figma node 9:3988
  containerStyle?: StyleProp<ViewStyle>;
}

function resolveIconName(name?: string): IconName | null {
  if (!name) return null;
  const clean = name.replace('-outline', '').replace('Outline', '');
  if (clean === 'star') return 'star';
  if (clean === 'ticket') return 'ticket';
  if (clean === 'calendar' || clean === 'calendarDays' || clean === 'calendar-days') return 'calendar';
  if (clean === 'globe') return 'globe';
  if (clean === 'location' || clean === 'locationMarker' || clean === 'location-marker') return 'locationMarker';
  if (clean === 'users' || clean === 'userGroup' || clean === 'user-group' || clean === 'people') return 'userGroup';
  if (clean === 'palette' || clean === 'color-palette') return 'palette';
  if (clean === 'camera' || clean === 'cameraPlus' || clean === 'camera-plus') return 'cameraPlus';
  if (clean === 'chevronDown' || clean === 'chevron-down') return 'chevronDown';
  if (clean === 'chevronUp' || clean === 'chevron-up') return 'chevronUp';
  if (clean === 'plus') return 'plus';
  if (clean === 'x' || clean === 'close') return 'x';
  if (clean === 'xCircle' || clean === 'close-circle') return 'xCircle';
  if (clean === 'plusCircle' || clean === 'add-circle') return 'plusCircle';
  if (clean in ICONS) return clean as IconName;
  return null;
}

export function Field({
  label,
  labelWeight = 'regular',
  icon,
  iconColor,
  rightIcon,
  onRightIconPress,
  error,
  hint,
  variant = 'regular',
  style,
  containerStyle,
  multiline,
  onFocus,
  onBlur,
  placeholderTextColor,
  editable,
  ...rest
}: FieldProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const isDisabled = editable === false;
  const effectiveIconColor = iconColor ?? (isDisabled ? theme.color.textMuted : theme.color.accent);
  const inputTextColor = isDisabled ? theme.color.textMuted : theme.color.text;
  const defaultPlaceholderColor = isDisabled
    ? theme.color.textMuted
    : isFocused
    ? theme.color.accent
    : theme.color.textMuted;

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const leftSvgName = resolveIconName(icon);
  const rightSvgName = resolveIconName(rightIcon);

  if (variant === 'regular') {
    return (
      <View style={[styles.container, containerStyle]}>
        {label ? (
          <AppText
            weight={labelWeight}
            size="small"
            color={isDisabled ? theme.color.textMuted : theme.color.text}
            style={{ marginBottom: theme.spacing.xs }}
          >
            {label}
          </AppText>
        ) : null}

        <View
          style={[
            styles.regularBox,
            multiline ? styles.regularBoxMultiline : null,
            {
              backgroundColor: theme.color.surface,
              borderWidth: theme.surface.borderWidth,
              borderColor: error
                ? theme.color.danger
                : isDisabled
                ? theme.color.borderLight
                : isFocused
                ? theme.color.accent
                : theme.surface.borderColor,
              shadowColor: theme.surface.shadowColor,
              shadowOpacity: theme.surface.style === 'soft-shadow' ? theme.surface.shadowOpacity : 0,
              shadowRadius: theme.surface.shadowRadius,
              shadowOffset: { width: 0, height: 1 },
              elevation: theme.surface.style === 'soft-shadow' ? theme.surface.elevation : 0,
            },
          ]}
        >
          {leftSvgName ? (
            <Icon name={leftSvgName} size={18} color={effectiveIconColor} strokeWidth={1} />
          ) : icon ? (
            <Ionicons name={icon as never} size={18} color={effectiveIconColor} />
          ) : null}

          <TextInput
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...rest}
            editable={editable}
            placeholderTextColor={placeholderTextColor ?? defaultPlaceholderColor}
            style={[TYPOGRAPHY.light.body, styles.regularInput, multiline ? styles.regularInputMultiline : null, { color: inputTextColor }, style]}
          />

          {rightSvgName ? (
            onRightIconPress ? (
              <Pressable onPress={onRightIconPress} hitSlop={8}>
                <Icon name={rightSvgName} size={16} color={effectiveIconColor} strokeWidth={1.5} />
              </Pressable>
            ) : (
              <Icon name={rightSvgName} size={16} color={effectiveIconColor} strokeWidth={1.5} />
            )
          ) : rightIcon ? (
            onRightIconPress ? (
              <Pressable onPress={onRightIconPress} hitSlop={8}>
                <Ionicons name={rightIcon as never} size={16} color={effectiveIconColor} />
              </Pressable>
            ) : (
              <Ionicons name={rightIcon as never} size={16} color={effectiveIconColor} />
            )
          ) : null}
        </View>

        {error ? (
          <AppText size="xs" color={theme.color.danger} style={{ marginTop: 2 }}>
            {error}
          </AppText>
        ) : hint ? (
          <AppText size="xs" muted style={{ marginTop: 2 }}>
            {hint}
          </AppText>
        ) : null}
      </View>
    );
  }

  // Block variant (rectangular 48px input)
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText
          weight={labelWeight}
          size="small"
          color={isDisabled ? theme.color.textMuted : theme.color.text}
          style={{ marginBottom: theme.spacing.xs }}
        >
          {label}
        </AppText>
      ) : null}
      <TextInput
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...rest}
        editable={editable}
        placeholderTextColor={placeholderTextColor ?? defaultPlaceholderColor}
        style={[
          {
            backgroundColor: theme.color.surface,
            borderRadius: theme.radius.md,
            borderWidth: theme.surface.borderWidth,
            borderColor: error
              ? theme.color.danger
              : isDisabled
              ? theme.color.borderLight
              : isFocused
              ? theme.color.accent
              : theme.surface.borderColor,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm + 2,
            color: inputTextColor,
            minHeight: 48,
          },
          TYPOGRAPHY.regular.body,
          style,
        ]}
      />
      {error ? (
        <AppText size="xs" color={theme.color.danger} style={{ marginTop: theme.spacing.xs }}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText size="xs" muted style={{ marginTop: theme.spacing.xs }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  regularBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 16,
    paddingLeft: 8,
    paddingRight: 8,
    gap: 8,
  },
  leftIcon: {
    marginRight: 2,
  },
  regularInput: {
    flex: 1,
    height: 36,
    paddingVertical: 0,
  },
  regularBoxMultiline: {
    height: undefined,
    minHeight: 100,
    alignItems: 'flex-start',
    paddingTop: 8,
    paddingBottom: 8,
  },
  regularInputMultiline: {
    height: undefined,
    minHeight: 84,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
});

import { useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/hooks/useTheme';

export interface DropdownProps {
  label?: string;
  labelWeight?: 'light' | 'regular' | 'semibold' | 'bold';
  /** Currently selected label shown in the field, or null to show the placeholder. */
  value: string | null;
  placeholder: string;
  leadingIcon?: IconName;
  valueAlign?: 'left' | 'center';
  open: boolean;
  openDirection?: 'down' | 'up';
  disabled?: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  /** Override the active field border for Figma variants that stay outlined in black. */
  openBorderColor?: string;
  /** Override the placeholder color while open. */
  openPlaceholderColor?: string;
  /** Override the field's trailing inset for variants with a wider chevron gutter. */
  fieldPaddingRight?: number;
  error?: string | null;
  hint?: string | null;
  /** List content: one row per option (rendered inside a scrollable panel). */
  children: ReactNode;
  /** Keep the field state/visuals but let a dedicated portal own the option list. */
  renderOptionsInline?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Inline select dropdown (Figma "Country Dropdown" / "Region Dropdown",
 * nodes 123:4169 / 204:9704): a 36px pill field with an optional leading icon, value label
 * and chevron; when open the field loses its bottom corners and an
 * absolutely-positioned panel with the options appears directly below it.
 */
export function Dropdown({
  label,
  labelWeight = 'regular',
  value,
  placeholder,
  leadingIcon,
  valueAlign = 'left',
  open,
  openDirection = 'down',
  disabled = false,
  onToggle,
  accessibilityLabel,
  openBorderColor,
  openPlaceholderColor,
  fieldPaddingRight,
  error,
  hint,
  children,
  renderOptionsInline = true,
  style,
}: DropdownProps) {
  const theme = useTheme();
  const surface = theme.surface;
  const [fieldFrame, setFieldFrame] = useState<{ y: number; height: number } | null>(null);
  const handleToggle = () => {
    Keyboard.dismiss();
    onToggle();
  };
  return (
    <View style={[styles.wrapper, open && styles.wrapperOpen, style]}>
      {label ? (
        <AppText
          weight={labelWeight}
          size="small"
          color={disabled ? theme.color.textMuted : theme.color.text}
          style={styles.fieldLabel}
        >
          {label}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={disabled ? undefined : handleToggle}
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          setFieldFrame((prev) => (prev && prev.y === y && prev.height === height ? prev : { y, height }));
        }}
        style={[
          styles.field,
          {
            backgroundColor: theme.color.surface,
            borderColor: error
              ? theme.color.danger
              : disabled
              ? theme.color.borderLight
              : open
              ? openBorderColor ?? theme.color.accent
              : surface.borderColor,
            borderWidth: surface.borderWidth,
            borderTopLeftRadius: open ? (openDirection === 'up' ? 0 : theme.radius.md) : theme.radius.md,
            borderTopRightRadius: open ? (openDirection === 'up' ? 0 : theme.radius.md) : theme.radius.md,
            borderBottomLeftRadius: open ? (openDirection === 'up' ? theme.radius.md : 0) : theme.radius.md,
            borderBottomRightRadius: open ? (openDirection === 'up' ? theme.radius.md : 0) : theme.radius.md,
            shadowColor: surface.shadowColor,
            shadowOpacity: surface.style === 'soft-shadow' ? surface.shadowOpacity : 0,
            shadowRadius: surface.shadowRadius,
            shadowOffset: { width: 0, height: 1 },
            elevation: surface.style === 'soft-shadow' ? surface.elevation : 0,
          },
          { paddingRight: fieldPaddingRight ?? 16 },
        ]}
      >
        {leadingIcon ? (
          <Icon name={leadingIcon} size={18} color={disabled ? theme.color.textMuted : theme.color.accent} strokeWidth={1} />
        ) : null}
        <AppText
          weight="light"
          size="body"
          numberOfLines={1}
          style={[styles.label, { textAlign: valueAlign }]}
          color={disabled ? theme.color.textMuted : value ? theme.color.text : open ? openPlaceholderColor ?? theme.color.accent : theme.color.textMuted}
        >
          {value ?? placeholder}
        </AppText>
        <Icon
          name={open ? 'chevronUp' : 'chevronDown'}
          width={15}
          height={8}
          color={disabled ? theme.color.textMuted : theme.color.text}
          strokeWidth={1}
        />
      </Pressable>

      {open && renderOptionsInline ? (
        <View
          style={[
            styles.list,
            {
              top: fieldFrame ? fieldFrame.y + fieldFrame.height - surface.borderWidth : label ? 53 : 35,
              backgroundColor: theme.color.surface,
              borderColor: surface.borderColor,
              borderWidth: surface.borderWidth,
              shadowColor: surface.shadowColor,
              shadowOpacity: surface.style === 'soft-shadow' ? surface.shadowOpacity : 0,
              shadowRadius: surface.shadowRadius,
              shadowOffset: { width: 0, height: 2 },
              elevation: surface.style === 'soft-shadow' ? surface.elevation : 0,
            },
          ]}
        >
          <ScrollView
            style={styles.listScroll}
            bounces={false}
            nestedScrollEnabled
            scrollEnabled
            onMoveShouldSetResponderCapture={() => true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            scrollsChildToFocus
          >
            {children}
          </ScrollView>
        </View>
      ) : null}

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

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  wrapperOpen: {
    zIndex: 20,
  },
  fieldLabel: {
    marginBottom: 4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingLeft: 8,
    paddingRight: 16,
    gap: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  label: {
    flex: 1,
  },
  list: {
    position: 'absolute',
    left: 0,
    right: 0,
    padding: 8,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  listScroll: {
    maxHeight: 264, // ~7 rows (36px each) before scrolling; hugs content below that
  },
});

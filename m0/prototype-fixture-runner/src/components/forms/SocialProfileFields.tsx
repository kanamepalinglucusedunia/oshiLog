import { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/hooks/useTheme';
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_CONFIG } from '@/services/socialProfile';
import type { SocialPlatform } from '@/types/domain';

export type SocialProfileDraft = Record<SocialPlatform, string>;

export interface SocialProfileFieldsProps {
  values: SocialProfileDraft;
  errors?: Partial<Record<SocialPlatform, string>>;
  onChange: (platform: SocialPlatform, value: string) => void;
  /** Start collapsed with only the header visible; unfold to edit profiles. */
  defaultCollapsed?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SocialProfileFields({ values, errors = {}, onChange, defaultCollapsed = false, style }: SocialProfileFieldsProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <Card style={[{ gap: theme.spacing.sm }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Social Media"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.headerRow}
      >
        <View style={styles.headerText}>
          <AppText weight="semibold" size="large">Social Media</AppText>
          <AppText muted size="small">Optional. Add one public profile per platform.</AppText>
        </View>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} width={15} height={8} color={theme.color.text} strokeWidth={1} />
      </Pressable>
      {open ? (
        SOCIAL_PLATFORMS.map((platform) => {
          const label = `${SOCIAL_PLATFORM_CONFIG[platform].label} profile`;
          return (
            <Field
              key={platform}
              accessibilityLabel={label}
              label={label}
              value={values[platform]}
              onChangeText={(value) => onChange(platform, value)}
              placeholder="@username or profile URL"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              error={errors[platform] ?? null}
            />
          );
        })
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    flex: 1,
  },
});

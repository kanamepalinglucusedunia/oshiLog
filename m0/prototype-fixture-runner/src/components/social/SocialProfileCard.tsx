import { Linking, Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { useTheme } from '@/hooks/useTheme';
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_CONFIG,
  usernameFromProfileUrl,
} from '@/services/socialProfile';
import type { SocialPlatform } from '@/types/domain';

export interface SocialProfileCardProps {
  profileUrls: Record<SocialPlatform, string | null>;
  onEdit: () => void;
  onRefresh: () => void;
}

export function SocialProfileCard({ profileUrls, onEdit, onRefresh }: SocialProfileCardProps) {
  const theme = useTheme();
  const links = SOCIAL_PLATFORMS.flatMap((platform) => {
    const url = profileUrls[platform];
    const username = usernameFromProfileUrl(platform, url);
    return url && username ? [{ platform, url, username }] : [];
  });

  return (
    <Card style={{ marginTop: CARD_STACK_GAP, gap: theme.spacing.sm }}>
      <AppText weight="bold" size="large">Social Media</AppText>
      {links.length === 0 ? (
        <>
          <AppText size="small" muted>No social profiles linked.</AppText>
          <Button label="Edit social profiles" variant="ghost" onPress={onEdit} />
        </>
      ) : (
        <>
          {links.map(({ platform, url, username }) => {
            const label = SOCIAL_PLATFORM_CONFIG[platform].label;
            return (
              <Pressable
                key={platform}
                accessibilityRole="link"
                accessibilityLabel={`Open ${label} profile @${username}`}
                onPress={() => void Linking.openURL(url).catch(() => undefined)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottomWidth: theme.surface.borderWidth,
                  borderBottomColor: theme.surface.borderColor,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <View>
                  <AppText size="small" weight="semibold">{label}</AppText>
                  <AppText size="xs" muted>@{username}</AppText>
                </View>
                <AppText color={theme.color.accent}>Open</AppText>
              </Pressable>
            );
          })}
          <Button label="Refresh profile photo" variant="secondary" onPress={onRefresh} />
          <Button label="Edit social profiles" variant="ghost" onPress={onEdit} />
        </>
      )}
    </Card>
  );
}

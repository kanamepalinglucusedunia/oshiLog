import { Linking, Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { useTheme } from '@/hooks/useTheme';

export default function CreditsScreen() {
  const theme = useTheme();
  return (
    <Screen scroll>
      <Header title="Credits" />
      <Card>
        <AppText weight="bold" size="large">Profile photos</AppText>
        <AppText size="small" muted style={{ marginTop: theme.spacing.xs }}>
          Social profile photos are retrieved only when you request a preview or refresh, then copied into local app storage.
        </AppText>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Avatars provided by Unavatar"
          onPress={() => void Linking.openURL('https://unavatar.io').catch(() => undefined)}
          style={{ minHeight: 44, justifyContent: 'center', marginTop: theme.spacing.sm }}
        >
          <View>
            <AppText weight="semibold" color={theme.color.accent}>Avatars provided by Unavatar</AppText>
            <AppText size="xs" muted>unavatar.io</AppText>
          </View>
        </Pressable>
      </Card>
    </Screen>
  );
}

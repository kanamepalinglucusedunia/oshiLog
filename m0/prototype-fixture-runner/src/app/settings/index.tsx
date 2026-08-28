import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { SettingsRow } from '@/components/ui/SettingsRow';

export default function SettingsMenuScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen scroll contentStyle={{ padding: 0 }}>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Header title="Settings" />
      </View>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Card>
          <SettingsRow
            icon="flag-outline"
            label="Country & Region"
            value="Active countries & regions"
            onPress={() => router.push('/settings/country-region')}
          />
          <SettingsRow
            icon="color-palette-outline"
            label="Theme & Appearance"
            value="Surface style, accent, dark mode"
            onPress={() => router.push('/settings/theme-appearance')}
          />
          <SettingsRow
            icon="color-fill-outline"
            label="Member Colors"
            value="Catalog of member color names"
            onPress={() => router.push('/settings/member-colors' as Href)}
          />
          <SettingsRow
            icon="language-outline"
            label="Language"
            value="Interface language, header label"
            onPress={() => router.push('/settings/language')}
          />
          <SettingsRow
            icon="server-outline"
            label="Backup & Restore"
            value="Snapshots, reminders"
            onPress={() => router.push('/settings/backup')}
          />
          <SettingsRow
            icon="information-circle-outline"
            label="Credits"
            value="Services and attribution"
            onPress={() => router.push('/settings/credits' as Href)}
          />
        </Card>
      </View>
    </Screen>
  );
}

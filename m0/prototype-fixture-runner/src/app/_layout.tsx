import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar as RNStatusBar, StyleSheet, View } from 'react-native';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  Nunito_300Light,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';
import { useSettingsStore } from '@/stores/settingsStore';
import { cleanupTombstonedMedia, ensureAppDirs } from '@/services/media';
import { subscribeToNotificationResponses } from '@/services/notificationsBridge';
import { getDb } from '@/db';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import {
  runInstalledNotificationRetry,
  runInstalledScheduledCatchUp,
} from '@/drive/installedDriveBackup';
import '@/spikes/googleDriveAuth/backgroundTask';
import '@/drive/driveBackupTask';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const router = useRouter();
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [startupError, setStartupError] = useState<string | null>(null);
  const loaded = useSettingsStore((s) => s.loaded);
  const load = useSettingsStore((s) => s.load);
  const themeMode = useSettingsStore((s) => s.settings?.themeMode ?? 'light');

  useEffect(() => {
    // Notifications are unavailable in Expo Go (SDK 53+); the bridge no-ops there.
    return subscribeToNotificationResponses((response) => {
      const data = response.notification.request.content.data as { openSettings?: boolean; driveRetryCategory?: unknown };
      if (data.driveRetryCategory === 'data' || data.driveRetryCategory === 'media') {
        void runInstalledNotificationRetry(data.driveRetryCategory)
          .then(() => undefined)
          .catch(() => undefined);
        return;
      }
      if (data.openSettings) {
        router.push('/settings');
      }
    });
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setStartupError(null);
        const db = getDb();
        ensureAppDirs();
        cleanupTombstonedMedia(db);
        // M0 audit runner only: keep the prototype's deterministic development
        // fixture available in a clean release build used for golden captures.
        const { seedDevData } = await import('@/testing/devSeed');
        seedDevData(db);
        try {
          await Font.loadAsync({
            'Nunito-Light': Nunito_300Light,
            'Nunito-Regular': Nunito_400Regular,
            'Nunito-SemiBold': Nunito_600SemiBold,
            'Nunito-Bold': Nunito_700Bold,
          });
        } catch {
          // System fonts keep the app usable when a bundled font cannot load.
        }
        load();
        // Non-blocking Drive scheduled catch-up: reconcile the worker and run
        // any due categories. This never blocks first paint and is best-effort.
        void runInstalledScheduledCatchUp()
          .then(() => undefined)
          .catch(() => undefined);
      } catch (error) {
        if (!cancelled) setStartupError(error instanceof Error ? error.message : 'OshiLog could not initialize');
      } finally {
        if (!cancelled) void SplashScreen.hideAsync().catch(() => undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [load, startupAttempt]);

  if (startupError) {
    return (
      <View style={styles.startupFallback}>
        <AppText weight="bold" size="h3">OshiLog could not start</AppText>
        <AppText size="small" muted style={styles.startupMessage}>
          Your existing data was not modified. Retry initialization; if this keeps happening, preserve the database before reinstalling.
        </AppText>
        <AppText size="xs" muted numberOfLines={3}>{startupError}</AppText>
        <Button label="Retry" style={styles.retryButton} onPress={() => setStartupAttempt((value) => value + 1)} />
      </View>
    );
  }

  if (!loaded) return null;

  return (
    <>
      <RNStatusBar
        barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={themeMode === 'dark' ? '#121216' : '#FCFBFD'}
        animated
      />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="idol/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="idol/album" />
        <Stack.Screen name="idol/[id]" />
        <Stack.Screen name="group/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="group/[id]" />
        <Stack.Screen name="venue/[id]" />
        <Stack.Screen name="trip/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trip/[id]" />
        <Stack.Screen name="event/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="dev/google-drive-auth-spike" />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  startupFallback: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#FCFBFD',
  },
  startupMessage: {
    marginTop: 12,
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 20,
  },
});

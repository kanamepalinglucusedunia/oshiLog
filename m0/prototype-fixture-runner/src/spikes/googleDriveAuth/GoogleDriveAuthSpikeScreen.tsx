import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { safeAuthSpikeErrorCode, type AuthSpikeEvidence } from './backgroundProbe';
import { unregisterGoogleDriveAuthSpikeTask } from './backgroundTask';
import { readAuthSpikeEvidence } from './evidenceStore';
import { createInstalledGoogleDriveAuthSpikeController } from './installedSpikeController';

type InstalledController = Awaited<ReturnType<typeof createInstalledGoogleDriveAuthSpikeController>>;

export function GoogleDriveAuthSpikeScreen() {
  const controllerRef = useRef<InstalledController | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    'Use a physical Android device. Complete each numbered step in order.',
  );
  const [evidence, setEvidence] = useState<AuthSpikeEvidence[]>(readAuthSpikeEvidence);

  const getController = async () => {
    controllerRef.current ??= await createInstalledGoogleDriveAuthSpikeController();
    return controllerRef.current;
  };

  const refreshEvidence = () => setEvidence(readAuthSpikeEvidence());

  const runInteractiveProbe = async () => {
    setBusy(true);
    try {
      const result = await (await getController()).runInteractiveProbe();
      setStatus(
        `Interactive probe passed; account metadata returned: ${result.accountMetadataPresent ? 'yes' : 'no'}; ${result.fileCount} appDataFolder file(s) returned.`,
      );
      refreshEvidence();
    } catch (error) {
      setStatus(`Interactive probe failed (${safeAuthSpikeErrorCode(error)}).`);
      refreshEvidence();
    } finally {
      setBusy(false);
    }
  };

  const clearCachedToken = async () => {
    setBusy(true);
    try {
      await (await getController()).clearLastCachedAccessToken();
      setStatus('Cached access token cleared.');
    } catch (error) {
      setStatus(`Token clear failed (${safeAuthSpikeErrorCode(error)}).`);
    } finally {
      setBusy(false);
    }
  };

  const triggerBackgroundWorker = async () => {
    setBusy(true);
    try {
      const triggered = await (await getController()).triggerRegisteredBackgroundProbe();
      setStatus(
        triggered
          ? 'Expo background worker was triggered.'
          : 'Expo did not trigger the background worker.',
      );
      refreshEvidence();
    } catch (error) {
      setStatus(`Background trigger failed (${safeAuthSpikeErrorCode(error)}).`);
      refreshEvidence();
    } finally {
      setBusy(false);
    }
  };

  const unregisterWorker = async () => {
    setBusy(true);
    try {
      await unregisterGoogleDriveAuthSpikeTask();
      setStatus('Spike background worker unregistered.');
    } catch (error) {
      setStatus(`Worker unregister failed (${safeAuthSpikeErrorCode(error)}).`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header title="Drive auth T0" subtitle="Physical-device feasibility gate" />

      <Card style={styles.card}>
        <AppText weight="bold" size="large">Gate sequence</AppText>
        <AppText size="small" muted style={styles.copy}>
          This disposable debug screen requests only drive.appdata. It never displays or writes an
          access token. A mock or foreground-only result is not a GO.
        </AppText>
        <View style={styles.actions}>
          <Button
            label="1. Grant access and list appDataFolder"
            disabled={busy}
            onPress={() => void runInteractiveProbe()}
          />
          <Button
            label="2. Clear cached access token"
            variant="secondary"
            disabled={busy}
            onPress={() => void clearCachedToken()}
          />
          <Button
            label="3. Register and trigger background worker"
            variant="secondary"
            disabled={busy}
            onPress={() => void triggerBackgroundWorker()}
          />
        </View>
        <AppText accessibilityRole="alert" size="small" style={styles.status}>
          {status}
        </AppText>
      </Card>

      <Card style={styles.card}>
        <AppText weight="bold" size="large">Redacted evidence</AppText>
        <View style={styles.actions}>
          <Button label="Refresh evidence" variant="ghost" onPress={refreshEvidence} />
          <Button
            label="Unregister spike worker"
            variant="danger"
            disabled={busy}
            onPress={() => void unregisterWorker()}
          />
        </View>
        {evidence.length === 0 ? (
          <AppText size="small" muted>No probe evidence recorded yet.</AppText>
        ) : (
          [...evidence].reverse().map((record) => (
            <View
              key={`${record.startedAt}-${record.phase}-${record.adapter}`}
              style={styles.evidenceRow}
            >
              <AppText weight="semibold" size="small">
                {record.phase} | {record.status} | token {record.tokenAcquired ? 'yes' : 'no'} | Drive{' '}
                {record.driveListSucceeded ? 'yes' : 'no'}
              </AppText>
              <AppText size="xs" muted>
                {record.completedAt}
                {record.errorCode ? ` | ${record.errorCode}` : ''}
              </AppText>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  card: {
    gap: 12,
  },
  copy: {
    lineHeight: 18,
  },
  actions: {
    gap: 8,
  },
  status: {
    marginTop: 4,
  },
  evidenceRow: {
    gap: 2,
    paddingVertical: 8,
  },
});

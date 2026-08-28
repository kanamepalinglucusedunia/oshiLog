import { useState } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '@/hooks/useTheme';
import { useDriveBackup } from '@/hooks/useDriveBackup';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DriveConnectionCard } from '@/components/backup/DriveConnectionCard';
import { DriveScheduleCard } from '@/components/backup/DriveScheduleCard';
import { DriveManualActions } from '@/components/backup/DriveManualActions';
import { DriveBackupHistory } from '@/components/backup/DriveBackupHistory';
import { DriveRestoreFlow } from '@/components/backup/DriveRestoreFlow';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDb } from '@/db';
import {
  writeDataBackup,
  createMediaSnapshot,
  listSnapshots,
  readManifest,
  validateManifest,
  buildVerifiedRestorePreview,
  applyDataRestore,
  applyMediaRestore,
  type BackupSnapshotRow,
  type RestorePreview,
  deleteSnapshot,
} from '@/services/backup';
import { scheduleReminder } from '@/services/reminders';
import { type ReminderFrequency } from '@/types/domain';
import { formatISODate } from '@/utils/date';
import type { CloudHistoryItem } from '@/drive/cloudHistory';
import type { DriveCategory, DriveNetworkPolicy, DriveSchedule } from '@/drive/contracts';

const FREQUENCIES: { value: ReminderFrequency; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function BackupScreen() {
  const theme = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  const loadSettings = useSettingsStore((s) => s.load);
  const drive = useDriveBackup();

  const [busy, setBusy] = useState(false);
  const [dataSnapshots, setDataSnapshots] = useState<BackupSnapshotRow[]>(() => listSnapshots(getDb(), 'data'));
  const [mediaSnapshots, setMediaSnapshots] = useState<BackupSnapshotRow[]>(() => listSnapshots(getDb(), 'media'));
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreSource, setRestoreSource] = useState<{ type: 'data'; path: string } | { type: 'media'; path: string } | null>(null);
  const [cloudRestore, setCloudRestore] = useState<{
    item: CloudHistoryItem;
    prepared: Awaited<ReturnType<typeof drive.prepareDataRestore>> | null;
    error: string | null;
  } | null>(null);

  if (!settings) return null;

  const refreshSnapshots = () => {
    setDataSnapshots(listSnapshots(getDb(), 'data'));
    setMediaSnapshots(listSnapshots(getDb(), 'media'));
  };

  const backupData = async () => {
    setBusy(true);
    try {
      const { path } = await writeDataBackup(getDb());
      refreshSnapshots();
      Alert.alert('Backup complete', `Data snapshot saved at ${path}`);
    } catch (error) {
      Alert.alert('Backup failed', String(error));
    } finally {
      setBusy(false);
    }
  };

  const backupMedia = async () => {
    setBusy(true);
    try {
      const { count, missing } = await createMediaSnapshot(getDb());
      refreshSnapshots();
      Alert.alert(
        missing > 0 ? 'Backup partially complete' : 'Backup complete',
        `${count} media file(s) snapshotted.${missing > 0 ? ` ${missing} missing file(s) could not be copied.` : ''}`,
      );
    } catch (error) {
      Alert.alert('Backup failed', String(error));
    } finally {
      setBusy(false);
    }
  };

  const pickRestoreFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const path = result.assets[0].uri;
    try {
      const manifest = readManifest(path);
      const validation = validateManifest(manifest);
      if (!validation.ok) {
        Alert.alert('Invalid backup', validation.error ?? 'Unknown error');
        return;
      }
      if (manifest.category !== 'data') {
        Alert.alert('Unsupported', 'Media backups must be restored from the backups folder on this device.');
        return;
      }
      const preview = await buildVerifiedRestorePreview(getDb(), manifest);
      setRestorePreview(preview);
      setRestoreSource({ type: 'data', path });
    } catch (error) {
      Alert.alert('Could not read backup', String(error));
    }
  };

  const restoreMedia = async () => {
    const snapshot = mediaSnapshots[0];
    if (!snapshot?.file_id) {
      Alert.alert('No media backup', 'Run "Backup Media Now" first.');
      return;
    }
    setBusy(true);
    try {
      const result = await applyMediaRestore(getDb(), snapshot.file_id);
      Alert.alert('Media restored', `${result.restored} restored, ${result.skipped} skipped.`);
    } catch (error) {
      Alert.alert('Restore failed', String(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreSource) return;
    setBusy(true);
    try {
      if (restoreSource.type === 'data') {
        const manifest = readManifest(restoreSource.path);
        const result = await applyDataRestore(getDb(), manifest);
        loadSettings();
        Alert.alert('Restore complete', `Added ${result.added}, updated ${result.updated}, deleted ${result.deleted}, skipped ${result.skipped}. Safety snapshot: ${result.safetySnapshotPath}`);
      }
      refreshSnapshots();
      setRestorePreview(null);
      setRestoreSource(null);
    } catch (error) {
      Alert.alert('Restore failed', String(error));
    } finally {
      setBusy(false);
    }
  };

  const setReminder = async (key: 'data' | 'media', frequency: ReminderFrequency) => {
    try {
      const applied = await scheduleReminder(key, frequency);
      if (!applied) {
        Alert.alert('Reminder not enabled', 'Notification permission is required. Your previous setting was kept.');
        return;
      }
      patch({ [key === 'data' ? 'dataReminderFrequency' : 'mediaReminderFrequency']: frequency });
    } catch (error) {
      Alert.alert('Reminder failed', String(error));
    }
  };

  const confirmDeleteSnapshot = (snapshot: BackupSnapshotRow) => {
    Alert.alert('Delete backup', 'The backup file and its history entry will both be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            deleteSnapshot(getDb(), snapshot.id);
            refreshSnapshots();
          } catch (error) {
            Alert.alert('Delete failed', String(error));
          }
        },
      },
    ]);
  };

  const connected = drive.connection?.connectionState === 'connected';
  const canSchedule = connected;

  const openCloudRestore = (item: CloudHistoryItem) => {
    if (!item.remoteFileId) return;
    setCloudRestore({ item, prepared: null, error: null });
    void drive.prepareDataRestore(item.remoteFileId)
      .then((prepared) => setCloudRestore((current) => (current ? { ...current, prepared } : current)))
      .catch((caught: unknown) => setCloudRestore((current) => (
        current ? { ...current, error: caught instanceof Error ? caught.message : 'The snapshot could not be verified.' } : current
      )));
  };

  const chooseFrequency = async (input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }) => {
    return drive.enableSchedule(input);
  };

  const takeOver = async (input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }) => {
    const outcome = await drive.takeOverAndEnable(input);
    if (outcome.kind === 'takeover_required') {
      Alert.alert('Take over failed', 'Another device won the claim. Refresh and try again.');
    }
  };

  return (
    <Screen scroll contentStyle={{ padding: 0 }}>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Header title="Backup & Restore" />
      </View>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        {drive.error ? (
          <AppText size="small" color={theme.color.danger} style={{ marginBottom: 8 }}>{drive.error}</AppText>
        ) : null}

        <DriveConnectionCard
          connection={drive.connection}
          ownerStatus={drive.ownerStatus}
          busy={drive.busy}
          onConnect={() => void drive.connect()}
          onReconnect={() => void drive.reconnect()}
          onDisconnect={() => {
            Alert.alert('Disconnect Google Drive?', 'Schedules pause and local connection state is removed. Your cloud backups stay in Drive.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Disconnect', style: 'destructive', onPress: () => void drive.disconnect() },
            ]);
          }}
          onResume={() => void drive.resumeSchedules()}
        />

        {drive.schedules.map((schedule) => (
          <View key={schedule.category} style={{ marginTop: CARD_STACK_GAP }}>
            <DriveScheduleCard
              schedule={schedule}
              busy={drive.busy}
              disabled={!canSchedule}
              onFrequency={chooseFrequency}
              onNetworkPolicy={(policy) => drive.setNetworkPolicy(schedule.category, policy)}
              onTakeOver={takeOver}
            />
          </View>
        ))}

        <View style={{ marginTop: CARD_STACK_GAP }}>
          <DriveManualActions
            connected={connected}
            schedules={drive.schedules}
            ownerStatus={drive.ownerStatus}
            busy={drive.busy}
            onRunManual={(category, options) => drive.runManual(category, options)}
            onBackupAll={async () => {
              const result = await drive.runBackupAll();
              if (result) {
                const mediaFailed = result.media.state === 'failed';
                Alert.alert(
                  mediaFailed ? 'Backup All partial' : 'Backup All complete',
                  mediaFailed
                    ? 'Data backup was saved, but the Media backup failed. Use "Retry Media" to continue.'
                    : `Data ${result.data.state} · Media ${result.media.state}.`,
                  mediaFailed
                    ? [
                        { text: 'OK', style: 'cancel' },
                        { text: 'Retry Media', onPress: () => void drive.runNotificationRetry('media') },
                      ]
                    : [{ text: 'OK' }],
                );
              }
            }}
            onEstimate={(category) => drive.estimate(category)}
          />
        </View>

        <View style={{ marginTop: CARD_STACK_GAP }}>
          <DriveBackupHistory
            history={drive.history}
            busy={drive.busy}
            onRefresh={() => drive.refresh()}
            onRestoreData={openCloudRestore}
            onRestoreMedia={openCloudRestore}
            onDelete={(category, remoteFileId) => drive.deleteSnapshot(category, remoteFileId)}
          />
        </View>

        <Card style={{ marginTop: CARD_STACK_GAP }}>
          <AppText size="xs" muted style={{ marginBottom: 12 }}>
            Your data lives on this device. Local backups are snapshots you can restore anytime — reminders never upload anything.
          </AppText>

          <AppText weight="semibold" size="small" style={{ marginBottom: 6 }}>Data reminder</AppText>
          <View style={styles.chips}>
            {FREQUENCIES.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                selected={settings.dataReminderFrequency === f.value}
                onPress={() => void setReminder('data', f.value)}
              />
            ))}
          </View>

          <AppText weight="semibold" size="small" style={{ marginTop: 12, marginBottom: 6 }}>Media reminder</AppText>
          <View style={styles.chips}>
            {FREQUENCIES.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                selected={settings.mediaReminderFrequency === f.value}
                onPress={() => void setReminder('media', f.value)}
              />
            ))}
          </View>

          <Button label="Backup Data Now" onPress={backupData} loading={busy} style={{ marginTop: 16 }} />
          <Button label="Backup Media Now" variant="secondary" onPress={backupMedia} loading={busy} style={{ marginTop: 8 }} />
          <Button label="Restore Data from file…" variant="secondary" onPress={pickRestoreFile} style={{ marginTop: 8 }} />
          <Button label="Restore Media" variant="secondary" onPress={restoreMedia} style={{ marginTop: 8 }} />

          {dataSnapshots.length > 0 ? (
            <>
              <AppText weight="semibold" size="small" style={{ marginTop: 16, marginBottom: 6 }}>Data history</AppText>
              {dataSnapshots.map((snap) => (
                <View key={snap.id} style={[styles.snapRow, { borderBottomColor: theme.color.borderLight }]}>
                  <View style={{ flex: 1 }}>
                    <AppText size="small">{formatISODate(snap.created_at.slice(0, 10))} · {snap.status}</AppText>
                    <AppText size="xs" muted numberOfLines={1}>{snap.file_id}</AppText>
                  </View>
                  <Pressable hitSlop={10} onPress={() => confirmDeleteSnapshot(snap)}>
                    <Ionicons name="trash-outline" size={16} color={theme.color.danger} />
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}

          {mediaSnapshots.length > 0 ? (
            <>
              <AppText weight="semibold" size="small" style={{ marginTop: 16, marginBottom: 6 }}>Media history</AppText>
              {mediaSnapshots.map((snap) => (
                <View key={snap.id} style={[styles.snapRow, { borderBottomColor: theme.color.borderLight }]}>
                  <AppText size="small" style={{ flex: 1 }}>{formatISODate(snap.created_at.slice(0, 10))} · {snap.status}</AppText>
                  <Pressable hitSlop={10} onPress={() => confirmDeleteSnapshot(snap)}>
                    <Ionicons name="trash-outline" size={16} color={theme.color.danger} />
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}
        </Card>
        <AppText size="xs" muted style={{ marginTop: 24, textAlign: 'center' }}>
          Google Drive backups live in your private Drive app-data folder and can be removed by you or Google at any time.
        </AppText>
      </View>

      <Modal visible={restorePreview !== null} onClose={() => { setRestorePreview(null); setRestoreSource(null); }} title="Restore Preview">
        {restorePreview ? (
          <>
            <AppText size="small" muted style={{ marginBottom: 8 }}>
              A safety snapshot of your current data is created before applying.
            </AppText>
            <View style={styles.previewRow}><AppText size="small" style={{ flex: 1 }}>Added</AppText><AppText weight="bold" size="small">{restorePreview.added}</AppText></View>
            <View style={styles.previewRow}><AppText size="small" style={{ flex: 1 }}>Updated</AppText><AppText weight="bold" size="small">{restorePreview.updated}</AppText></View>
            <View style={styles.previewRow}><AppText size="small" style={{ flex: 1 }}>Deleted</AppText><AppText weight="bold" size="small">{restorePreview.deleted}</AppText></View>
            <View style={styles.previewRow}><AppText size="small" style={{ flex: 1 }}>Skipped (local newer)</AppText><AppText weight="bold" size="small">{restorePreview.skipped}</AppText></View>
            <View style={styles.previewRow}><AppText size="small" style={{ flex: 1 }}>Missing media files</AppText><AppText weight="bold" size="small">{restorePreview.missingMedia}</AppText></View>
            <Button label="Restore Now" onPress={confirmRestore} loading={busy} style={{ marginTop: 16 }} />
          </>
        ) : null}
      </Modal>

      <DriveRestoreFlow
        visible={cloudRestore !== null}
        item={cloudRestore?.item ?? null}
        prepared={cloudRestore?.prepared ?? null}
        prepareError={cloudRestore?.error ?? null}
        recommendation={
          cloudRestore?.item && cloudRestore.prepared
            ? drive.recommendMedia(drive.history, cloudRestore.item)
            : null
        }
        onClose={() => setCloudRestore(null)}
        busy={drive.busy}
        onApplyData={(prepared) => drive.applyPreparedDataRestore(prepared)}
        onPrepareMedia={(item) => drive.prepareMediaRestore(item.remoteFileId!)}
        onApplyMedia={(prepared) => drive.applyPreparedMediaRestore(prepared)}
        onReleaseStaging={(path) => drive.releaseRestoreStaging(path)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
});

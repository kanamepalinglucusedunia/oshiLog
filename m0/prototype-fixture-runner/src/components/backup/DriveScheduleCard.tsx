import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Modal } from '@/components/ui/Modal';
import type { DriveCategory, DriveNetworkPolicy, DriveSchedule } from '@/drive/contracts';
import type { EnableScheduleOutcome } from '@/drive/scheduleEngine';
import { formatISODate } from '@/utils/date';

const FREQUENCIES: { value: DriveSchedule['frequency']; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const NETWORKS: { value: DriveNetworkPolicy; label: string }[] = [
  { value: 'any', label: 'Any network' },
  { value: 'wifi_only', label: 'Wi-Fi only' },
];

export type DriveScheduleCardProps = {
  schedule: DriveSchedule;
  busy: string | null;
  disabled: boolean;
  onFrequency(input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }): Promise<EnableScheduleOutcome>;
  onNetworkPolicy(policy: DriveNetworkPolicy): void;
  onTakeOver(input: { category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy }): Promise<void>;
};

function statusText(schedule: DriveSchedule): string {
  const parts: string[] = [];
  if (schedule.pausedReason === 'owner_changed') parts.push('Paused — another device owns scheduled backups');
  if (schedule.pausedReason === 'auth_required') parts.push('Paused — Google authorization required');
  if (schedule.pausedReason === 'disconnected') parts.push('Paused — Google Drive disconnected');
  if (schedule.lastResult === 'deferred') parts.push('Waiting for an eligible network');
  if (schedule.lastResult === 'no_change') parts.push('Last check: no changes');
  if (schedule.lastResult === 'partial') parts.push('Last run was partial (some files missing)');
  if (schedule.lastResult === 'failed') parts.push('Last run failed');
  if (schedule.nextDueAt) parts.push(`Next due: ${formatISODate(schedule.nextDueAt.slice(0, 10))}`);
  if (schedule.lastCheckedAt) parts.push(`Last checked: ${formatISODate(schedule.lastCheckedAt.slice(0, 10))}`);
  if (schedule.lastSuccessAt) parts.push(`Last successful: ${formatISODate(schedule.lastSuccessAt.slice(0, 10))}`);
  return parts.join(' · ');
}

export function DriveScheduleCard({
  schedule,
  busy,
  disabled,
  onFrequency,
  onNetworkPolicy,
  onTakeOver,
}: DriveScheduleCardProps) {
  const [takeover, setTakeover] = useState<{ category: DriveCategory; frequency: DriveSchedule['frequency']; networkPolicy: DriveNetworkPolicy } | null>(null);

  const chooseFrequency = async (frequency: DriveSchedule['frequency']) => {
    if (frequency === schedule.frequency) return;
    const selection = { category: schedule.category, frequency, networkPolicy: schedule.networkPolicy };
    const outcome = await onFrequency(selection);
    if (frequency !== 'off' && outcome?.kind === 'takeover_required') {
      setTakeover(selection);
    }
  };

  const categoryLabel = schedule.category === 'data' ? 'Data' : 'Media';

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <AppText weight="bold" size="body">{categoryLabel} schedule</AppText>
        <AppText size="xs" muted style={{ flex: 1, textAlign: 'right', marginLeft: 8 }}>{statusText(schedule)}</AppText>
      </View>

      <AppText size="small" muted style={{ marginBottom: 6 }}>Frequency</AppText>
      <View style={styles.chips}>
        {FREQUENCIES.map((frequency) => (
          <Chip
            key={frequency.value}
            label={frequency.label}
            selected={schedule.frequency === frequency.value}
            disabled={disabled || busy !== null}
            onPress={() => void chooseFrequency(frequency.value)}
          />
        ))}
      </View>

      <AppText size="small" muted style={{ marginTop: 10, marginBottom: 6 }}>Allowed network</AppText>
      <View style={styles.chips}>
        {NETWORKS.map((network) => (
          <Chip
            key={network.value}
            label={network.label}
            selected={schedule.networkPolicy === network.value}
            disabled={disabled || busy !== null}
            onPress={() => onNetworkPolicy(network.value)}
          />
        ))}
      </View>

      <Modal visible={takeover !== null} onClose={() => setTakeover(null)} title="Take over scheduled backups?">
        {takeover ? (
          <>
            <AppText size="small" muted style={{ marginBottom: 12 }}>
              Another device currently owns scheduled backups for this account. Taking over pauses the schedule on the
              other device and moves it to this device. Manual backups are not affected.
            </AppText>
            <Button
              label="Take over and enable"
              loading={busy === `takeover-${takeover.category}`}
              onPress={() => {
                const selection = takeover;
                setTakeover(null);
                void onTakeOver(selection);
              }}
            />
          </>
        ) : null}
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
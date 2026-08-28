import { useState } from 'react';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import type { DriveCategory, DriveNetworkPolicy } from '@/drive/contracts';
import type { ManualRunOutcome } from '@/drive/scheduleEngine';
import type { DriveOwnerStatus } from '@/hooks/useDriveBackup';

export type DriveManualActionsProps = {
  connected: boolean;
  schedules: { category: DriveCategory; networkPolicy: DriveNetworkPolicy }[];
  ownerStatus: DriveOwnerStatus;
  busy: string | null;
  onRunManual(category: DriveCategory, options?: { allowCellular?: boolean }): Promise<ManualRunOutcome>;
  onBackupAll(): Promise<void>;
  onEstimate(category: DriveCategory): Promise<{ bytes: number; itemCount?: number; missingCount?: number }>;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DriveManualActions({
  connected,
  schedules,
  ownerStatus,
  busy,
  onRunManual,
  onBackupAll,
  onEstimate,
}: DriveManualActionsProps) {
  const [confirmCellular, setConfirmCellular] = useState<{ category: DriveCategory; estimate: { bytes: number; itemCount?: number; missingCount?: number } } | null>(null);

  const runManual = async (category: DriveCategory, allowCellular = false) => {
    const outcome = await onRunManual(category, allowCellular ? { allowCellular: true } : undefined);
    if (outcome.kind === 'network_policy') {
      const estimate = await onEstimate(category);
      setConfirmCellular({ category, estimate });
    }
  };

  return (
    <Card>
      <AppText weight="bold" size="body" style={{ marginBottom: 4 }}>Manual Drive backup</AppText>
      <AppText size="small" muted style={{ marginBottom: 12 }}>
        {connected
          ? 'Back up now. Media uploads only send new files and continue where they stopped when you retry.'
          : 'Connect Google Drive first to enable manual backups.'}
      </AppText>

      <Button label="Backup Data now" disabled={!connected} loading={busy === 'backup-data'} onPress={() => void runManual('data')} />
      <Button
        label="Backup Media now"
        variant="secondary"
        disabled={!connected}
        loading={busy === 'backup-media'}
        onPress={() => void runManual('media')}
        style={{ marginTop: 8 }}
      />
      <Button label="Backup All" variant="secondary" disabled={!connected} loading={busy === 'backup-all'} onPress={() => void onBackupAll()} style={{ marginTop: 8 }} />

      <AppText size="xs" muted style={{ marginTop: 10 }}>
        {ownerStatus.isOwner
          ? 'This device runs scheduled backups.'
          : ownerStatus.ownerDeviceLabel
            ? `Scheduled backups run on ${ownerStatus.ownerDeviceLabel}; this device can still back up manually.`
            : 'Scheduled backups are off.'}
      </AppText>

      <Modal visible={confirmCellular !== null} onClose={() => setConfirmCellular(null)} title="Use mobile data?">
        {confirmCellular ? (
          <>
            <AppText size="small" muted style={{ marginBottom: 8 }}>
              {confirmCellular.category === 'data' ? 'Data' : 'Media'} backup is set to Wi-Fi only. This one-time run will
              use mobile data (about {formatBytes(confirmCellular.estimate.bytes)}
              {confirmCellular.estimate.missingCount ? `, ${confirmCellular.estimate.missingCount} file(s) missing` : ''}).
            </AppText>
            <Button
              label="Use mobile data once"
              loading={busy === `backup-${confirmCellular.category}`}
              onPress={() => {
                const category = confirmCellular.category;
                setConfirmCellular(null);
                void runManual(category, true);
              }}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setConfirmCellular(null)} style={{ marginTop: 8 }} />
          </>
        ) : null}
      </Modal>
    </Card>
  );
}
import { useState } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/hooks/useTheme';
import type { CloudHistoryItem } from '@/drive/cloudHistory';
import type {
  DataRestorePrepared,
  MediaRecommendation,
  MediaRestorePrepared,
  MediaRestoreResult,
} from '@/drive/driveRestore';
import type { RestoreResult } from '@/services/backup';
import { formatISODate } from '@/utils/date';

export type DriveRestoreFlowProps = {
  visible: boolean;
  item: CloudHistoryItem | null;
  prepared: DataRestorePrepared | null;
  prepareError: string | null;
  recommendation: MediaRecommendation | null;
  onClose(): void;
  busy: string | null;
  onApplyData(prepared: DataRestorePrepared): Promise<RestoreResult>;
  onPrepareMedia(item: CloudHistoryItem): Promise<MediaRestorePrepared>;
  onApplyMedia(prepared: MediaRestorePrepared): Promise<MediaRestoreResult>;
  onReleaseStaging(path: string): void;
};

type ResultStep = { dataResult?: RestoreResult; mediaResult?: MediaRestoreResult };

export function DriveRestoreFlow({
  visible,
  item,
  prepared,
  prepareError,
  recommendation,
  onClose,
  busy,
  onApplyData,
  onPrepareMedia,
  onApplyMedia,
  onReleaseStaging,
}: DriveRestoreFlowProps) {
  const theme = useTheme();
  const [includeMedia, setIncludeMedia] = useState(true);
  const [result, setResult] = useState<ResultStep | null>(null);

  const close = () => {
    if (prepared) onReleaseStaging(prepared.stagingPath);
    setResult(null);
    onClose();
  };

  const apply = async () => {
    if (!prepared) return;
    const dataResult = await onApplyData(prepared);
    let mediaResult: MediaRestoreResult | undefined;
    if (includeMedia && recommendation?.media) {
      try {
        const mediaPrepared = await onPrepareMedia(recommendation.media);
        mediaResult = await onApplyMedia(mediaPrepared);
      } catch {
        mediaResult = { restored: 0, skipped: 0, missingRemote: 0, failed: 1 };
      }
    }
    setResult({ dataResult, mediaResult });
  };

  return (
    <Modal visible={visible} onClose={close} title="Restore from Google Drive">
      {item && !prepared && !prepareError ? (
        <AppText size="small" muted>Verifying the selected snapshot…</AppText>
      ) : null}

      {prepareError ? (
        <>
          <AppText size="small" color={theme.color.danger} style={{ marginBottom: 12 }}>{prepareError}</AppText>
          <Button label="Close" onPress={close} />
        </>
      ) : null}

      {prepared && !result ? (
        <>
          <AppText weight="semibold" size="small" style={{ marginBottom: 6 }}>
            Data snapshot · {formatISODate(prepared.createdAt.slice(0, 10))}
            {prepared.deviceLabel ? ` · ${prepared.deviceLabel}` : ''}
          </AppText>
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <AppText size="small" muted>Records added</AppText><AppText size="small">{prepared.preview.added}</AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <AppText size="small" muted>Records updated</AppText><AppText size="small">{prepared.preview.updated}</AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <AppText size="small" muted>Records deleted</AppText><AppText size="small">{prepared.preview.deleted}</AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <AppText size="small" muted>Skipped (local newer)</AppText><AppText size="small">{prepared.preview.skipped}</AppText>
            </View>
            <AppText size="xs" muted style={{ marginTop: 8 }}>
              A safety snapshot of your current data is created before anything changes. Restore is merge-only — nothing is replaced.
            </AppText>
          </View>

          {recommendation?.media ? (
            <View style={{ marginBottom: 12 }}>
              <AppText weight="semibold" size="small" style={{ marginBottom: 4 }}>Media (optional)</AppText>
              <AppText size="small" muted>
                Recommended: {formatISODate(recommendation.media.createdAt.slice(0, 10))} · {recommendation.media.deviceLabel ?? 'Unknown device'}
                {recommendation.media.missingCount ? ` · ${recommendation.media.missingCount} missing file(s)` : ''}
              </AppText>
              {!recommendation.sameDevice || recommendation.newerThanData ? (
                <AppText size="xs" color={theme.color.warning} style={{ marginTop: 4 }}>
                  Warning: this Media snapshot {!recommendation.sameDevice ? 'was created on another device' : ''}
                  {!recommendation.sameDevice && recommendation.newerThanData ? ' and ' : ''}
                  {recommendation.newerThanData ? 'is newer than the selected Data snapshot' : ''}.
                </AppText>
              ) : null}
            </View>
          ) : (
            <AppText size="small" muted style={{ marginBottom: 12 }}>
              No Media snapshot is available; restoring Data only.
            </AppText>
          )}

          {recommendation?.media ? (
            <Button
              label={includeMedia ? 'Include recommended Media' : 'Data only'}
              variant="secondary"
              onPress={() => setIncludeMedia((value) => !value)}
              style={{ marginBottom: 8 }}
            />
          ) : null}

          <Button label="Restore now" loading={busy !== null} onPress={() => void apply()} />
          <Button label="Cancel" variant="ghost" onPress={close} style={{ marginTop: 8 }} />
        </>
      ) : null}

      {result ? (
        <>
          <View style={{ marginBottom: 12 }}>
            <AppText weight="semibold" size="small" style={{ marginBottom: 4 }}>Data restore result</AppText>
            <AppText size="small" muted>
              {result.dataResult
                ? `Added ${result.dataResult.added} · updated ${result.dataResult.updated} · deleted ${result.dataResult.deleted} · skipped ${result.dataResult.skipped}.`
                : 'No Data restore was applied.'}
            </AppText>
            <AppText size="xs" muted style={{ marginTop: 2 }}>
              Safety snapshot: {result.dataResult?.safetySnapshotPath ?? 'not created'}
            </AppText>
          </View>
          {result.mediaResult ? (
            <View style={{ marginBottom: 12 }}>
              <AppText weight="semibold" size="small" style={{ marginBottom: 4 }}>Media restore result</AppText>
              <AppText size="small" muted>
                Restored {result.mediaResult.restored} · skipped {result.mediaResult.skipped} · missing remotely {result.mediaResult.missingRemote} · failed {result.mediaResult.failed}.
              </AppText>
            </View>
          ) : null}
          <Button label="Done" onPress={close} />
        </>
      ) : null}
    </Modal>
  );
}
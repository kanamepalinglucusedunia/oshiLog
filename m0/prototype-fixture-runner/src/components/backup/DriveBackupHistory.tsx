import { Alert, Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import type { CloudHistoryItem } from '@/drive/cloudHistory';
import type { DriveCategory } from '@/drive/contracts';
import { formatISODate } from '@/utils/date';

export type DriveBackupHistoryProps = {
  history: CloudHistoryItem[];
  busy: string | null;
  onRefresh(): Promise<void>;
  onRestoreData(item: CloudHistoryItem): void;
  onRestoreMedia(item: CloudHistoryItem): void;
  onDelete(category: DriveCategory, remoteFileId: string): Promise<void>;
};

function statusBadge(item: CloudHistoryItem): { label: string; kind: 'ok' | 'partial' | 'failed' | 'running' | 'none' } {
  if (item.jobState && ['queued', 'preparing', 'uploading', 'verifying'].includes(item.jobState)) {
    return { label: 'In progress', kind: 'running' };
  }
  if (item.status === 'partial' || item.complete === false) return { label: 'Partial', kind: 'partial' };
  if (item.status === 'failed') return { label: 'Failed', kind: 'failed' };
  if (item.status === 'committed') return { label: 'Complete', kind: 'ok' };
  if (item.status === 'cancelled') return { label: 'Cancelled', kind: 'none' };
  return { label: item.status, kind: 'none' };
}

function badgeColor(kind: 'ok' | 'partial' | 'failed' | 'running' | 'none', theme: ReturnType<typeof useTheme>): string {
  switch (kind) {
    case 'ok': return theme.color.accent;
    case 'partial': return theme.color.warning ?? theme.color.accent;
    case 'failed': return theme.color.danger;
    case 'running': return theme.color.accent;
    default: return theme.color.textMuted;
  }
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DriveBackupHistory({
  history,
  busy,
  onRefresh,
  onRestoreData,
  onRestoreMedia,
  onDelete,
}: DriveBackupHistoryProps) {
  const theme = useTheme();
  const items = history.filter((item) => item.remoteFileId !== undefined);

  const confirmDelete = (item: CloudHistoryItem) => {
    if (!item.remoteFileId) return;
    Alert.alert(
      'Delete cloud backup',
      item.category === 'data'
        ? 'This Data snapshot will be permanently deleted from the Drive app-data folder. Other snapshots are not affected.'
        : 'This Media snapshot and any blobs no other snapshot references will be permanently deleted from Drive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void onDelete(item.category, item.remoteFileId!);
          },
        },
      ],
    );
  };

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="cloud-offline-outline"
          title="No cloud backups yet"
          description="Back up Data or Media from above to see your Drive history here."
          actionLabel="Refresh"
          onAction={() => void onRefresh()}
        />
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <AppText weight="bold" size="body">Cloud history</AppText>
        <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Refresh cloud history" onPress={() => void onRefresh()}>
          <Ionicons name="refresh-outline" size={18} color={theme.color.accent} />
        </Pressable>
      </View>
      {items.map((item) => {
        const badge = statusBadge(item);
        return (
          <View key={`${item.category}-${item.snapshotId ?? item.jobId ?? item.remoteFileId}`} style={[styles.row, { borderBottomColor: theme.color.borderLight }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText size="small" weight="semibold">{item.category === 'data' ? 'Data' : 'Media'}</AppText>
                <AppText size="xs" muted>{formatISODate(item.createdAt.slice(0, 10))}</AppText>
                <View style={[styles.badge, { backgroundColor: theme.color.accentSurface, borderColor: badgeColor(badge.kind, theme), borderWidth: theme.surface.style === 'outline' ? 2 : 1 }]}>
                  <AppText size="xs" color={badgeColor(badge.kind, theme)}>{badge.label}</AppText>
                </View>
              </View>
              <AppText size="xs" muted numberOfLines={1}>
                {item.deviceLabel ?? 'Unknown device'} · {formatBytes(item.byteSize)}
                {item.missingCount ? ` · ${item.missingCount} missing` : ''}
              </AppText>
              {item.cleanupPending ? (
                <AppText size="xs" color={theme.color.warning ?? theme.color.danger}>Cleanup pending</AppText>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {item.category === 'data' ? (
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore Data snapshot ${item.snapshotId ?? ''}`}
                  onPress={() => onRestoreData(item)}
                >
                  <Ionicons name="download-outline" size={18} color={theme.color.accent} />
                </Pressable>
              ) : (
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Restore Media snapshot ${item.snapshotId ?? ''}`}
                  onPress={() => onRestoreMedia(item)}
                >
                  <Ionicons name="download-outline" size={18} color={theme.color.accent} />
                </Pressable>
              )}
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Delete cloud backup ${item.snapshotId ?? ''}`}
                disabled={busy !== null}
                onPress={() => confirmDelete(item)}
              >
                <Ionicons name="trash-outline" size={16} color={theme.color.danger} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
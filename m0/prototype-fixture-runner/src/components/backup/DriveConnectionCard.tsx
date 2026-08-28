import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/hooks/useTheme';
import type { DriveConnection } from '@/drive/contracts';
import type { DriveOwnerStatus } from '@/hooks/useDriveBackup';

export type DriveConnectionCardProps = {
  connection: DriveConnection | null;
  ownerStatus: DriveOwnerStatus;
  busy: string | null;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onResume: () => void;
};

export function DriveConnectionCard({
  connection,
  ownerStatus,
  busy,
  onConnect,
  onReconnect,
  onDisconnect,
  onResume,
}: DriveConnectionCardProps) {
  const theme = useTheme();
  const connected = connection?.connectionState === 'connected';

  return (
    <Card accent={connected}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Ionicons name={connected ? 'cloud-done-outline' : 'cloud-outline'} size={22} color={theme.color.accent} />
        <View style={{ flex: 1 }}>
          <AppText weight="bold" size="body">Google Drive backup</AppText>
          {connection?.accountEmail ? (
            <AppText size="small" muted numberOfLines={1}>{connection.accountEmail}</AppText>
          ) : (
            <AppText size="small" muted>Back up data and media to your private Drive app-data folder.</AppText>
          )}
        </View>
      </View>

      {!connection || connection.connectionState === 'disconnected' ? (
        <Button
          label={connection ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          onPress={onConnect}
          loading={busy === 'connect' || busy === 'reconnect'}
        />
      ) : null}

      {connection?.connectionState === 'auth_required' ? (
        <>
          <AppText size="small" muted style={{ marginBottom: 8 }}>
            Google authorization was revoked. Schedules are paused until you reconnect.
          </AppText>
          <Button label="Reconnect Google Drive" onPress={onReconnect} loading={busy === 'reconnect'} />
        </>
      ) : null}

      {connected ? (
        <>
          <View style={{ marginBottom: 10 }}>
            <AppText size="small" muted>
              {ownerStatus.isOwner
                ? `Scheduled owner: this device${ownerStatus.ownerDeviceLabel ? ` (${ownerStatus.ownerDeviceLabel})` : ''}`
                : ownerStatus.ownerDeviceLabel
                  ? `Scheduled owner: ${ownerStatus.ownerDeviceLabel} — manual backups still work here.`
                  : 'No device owns scheduled backups yet.'}
            </AppText>
            {connection?.schedulesPaused ? (
              <AppText size="small" color={theme.color.danger} style={{ marginTop: 4 }}>
                Schedules are paused{connection.pauseReason === 'owner_changed' ? ' because another device took over.' : '.'}
              </AppText>
            ) : null}
          </View>
          {connection?.schedulesPaused ? (
            <Button label="Resume schedules" onPress={onResume} loading={busy === 'resume'} variant="secondary" style={{ marginBottom: 8 }} />
          ) : null}
          <Button label="Disconnect" variant="danger" onPress={onDisconnect} loading={busy === 'disconnect'} />
        </>
      ) : null}
    </Card>
  );
}
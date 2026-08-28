import { notificationsAvailable } from '@/services/notificationsBridge';

type NotificationsModule = typeof import('expo-notifications');

const CHANNEL_ID = 'drive-backups';
const CHANNEL_NAME = 'Google Drive backups';
let notificationsModule: NotificationsModule | null = null;

function getNotifications(): NotificationsModule | null {
  if (!notificationsAvailable()) return null;
  if (notificationsModule) return notificationsModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notificationsModule = require('expo-notifications') as NotificationsModule;
  return notificationsModule;
}

export type DriveNotificationOutcome = 'success' | 'no_change' | 'partial' | 'failed';

export type DriveResultNotificationInput = {
  category: 'data' | 'media';
  outcome: DriveNotificationOutcome;
  itemCount?: number;
  bytesTotal?: number;
  missingCount?: number;
  errorCode?: string;
};

function categoryLabel(category: 'data' | 'media'): string {
  return category === 'data' ? 'Data' : 'Media';
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resultBody(input: DriveResultNotificationInput): string {
  switch (input.outcome) {
    case 'success':
      return `${categoryLabel(input.category)} backed up · ${input.itemCount ?? 0} item(s) · ${formatBytes(input.bytesTotal)}.`;
    case 'no_change':
      return `No changes in ${categoryLabel(input.category).toLowerCase()} since the last check.`;
    case 'partial': {
      const committed = (input.itemCount ?? 0) - (input.missingCount ?? 0);
      return `${categoryLabel(input.category)} backup committed ${committed} item(s); ${input.missingCount ?? 0} missing.`;
    }
    case 'failed':
      return `${categoryLabel(input.category)} backup failed. Open oshiLog to retry.`;
  }
}

async function ensureReady(mod: NotificationsModule): Promise<boolean> {
  if (mod.setNotificationChannelAsync) {
    await mod.setNotificationChannelAsync(CHANNEL_ID, {
      name: CHANNEL_NAME,
      importance: mod.AndroidImportance.DEFAULT,
    });
  }
  const permission = await mod.getPermissionsAsync();
  if (!permission.granted) {
    const requested = await mod.requestPermissionsAsync();
    if (!requested.granted) return false;
  }
  return true;
}

async function schedule(mod: NotificationsModule, input: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  const ready = await ensureReady(mod);
  if (!ready) return false;
  // Immediate (seconds = 1) local notification on the Drive channel.
  await mod.scheduleNotificationAsync({
    content: { title: input.title, body: input.body, data: input.data ?? {} },
    trigger: {
      type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: CHANNEL_ID,
    },
  });
  return true;
}

/**
 * Result notifications for automatic Drive backup runs. Notification denial
 * never blocks backup; it only means no banner is shown.
 */
export function createDriveNotifications() {
  return {
    async notifyResult(input: DriveResultNotificationInput): Promise<boolean> {
      const mod = getNotifications();
      if (!mod) return false;
      const title = input.outcome === 'failed'
        ? `${categoryLabel(input.category)} backup failed`
        : input.outcome === 'partial'
          ? `${categoryLabel(input.category)} backup partial`
          : `${categoryLabel(input.category)} backup ✓`;
      return schedule(mod, {
        title,
        body: resultBody(input),
        data: input.outcome === 'failed' ? { driveRetryCategory: input.category } : { driveRetryCategory: undefined },
      });
    },

    async notifyOwnershipChanged(): Promise<boolean> {
      const mod = getNotifications();
      if (!mod) return false;
      return schedule(mod, {
        title: 'Scheduled backups moved',
        body: 'Another device now owns your scheduled oshiLog Drive backups. This device paused its schedule.',
      });
    },

    async notifyAuthRequired(): Promise<boolean> {
      const mod = getNotifications();
      if (!mod) return false;
      return schedule(mod, {
        title: 'Google Drive authorization needed',
        body: 'Schedules are paused. Open oshiLog and reconnect Google Drive.',
      });
    },
  };
}
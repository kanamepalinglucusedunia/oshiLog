import type { ReminderFrequency } from '@/types/domain';
import { notificationsAvailable } from './notificationsBridge';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null = null;

function getNotifications(): NotificationsModule | null {
  if (!notificationsAvailable()) return null;
  if (notificationsModule) return notificationsModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notificationsModule = require('expo-notifications') as NotificationsModule;
  return notificationsModule;
}

const CHANNEL_ID = 'backup-reminders';

async function ensureReady(mod: NotificationsModule): Promise<boolean> {
  if (mod.setNotificationChannelAsync) {
    await mod.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Backup reminders',
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

function triggerFor(mod: NotificationsModule, frequency: Exclude<ReminderFrequency, 'off'>) {
  if (frequency === 'daily') return mod.SchedulableTriggerInputTypes.DAILY;
  if (frequency === 'weekly') return mod.SchedulableTriggerInputTypes.WEEKLY;
  return mod.SchedulableTriggerInputTypes.MONTHLY;
}

/**
 * (Re)schedules a backup reminder. "off" cancels the scheduled notification.
 * Reminders never upload anything — they only open the Backup page.
 * No-ops when notifications are unavailable (e.g. Expo Go).
 */
export async function scheduleReminder(identifier: 'data' | 'media', frequency: ReminderFrequency): Promise<boolean> {
  const mod = getNotifications();
  if (!mod) return frequency === 'off';
  try {
    await mod.cancelScheduledNotificationAsync(identifier);
  } catch {
    // not scheduled yet
  }
  if (frequency === 'off') return true;
  const ready = await ensureReady(mod);
  if (!ready) return false;

  const type = triggerFor(mod, frequency);
  await mod.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'oshiLog backup',
      body: frequency === 'daily'
        ? 'Daily reminder: back up your oshiLog journal.'
        : frequency === 'weekly'
          ? 'Weekly reminder: back up your oshiLog journal.'
          : 'Monthly reminder: back up your oshiLog journal.',
      data: { openSettings: true },
    },
    trigger: {
      type,
      hour: 9,
      minute: 0,
      ...(type === mod.SchedulableTriggerInputTypes.WEEKLY ? { weekday: 1 } : {}),
      ...(type === mod.SchedulableTriggerInputTypes.MONTHLY ? { day: 1 } : {}),
      channelId: CHANNEL_ID,
    },
  });
  return true;
}

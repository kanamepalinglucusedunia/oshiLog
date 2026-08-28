import Constants, { ExecutionEnvironment } from 'expo-constants';

type NotificationsModule = typeof import('expo-notifications');
type NotificationResponseListener = Parameters<NotificationsModule['addNotificationResponseReceivedListener']>[0];

let notificationsModule: NotificationsModule | null = null;
let notificationsUnavailable = false;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Lazily loads expo-notifications — but ONLY outside Expo Go.
 *
 * Expo Go (SDK 53+) removed Android push notifications: evaluating the module
 * triggers `DevicePushTokenAutoRegistration` which throws a hard error, so the
 * module must never be evaluated there. We gate on the execution environment
 * first and only fall back to try/catch for any other unexpected environment.
 */
function getNotifications(): NotificationsModule | null {
  if (notificationsModule) return notificationsModule;
  if (notificationsUnavailable) return null;
  if (isExpoGo()) {
    notificationsUnavailable = true;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    notificationsModule = mod;
    return mod;
  } catch {
    notificationsUnavailable = true;
    return null;
  }
}

/** Returns true when reminder scheduling can actually run on this runtime. */
export function notificationsAvailable(): boolean {
  return getNotifications() !== null;
}

/**
 * Subscribes to notification taps. Returns a no-op unsubscribe when
 * notifications are unavailable (e.g. Expo Go).
 */
export function subscribeToNotificationResponses(listener: NotificationResponseListener): () => void {
  const mod = getNotifications();
  if (!mod) return () => {};
  const subscription = mod.addNotificationResponseReceivedListener(listener);
  return () => subscription.remove();
}

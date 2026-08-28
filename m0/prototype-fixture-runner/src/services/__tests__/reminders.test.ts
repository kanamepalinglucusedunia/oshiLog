import * as Notifications from 'expo-notifications';
import { scheduleReminder } from '../reminders';

describe('scheduleReminder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancels and schedules a daily reminder', async () => {
    await expect(scheduleReminder('data', 'daily')).resolves.toBe(true);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('data');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'data',
        trigger: expect.objectContaining({ type: 'daily', hour: 9, minute: 0 }),
      }),
    );
  });

  it('uses weekly trigger for weekly frequency', async () => {
    await scheduleReminder('media', 'weekly');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'media', trigger: expect.objectContaining({ weekday: 1 }) }),
    );
  });

  it('cancels without scheduling when off', async () => {
    await expect(scheduleReminder('data', 'off')).resolves.toBe(true);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('data');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reports permission denial so settings do not claim a reminder is active', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });

    await expect(scheduleReminder('data', 'daily')).resolves.toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

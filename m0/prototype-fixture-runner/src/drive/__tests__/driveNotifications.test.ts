import { createDriveNotifications } from '../driveNotifications';

const notificationsModule = jest.requireMock('expo-notifications');

function resetMocks() {
  jest.clearAllMocks();
  (notificationsModule.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
  (notificationsModule.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (notificationsModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (notificationsModule.setNotificationChannelAsync as jest.Mock).mockResolvedValue(undefined);
}

describe('drive notifications', () => {
  beforeEach(resetMocks);

  it('returns false without scheduling when permissions are denied', async () => {
    (notificationsModule.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    (notificationsModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    const notifications = createDriveNotifications();
    const applied = await notifications.notifyResult({
      category: 'data', outcome: 'success', itemCount: 12, bytesTotal: 4096,
    });
    expect(applied).toBe(false);
    expect(notificationsModule.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('requests permission when not yet granted and proceeds when granted', async () => {
    (notificationsModule.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    (notificationsModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    const notifications = createDriveNotifications();
    const applied = await notifications.notifyResult({ category: 'data', outcome: 'success' });
    expect(applied).toBe(true);
    expect(notificationsModule.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('notifies a successful automatic run with category and size', async () => {
    const notifications = createDriveNotifications();
    const applied = await notifications.notifyResult({
      category: 'media', outcome: 'success', itemCount: 3, bytesTotal: 5_242_880,
    });
    expect(applied).toBe(true);
    expect(notificationsModule.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: expect.stringContaining('Media backup'),
          body: expect.stringContaining('3'),
        }),
      }),
    );
  });

  it('notifies no_change without retry data', async () => {
    const notifications = createDriveNotifications();
    await notifications.notifyResult({ category: 'data', outcome: 'no_change' });
    const call = notificationsModule.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.content.body).toContain('No changes');
    expect(call.content.data.driveRetryCategory).toBeUndefined();
  });

  it('notifies partial with the missing portion visible', async () => {
    const notifications = createDriveNotifications();
    await notifications.notifyResult({
      category: 'media', outcome: 'partial', itemCount: 5, bytesTotal: 1024, missingCount: 2,
    });
    const call = notificationsModule.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.content.body).toContain('2 missing');
  });

  it('failure notification carries an explicit retry action for the category', async () => {
    const notifications = createDriveNotifications();
    await notifications.notifyResult({ category: 'media', outcome: 'failed', errorCode: 'QUOTA_EXCEEDED' });
    const call = notificationsModule.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.content.data.driveRetryCategory).toBe('media');
    expect(call.content.body).not.toContain('QUOTA');
    expect(call.content.body).not.toContain('quota');
  });

  it('notifies ownership change once per call with safe copy', async () => {
    const notifications = createDriveNotifications();
    await notifications.notifyOwnershipChanged();
    const call = notificationsModule.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.content.body).toContain('Another device');
    expect(JSON.stringify(call)).not.toMatch(/token|secret|session/i);
  });

  it('notifies auth-required with a reconnect hint', async () => {
    const notifications = createDriveNotifications();
    await notifications.notifyAuthRequired();
    const call = notificationsModule.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.content.body).toContain('reconnect');
  });
});
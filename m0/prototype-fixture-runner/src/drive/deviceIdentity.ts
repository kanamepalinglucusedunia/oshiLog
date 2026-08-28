import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { uuid } from '@/utils/id';

type DeviceIdentity = { deviceId: string; deviceLabel: string };

const IDENTITY_KEY = 'drive-device-identity';

function deviceLabel(): string {
  const constants = Platform.constants as { Model?: unknown; model?: unknown };
  const model = constants.Model ?? constants.model;
  return typeof model === 'string' && model.trim().length > 0 ? model.trim() : 'OshiLog device';
}

/**
 * Stable, install-scoped device identity used for remote schedule ownership.
 * The value is a random UUID that is not exported and contains no token.
 */
export async function getDriveDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const stored = await SecureStore.getItemAsync(IDENTITY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DeviceIdentity>;
      if (parsed?.deviceId && parsed?.deviceLabel) {
        return { deviceId: parsed.deviceId, deviceLabel: parsed.deviceLabel };
      }
    }
  } catch {
    // Regenerate below; a corrupt identity is not a security event.
  }
  const identity: DeviceIdentity = { deviceId: uuid(), deviceLabel: deviceLabel() };
  try {
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Identity is still usable for this session even if persistence fails.
  }
  return identity;
}
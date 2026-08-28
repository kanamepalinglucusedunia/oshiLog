import * as SecureStore from 'expo-secure-store';

type NativeSecretStore = Pick<typeof SecureStore, 'setItemAsync' | 'getItemAsync' | 'deleteItemAsync'>;

const KEY_PATTERN = /^drive-session:[A-Za-z0-9._:-]{1,200}$/;

export function createDriveSecretStore(native: NativeSecretStore = SecureStore) {
  const validateKey = (key: string) => {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid Drive secret key');
  };
  return {
    async set(key: string, value: string): Promise<void> {
      validateKey(key);
      if (!value) throw new Error('Drive secret value must not be empty');
      await native.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    },
    async get(key: string): Promise<string | null> {
      validateKey(key);
      return native.getItemAsync(key);
    },
    async delete(key: string): Promise<void> {
      validateKey(key);
      await native.deleteItemAsync(key);
    },
  };
}

export type DriveSecretStore = ReturnType<typeof createDriveSecretStore>;

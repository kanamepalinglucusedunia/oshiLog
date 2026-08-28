import { createDriveSecretStore } from '../secretStore';

describe('Drive SecureStore adapter', () => {
  it('stores, reads, and deletes a secret only through the injected native store', async () => {
    const native = { setItemAsync: jest.fn(async () => undefined), getItemAsync: jest.fn(async () => 'secret'), deleteItemAsync: jest.fn(async () => undefined) };
    const store = createDriveSecretStore(native);
    await store.set('drive-session:one', 'https://upload.example/secret');
    await expect(store.get('drive-session:one')).resolves.toBe('secret');
    await store.delete('drive-session:one');
    expect(native.setItemAsync).toHaveBeenCalledWith('drive-session:one', 'https://upload.example/secret', expect.objectContaining({ keychainAccessible: expect.any(Number) }));
    expect(native.deleteItemAsync).toHaveBeenCalledWith('drive-session:one');
  });

  it('rejects non-namespaced keys and empty secret values', async () => {
    const native = { setItemAsync: jest.fn(), getItemAsync: jest.fn(), deleteItemAsync: jest.fn() };
    const store = createDriveSecretStore(native);
    await expect(store.set('wrong', 'secret')).rejects.toThrow(/key/i);
    await expect(store.set('drive-session:one', '')).rejects.toThrow(/empty/i);
  });
});

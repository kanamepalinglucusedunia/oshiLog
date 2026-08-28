import { DriveClientError } from '@/drive/client';
import type { DriveFile, DriveFileMetadataInput, DriveFileFilter } from '@/drive/client';
import { createDriveOwnership } from '../ownership';
import type { DriveSecretStore } from '../secretStore';

type StoredFile = { file: DriveFile; content: string };

const NOW = '2026-08-17T09:00:00.000Z';

function secretStore(initial: Record<string, string> = {}): jest.Mocked<DriveSecretStore> {
  const values = new Map(Object.entries(initial));
  return {
    set: jest.fn(async (key, value) => { values.set(key, value); }),
    get: jest.fn(async (key) => values.get(key) ?? null),
    delete: jest.fn(async (key) => { values.delete(key); }),
  };
}

function createFakeDrive(initial: StoredFile[] = []) {
  const files = new Map<string, StoredFile>();
  for (const item of initial) files.set(item.file.id, item);
  let counter = 1;
  const drive = {
    listFiles: jest.fn(async (filter?: DriveFileFilter): Promise<DriveFile[]> => {
      return [...files.values()]
        .map((item) => item.file)
        .filter((file) => {
          if (!filter) return true;
          const properties = file.appProperties as Record<string, string> | undefined;
          if (!properties) return false;
          return Object.entries(filter as Record<string, string>).every(([key, value]) => properties[key] === String(value));
        });
    }),
    createMultipart: jest.fn(async (metadata: DriveFileMetadataInput): Promise<DriveFile> => {
      const id = `file-${counter++}`;
      const file: DriveFile = { id, name: metadata.name, size: '2', modifiedTime: NOW, appProperties: metadata.appProperties };
      files.set(id, { file, content: '{}' });
      return file;
    }),
    updateMultipart: jest.fn(async (id: string, metadata: DriveFileMetadataInput): Promise<DriveFile> => {
      const current = files.get(id);
      if (!current) throw new DriveClientError('UNKNOWN', 'missing');
      const file: DriveFile = { ...current.file, name: metadata.name, appProperties: metadata.appProperties, modifiedTime: NOW };
      files.set(id, { file, content: '{}' });
      return file;
    }),
    updateMetadata: jest.fn(async (id: string, metadata: DriveFileMetadataInput): Promise<DriveFile> => {
      const current = files.get(id);
      if (!current) throw new DriveClientError('UNKNOWN', 'missing');
      const file: DriveFile = { ...current.file, name: metadata.name, appProperties: metadata.appProperties, modifiedTime: NOW };
      files.set(id, { file, content: current.content });
      return file;
    }),
    getMetadata: jest.fn(async (id: string): Promise<DriveFile> => {
      const item = files.get(id);
      if (!item) throw new DriveClientError('UNKNOWN', 'missing');
      return item.file;
    }),
    download: jest.fn(async (): Promise<Uint8Array> => new Uint8Array(0)),
    downloadVerified: jest.fn(async (): Promise<Uint8Array> => new Uint8Array(0)),
    deleteFile: jest.fn(async (id: string): Promise<void> => { files.delete(id); }),
    startResumable: jest.fn(),
    uploadChunk: jest.fn(),
    queryResumable: jest.fn(),
    _files: files,
  };
  return drive;
}

describe('drive ownership', () => {
  const claimProps = (overrides: Partial<Record<string, string>> = {}): DriveFile['appProperties'] => {
    const base: Record<string, string> = {
      app: 'oshilog',
      formatVersion: '1',
      artifactType: 'owner',
      deviceId: 'device-1',
      deviceLabel: 'Pixel',
      claimId: 'claim-1',
      claimedAt: NOW,
    };
    return { ...base, ...overrides } as DriveFile['appProperties'];
  };

  it('reports no owner for an empty appDataFolder', async () => {
    const drive = createFakeDrive();
    const ownership = createDriveOwnership({
      client: drive,
      secrets: secretStore(),
      now: () => NOW,
      createId: (() => { let id = 0; return () => `claim-${++id}`; })(),
      deviceId: () => 'device-1',
      deviceLabel: () => 'Pixel',
    });
    expect(await ownership.readOwner()).toBeNull();
    expect(drive.deleteFile).not.toHaveBeenCalled();
  });

  it('claims ownership on an empty folder and persists the claim locally', async () => {
    const drive = createFakeDrive();
    const secrets = secretStore();
    const ownership = createDriveOwnership({
      client: drive, secrets,
      now: () => NOW,
      createId: () => 'claim-1',
      deviceId: () => 'device-1',
      deviceLabel: () => 'Pixel',
    });

    const claimId = await ownership.claimOwnership();
    expect(claimId).toBe('claim-1');
    expect(await secrets.get('drive-owner-claim')).toBe('claim-1');
    expect(await ownership.isCurrentlyOwner()).toBe(true);
  });

  it('allows the current owner to keep schedules enabled', async () => {
    const drive = createFakeDrive();
    const ownership = createDriveOwnership({
      client: drive,
      secrets: secretStore({ 'drive-owner-claim': 'claim-1' }),
      now: () => NOW,
      createId: () => 'new-claim',
      deviceId: () => 'device-1',
      deviceLabel: () => 'Pixel',
    });
    await ownership.claimOwnership();
    await expect(ownership.verifyBeforeRun()).resolves.toBeUndefined();
    await expect(ownership.verifyBeforeCommit()).resolves.toBeUndefined();
  });

  it('a different device cannot quietly enable schedules; verify throws NOT_OWNER', async () => {
    const drive = createFakeDrive([
      { file: { id: 'owner-file', name: 'oshilog-owner-v1.json', size: '2', modifiedTime: NOW, appProperties: claimProps() }, content: '{}' },
    ]);
    const otherDevice = createDriveOwnership({
      client: drive,
      secrets: secretStore(),
      now: () => NOW,
      createId: () => 'claim-other',
      deviceId: () => 'device-2',
      deviceLabel: () => 'Tablet',
    });

    await expect(otherDevice.claimOwnership()).rejects.toThrow(DriveClientError);
    try {
      await otherDevice.claimOwnership();
      throw new Error('expected failure');
    } catch (error) {
      expect((error as DriveClientError).code).toBe('NOT_OWNER');
    }
  });

  it('explicit takeover wins and the old device detects the change', async () => {
    const drive = createFakeDrive([
      { file: { id: 'owner-file', name: 'oshilog-owner-v1.json', size: '2', modifiedTime: NOW, appProperties: claimProps() }, content: '{}' },
    ]);
    const newOwner = createDriveOwnership({
      client: drive, secrets: secretStore(),
      now: () => NOW,
      createId: () => 'claim-new',
      deviceId: () => 'device-2',
      deviceLabel: () => 'Tablet',
    });
    await newOwner.takeOver();
    expect(await newOwner.isCurrentlyOwner()).toBe(true);

    const oldOwner = createDriveOwnership({
      client: drive,
      secrets: secretStore({ 'drive-owner-claim': 'claim-1' }),
      now: () => NOW,
      createId: () => 'claim-old',
      deviceId: () => 'device-1',
      deviceLabel: () => 'Pixel',
    });
    try {
      await oldOwner.verifyBeforeRun();
      throw new Error('expected failure');
    } catch (error) {
      expect((error as DriveClientError).code).toBe('NOT_OWNER');
    }
  });

  it('selects the deterministic winner and cleans duplicate owner files', async () => {
    const newer = claimProps({ claimId: 'newer' });
    const older = claimProps({ claimId: 'older' });
    const drive = createFakeDrive([
      { file: { id: 'b', name: 'oshilog-owner-v1.json', size: '2', modifiedTime: '2026-08-17T10:00:00.000Z', appProperties: newer }, content: '{}' },
      { file: { id: 'a', name: 'oshilog-owner-v1.json', size: '2', modifiedTime: '2026-08-17T08:00:00.000Z', appProperties: older }, content: '{}' },
    ]);
    const ownership = createDriveOwnership({
      client: drive, secrets: secretStore(),
      now: () => NOW, createId: () => 'claim-1',
      deviceId: () => 'device-1', deviceLabel: () => 'Pixel',
    });

    const owner = await ownership.readOwner();
    expect(owner?.claimId).toBe('newer');
    expect(drive.deleteFile).toHaveBeenCalledWith('a', undefined);
    expect(drive._files.has('a')).toBe(false);
  });

  it('treats a malformed owner file as absent', async () => {
    const drive = createFakeDrive([
      { file: { id: 'bad', name: 'oshilog-owner-v1.json', size: '2', modifiedTime: NOW, appProperties: { app: 'oshilog', artifactType: 'owner' } as DriveFile['appProperties'] }, content: '{}' },
    ]);
    const ownership = createDriveOwnership({
      client: drive, secrets: secretStore(),
      now: () => NOW, createId: () => 'claim-1',
      deviceId: () => 'device-1', deviceLabel: () => 'Pixel',
    });
    expect(await ownership.readOwner()).toBeNull();
  });

  it('verifyBeforeRun throws NOT_OWNER when no claim is stored locally', async () => {
    const drive = createFakeDrive([
      { file: { id: 'owner-file', name: 'oshilog-owner-v1.json', size: '2', modifiedTime: NOW, appProperties: claimProps() }, content: '{}' },
    ]);
    const ownership = createDriveOwnership({
      client: drive, secrets: secretStore(),
      now: () => NOW, createId: () => 'claim-1',
      deviceId: () => 'device-1', deviceLabel: () => 'Pixel',
    });
    try {
      await ownership.verifyBeforeRun();
      throw new Error('expected failure');
    } catch (error) {
      expect((error as DriveClientError).code).toBe('NOT_OWNER');
    }
  });
});
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { cleanupTombstonedMedia, cropImageUri, deleteStagedFile, importImageFromUri, importVideoFromUri, pickVideoAndImport, stageSourceImage, ensureAppDirs } from '../media';
import { perspectiveWarpUri } from '../perspective';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createEventRepo } from '@/repositories/event';
import { sha256Hex, uuid } from '@/utils/id';

const SANITIZED = { uri: 'file:///cache/sanitized.jpg' };
const mockChain = {
  resize: jest.fn(function () { return this; }),
  rotate: jest.fn(function () { return this; }),
  flip: jest.fn(function () { return this; }),
  crop: jest.fn(function () { return this; }),
  renderAsync: jest.fn(async () => ({
    saveAsync: async () => SANITIZED,
    width: 100,
    height: 200,
  })),
};

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: {
    manipulate: jest.fn(() => mockChain),
  },
}));

jest.mock('../perspective', () => ({
  perspectiveWarpUri: jest.fn(async (uri: string) => `persp:${uri}`),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///picked.jpg' }],
  })),
}));

beforeEach(() => {
  for (const fn of [mockChain.resize, mockChain.rotate, mockChain.flip, mockChain.crop, mockChain.renderAsync]) {
    fn.mockClear();
  }
});

describe('media service', () => {
  it('imports an image into app storage and returns an asset id', async () => {
    const db = createNodeTestDb();
    const result = await importImageFromUri(db, 'file:///picked.jpg', 'cheki');

    expect(result.deduplicated).toBe(false);
    expect(result.width).toBe(100);
    expect(result.height).toBe(200);
    const asset = createEventRepo(db).getMediaAsset(result.assetId);
    expect(asset).not.toBeNull();
    expect(asset?.kind).toBe('cheki');
    expect(asset?.contentHash).toBe('test-hash');
    expect(asset?.width).toBe(100);
    expect(asset?.height).toBe(200);
  });

  it('persists the selected Instax preset for Cheki imports', async () => {
    const db = createNodeTestDb();
    const result = await importImageFromUri(db, 'file:///picked.jpg', 'cheki', { instaxPreset: 'wide' });

    expect(createEventRepo(db).getMediaAsset(result.assetId)?.instaxPreset).toBe('wide');
  });

  it('reports decoded dimensions for deduplicated imports too', async () => {
    const db = createNodeTestDb();
    await importImageFromUri(db, 'file:///picked.jpg', 'photo');
    const duplicate = await importImageFromUri(db, 'file:///picked.jpg', 'photo');

    expect(duplicate.deduplicated).toBe(true);
    expect(duplicate.width).toBe(100);
    expect(duplicate.height).toBe(200);
  });

  it('stages a picked image copy that survives source cleanup', async () => {
    new File('file:///picked.jpg').write('x');
    const staged = await stageSourceImage('file:///picked.jpg');

    expect(staged).toContain('oshilog/staging/form-photo-');
    expect(new File(staged).exists).toBe(true);
  });

  it('deleteStagedFile only removes files inside the staging directory', () => {
    new File('file:///document/oshilog/staging/form-photo-a.jpg').write('x');
    new File('file:///picked.jpg').write('x');

    deleteStagedFile('file:///document/oshilog/staging/form-photo-a.jpg');
    deleteStagedFile('file:///picked.jpg');
    deleteStagedFile(null);

    expect(new File('file:///document/oshilog/staging/form-photo-a.jpg').exists).toBe(false);
    expect(new File('file:///picked.jpg').exists).toBe(true);
  });

  it('deduplicates identical images by content hash', async () => {
    const db = createNodeTestDb();
    const first = await importImageFromUri(db, 'file:///picked.jpg', 'photo');
    const second = await importImageFromUri(db, 'file:///picked.jpg', 'photo');

    expect(second.deduplicated).toBe(true);
    expect(second.assetId).toBe(first.assetId);
  });

  it('runs the attach callback even when an image is deduplicated', async () => {
    const db = createNodeTestDb();
    const attached: string[] = [];
    const first = await importImageFromUri(db, 'file:///picked.jpg', 'photo');

    await importImageFromUri(db, 'file:///picked.jpg', 'photo', {
      onImported: (assetId) => attached.push(assetId),
    });

    expect(attached).toEqual([first.assetId]);
  });

  it('stores the MIME type of the sanitized JPEG instead of the source image', async () => {
    const db = createNodeTestDb();
    const result = await importImageFromUri(db, 'file:///picked.png', 'photo');

    expect(createEventRepo(db).getMediaAsset(result.assetId)?.mimeType).toBe('image/jpeg');
  });

  it('records a custom createdAt when importing an image with a date', async () => {
    const db = createNodeTestDb();
    const result = await importImageFromUri(db, 'file:///picked.jpg', 'photo', { createdAt: '2023-05-04T00:00:00.000Z' });

    expect(createEventRepo(db).getMediaAsset(result.assetId)?.createdAt).toBe('2023-05-04T00:00:00.000Z');
  });

  it('updates the existing asset date when a duplicate is imported with a date', async () => {
    const db = createNodeTestDb();
    const first = await importImageFromUri(db, 'file:///picked.jpg', 'photo');
    const updated = await importImageFromUri(db, 'file:///picked.jpg', 'photo', { createdAt: '2023-05-04T00:00:00.000Z' });

    expect(updated.deduplicated).toBe(true);
    expect(createEventRepo(db).getMediaAsset(first.assetId)?.createdAt).toBe('2023-05-04T00:00:00.000Z');
  });

  it('leaves the duplicate asset date untouched when no date is provided', async () => {
    const db = createNodeTestDb();
    const first = await importImageFromUri(db, 'file:///picked.jpg', 'photo');
    const originalDate = createEventRepo(db).getMediaAsset(first.assetId)?.createdAt;
    const second = await importImageFromUri(db, 'file:///picked.jpg', 'photo');

    expect(second.deduplicated).toBe(true);
    expect(createEventRepo(db).getMediaAsset(first.assetId)?.createdAt).toBe(originalDate);
  });

  it('records a custom createdAt when importing a video with a date', async () => {
    const db = createNodeTestDb();
    const result = await importVideoFromUri(db, 'file:///video.mp4', { createdAt: '2022-01-02T00:00:00.000Z' });

    expect(result.deduplicated).toBe(false);
    expect(createEventRepo(db).getMediaAsset(result.assetId)?.createdAt).toBe('2022-01-02T00:00:00.000Z');
  });

  it('cropImageUri chains flip, rotate and crop before saving', async () => {
    const uri = await cropImageUri('file:///picked.jpg', {
      flipped: true,
      rotateDegrees: 90,
      crop: { originX: 10, originY: 20, width: 30, height: 40 },
    });

    expect(uri).toBe(SANITIZED.uri);
    expect(mockChain.flip).toHaveBeenCalledWith('horizontal');
    expect(mockChain.rotate).toHaveBeenCalledWith(90);
    expect(mockChain.crop).toHaveBeenCalledWith({ originX: 10, originY: 20, width: 30, height: 40 });
    expect(mockChain.renderAsync).toHaveBeenCalledTimes(1);
  });

  it('applies an import transform before saving the persisted image', async () => {
    const db = createNodeTestDb();

    await importImageFromUri(db, 'file:///picked.jpg', 'cheki', {
      transform: { rotateDegrees: 90 },
    });

    expect(mockChain.rotate).toHaveBeenCalledWith(90);
  });

  it('cropImageUri stays identity when no transform is given', async () => {
    await cropImageUri('file:///picked.jpg', {});

    expect(mockChain.flip).not.toHaveBeenCalled();
    expect(mockChain.rotate).not.toHaveBeenCalled();
    expect(mockChain.crop).not.toHaveBeenCalled();
    expect(mockChain.renderAsync).toHaveBeenCalledTimes(1);
  });

  it('cropImageUri warps perspective after flip and rotate, without cropping', async () => {
    (perspectiveWarpUri as jest.Mock).mockClear();
    const corners = {
      tl: { x: 0.05, y: 0 },
      tr: { x: 0.95, y: 0 },
      br: { x: 1, y: 1 },
      bl: { x: 0, y: 1 },
    };
    const uri = await cropImageUri('file:///picked.jpg', {
      flipped: true,
      rotateDegrees: 90,
      perspective: corners,
    });

    expect(uri).toBe('persp:file:///cache/sanitized.jpg');
    expect(mockChain.flip).toHaveBeenCalledWith('horizontal');
    expect(mockChain.rotate).toHaveBeenCalledWith(90);
    expect(mockChain.crop).not.toHaveBeenCalled();
    expect(mockChain.renderAsync).toHaveBeenCalledTimes(1);
    expect(perspectiveWarpUri).toHaveBeenCalledWith(SANITIZED.uri, corners);
  });

  it('cropImageUri prefers perspective over a crop when both are present', async () => {
    (perspectiveWarpUri as jest.Mock).mockClear();
    await cropImageUri('file:///picked.jpg', {
      crop: { originX: 10, originY: 20, width: 30, height: 40 },
      perspective: {
        tl: { x: 0.1, y: 0.1 },
        tr: { x: 0.9, y: 0 },
        br: { x: 0.9, y: 1 },
        bl: { x: 0.2, y: 1 },
      },
    });

    expect(mockChain.crop).not.toHaveBeenCalled();
    expect(perspectiveWarpUri).toHaveBeenCalledTimes(1);
  });

  it('imports videos without manipulation', async () => {
    const db = createNodeTestDb();
    const result = await importVideoFromUri(db, 'file:///video.mp4');
    const asset = createEventRepo(db).getMediaAsset(result.assetId);
    expect(asset?.kind).toBe('video');
    expect(result.deduplicated).toBe(false);
  });

  it('pickVideoAndImport imports a video and returns null on denial', async () => {
    const db = createNodeTestDb();
    const videoId = await pickVideoAndImport(db);
    expect(videoId).not.toBeNull();

    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    expect(await pickVideoAndImport(db)).toBeNull();
  });

  it('ensureAppDirs is safe to call', () => {
    expect(() => ensureAppDirs()).not.toThrow();
  });

  it('purges files for tombstoned media while retaining the sync tombstone', () => {
    const db = createNodeTestDb();
    const path = 'file:///document/oshilog/originals/orphan.jpg';
    new File(path).write('orphan');
    const repo = createEventRepo(db);
    repo.insertMediaAsset({ id: 'orphan', kind: 'photo', contentHash: 'orphan-hash', mimeType: 'image/jpeg', fileSize: 6, width: 1, height: 1, localPath: path });
    repo.detachMedia('orphan');

    expect(cleanupTombstonedMedia(db)).toEqual({ cleaned: 1, failed: 0 });
    expect(new File(path).exists).toBe(false);
    expect(repo.getMediaAsset('orphan')).toMatchObject({ deletedAt: expect.any(String), localPath: null });
  });
});

describe('id utils', () => {
  it('generates unique uuids and sha256 hashes', async () => {
    expect(uuid()).not.toBe(uuid());
    expect(await sha256Hex('abc')).toBe('test-hash');
  });
});

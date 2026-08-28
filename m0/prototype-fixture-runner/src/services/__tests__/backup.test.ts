import { createNodeTestDb } from '@/testing/nodeSqlite';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import { createVenueRepo } from '@/repositories/venue';
import {
  exportDataManifest,
  writeDataBackup,
  readManifest,
  validateManifest,
  buildRestorePreview,
  buildVerifiedRestorePreview,
  applyDataRestore,
  pickWinner,
  createMediaSnapshot,
  applyMediaRestore,
  listSnapshots,
  sealManifest,
  CURRENT_SCHEMA_VERSION,
  deleteSnapshot,
} from '../backup';

describe('pickWinner merge rules', () => {
  const row = (updatedAt: string, deletedAt: string | null = null) => ({ id: 'x', updated_at: updatedAt, deleted_at: deletedAt });

  it('takes the backup when there is no local record', () => {
    expect(pickWinner(null, row('2026-01-02'))).toEqual(row('2026-01-02'));
  });

  it('keeps local when backup is missing', () => {
    expect(pickWinner(row('2026-01-02'), null)).toBeNull();
  });

  it('newer backup wins on equal-alive records', () => {
    expect(pickWinner(row('2026-01-01'), row('2026-01-02'))).toEqual(row('2026-01-02'));
  });

  it('local wins on equal timestamps', () => {
    expect(pickWinner(row('2026-01-02'), row('2026-01-02'))).toBeNull();
  });

  it('applies a newer tombstone', () => {
    expect(pickWinner(row('2026-01-01'), row('2026-01-02', '2026-01-02'))).toEqual(row('2026-01-02', '2026-01-02'));
  });

  it('a local tombstone newer than a backup live row prevents reappearance', () => {
    expect(pickWinner(row('2026-01-02', '2026-01-02'), row('2026-01-01'))).toBeNull();
  });

  it('a backup live row newer than a local tombstone resurrects the record', () => {
    expect(pickWinner(row('2026-01-01', '2026-01-01'), row('2026-01-02'))).toEqual(row('2026-01-02'));
  });
});

describe('data backup & restore', () => {
  it('round-trips Idol and Group social profiles in the current backup schema', async () => {
    const source = createNodeTestDb();
    const repo = createIdolRepo(source);
    const idol = repo.createIdol({
      name: 'Rina', country: 'JP', status: 'active',
      xProfileUrl: 'https://x.com/rina',
      instagramProfileUrl: 'https://www.instagram.com/rina/',
      tiktokProfileUrl: 'https://www.tiktok.com/@rina',
    });
    const group = repo.createGroup({
      name: 'Team X', country: 'JP',
      xProfileUrl: 'https://x.com/teamx',
      instagramProfileUrl: 'https://www.instagram.com/teamx/',
      tiktokProfileUrl: 'https://www.tiktok.com/@teamx',
    });
    const manifest = exportDataManifest(source);

    expect(manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Object.keys(manifest.records).some((table) => table.startsWith('drive_'))).toBe(false);
    expect(manifest.records.idol[0]).toMatchObject({
      x_profile_url: 'https://x.com/rina',
      instagram_profile_url: 'https://www.instagram.com/rina/',
      tiktok_profile_url: 'https://www.tiktok.com/@rina',
    });
    expect(manifest.records.groups[0]).toMatchObject({
      x_profile_url: 'https://x.com/teamx',
      instagram_profile_url: 'https://www.instagram.com/teamx/',
      tiktok_profile_url: 'https://www.tiktok.com/@teamx',
    });

    await sealManifest(manifest);
    const target = createNodeTestDb();
    await applyDataRestore(target, manifest);
    expect(createIdolRepo(target).getIdol(idol.id)).toMatchObject({
      xProfileUrl: 'https://x.com/rina',
      instagramProfileUrl: 'https://www.instagram.com/rina/',
      tiktokProfileUrl: 'https://www.tiktok.com/@rina',
    });
    expect(createIdolRepo(target).getGroup(group.id)).toMatchObject({
      xProfileUrl: 'https://x.com/teamx',
      instagramProfileUrl: 'https://www.instagram.com/teamx/',
      tiktokProfileUrl: 'https://www.tiktok.com/@teamx',
    });
  });

  it('restores a version-9 backup without social columns as null', async () => {
    const source = createNodeTestDb();
    const repo = createIdolRepo(source);
    const idol = repo.createIdol({ name: 'Legacy Idol', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'Legacy Group', country: 'JP' });
    const manifest = exportDataManifest(source);
    manifest.schemaVersion = 9;
    for (const table of ['idol', 'groups']) {
      for (const row of manifest.records[table]) {
        delete row.x_profile_url;
        delete row.instagram_profile_url;
        delete row.tiktok_profile_url;
      }
    }

    expect(validateManifest(manifest)).toEqual({ ok: true });
    await sealManifest(manifest);
    const target = createNodeTestDb();
    await applyDataRestore(target, manifest);
    expect(createIdolRepo(target).getIdol(idol.id)).toMatchObject({
      xProfileUrl: null, instagramProfileUrl: null, tiktokProfileUrl: null,
    });
    expect(createIdolRepo(target).getGroup(group.id)).toMatchObject({
      xProfileUrl: null, instagramProfileUrl: null, tiktokProfileUrl: null,
    });
  });

  it('exports a manifest with all tables and round-trips records', async () => {
    const db = createNodeTestDb();
    const idol = createIdolRepo(db).createIdol({ name: 'Rina', country: 'JP', status: 'active' });
    const manifest = exportDataManifest(db);
    expect(validateManifest(manifest).ok).toBe(true);
    expect(manifest.formatVersion).toBe(2);
    expect(manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(manifest.records.idol).toHaveLength(1);
    expect(manifest.records.idol[0].id).toBe(idol.id);
    expect(manifest.records.app_settings).toHaveLength(1);
    expect(manifest.records.app_settings[0]).toHaveProperty('theme_mode');
    expect(manifest.records).toHaveProperty('region');
    expect(manifest.records).toHaveProperty('member_color');
  });

  it('writes and reads a backup file', async () => {
    const db = createNodeTestDb();
    createIdolRepo(db).createIdol({ name: 'Rina', country: 'JP', status: 'active' });
    const { path, manifest } = await writeDataBackup(db);
    expect(path).toContain('oshilog-data-');

    const fromDisk = readManifest(path);
    expect(fromDisk.records.idol).toHaveLength(1);
    expect(fromDisk.checksums.all).toBe(manifest.checksums.all);
    expect(listSnapshots(db, 'data')).toHaveLength(1);
  });

  it('restore preview counts added records', () => {
    const db = createNodeTestDb();
    createIdolRepo(db).createIdol({ name: 'Local', country: 'JP', status: 'active' });
    const manifest = exportDataManifest(db);

    const fresh = createNodeTestDb();
    const preview = buildRestorePreview(fresh, manifest);
    expect(preview.added).toBeGreaterThan(0);
    expect(preview.skipped).toBeGreaterThanOrEqual(0);
  });

  it('verifies the checksum before exposing a restore preview', async () => {
    const digestStringAsync = Crypto.digestStringAsync as jest.Mock;
    digestStringAsync.mockImplementation(async (_algorithm: string, value: string) => `hash:${value}`);
    const source = createNodeTestDb();
    createIdolRepo(source).createIdol({ name: 'Original', country: 'JP', status: 'active' });
    const manifest = await sealManifest(exportDataManifest(source));
    manifest.records.idol[0].name = 'Tampered';

    await expect(buildVerifiedRestorePreview(createNodeTestDb(), manifest)).rejects.toThrow(/checksum mismatch/i);
    digestStringAsync.mockResolvedValue('test-hash');
  });

  it('applies a restore into an empty database', async () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Rina', country: 'JP', status: 'active' });
    const group = idolRepo.createGroup({ name: 'G', country: 'JP' });
    idolRepo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2021-01-01' });
    const manifest = await sealManifest(exportDataManifest(db));

    const target = createNodeTestDb();
    const result = await applyDataRestore(target, manifest);
    expect(result.added).toBeGreaterThan(0);
    expect(createIdolRepo(target).getIdol(idol.id)?.name).toBe('Rina');
    expect(result.safetySnapshotPath).toContain('oshilog-safety-');
  });

  it('round-trips every membership status period and accepts a pre-v17 backup without the period table', async () => {
    const source = createNodeTestDb();
    const repo = createIdolRepo(source);
    const idol = repo.createIdol({ name: 'Timeline Idol', country: 'JP', status: 'active' });
    const group = repo.createGroup({ name: 'Timeline Group', country: 'JP' });
    const membership = repo.createMembership({ idolId: idol.id, groupId: group.id, startDate: '2026-01-01' });
    repo.replaceMembershipStatusPeriods(membership.id, [
      { status: 'active', startDate: '2026-01-01', endDate: '2026-02-01' },
      { status: 'hiatus', startDate: '2026-02-01', endDate: '2026-03-01' },
      { status: 'active', startDate: '2026-03-01', endDate: null },
    ]);

    const manifest = exportDataManifest(source);
    expect(manifest.records.group_membership_status_period.filter((period) => period.deleted_at === null)).toHaveLength(3);
    expect(manifest.records.group_membership_status_period.some((period) => period.deleted_at !== null)).toBe(true);
    await sealManifest(manifest);

    const target = createNodeTestDb();
    await applyDataRestore(target, manifest);
    expect(createIdolRepo(target).listMembershipStatusPeriods(membership.id).map((period) => period.status)).toEqual([
      'active',
      'hiatus',
      'active',
    ]);

    const legacy = exportDataManifest(source);
    legacy.schemaVersion = 16;
    delete legacy.records.group_membership_status_period;
    delete legacy.recordCounts.group_membership_status_period;
    expect(validateManifest(legacy)).toEqual({ ok: true });
  });

  it('reconciles a backup default with a different local venue default', async () => {
    const source = createNodeTestDb();
    const sourceVenueRepo = createVenueRepo(source);
    const venue = sourceVenueRepo.createVenue({ name: 'Source Hall', country: 'JP', region: 'Tokyo' });
    const sourceDefault = sourceVenueRepo.createDrinkPrice({ venueId: venue.id, label: 'Tea', currency: 'JPY', price: 600, isDefault: true });
    const manifest = await sealManifest(exportDataManifest(source));

    const target = createNodeTestDb();
    const targetVenueRepo = createVenueRepo(target);
    target.runSync(
      `INSERT INTO venue (id, name, country, region, is_favorite, notes, schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      venue.id,
      venue.name,
      venue.country,
      venue.region,
      venue.isFavorite ? 1 : 0,
      venue.notes,
      venue.schemaVersion,
      venue.createdAt,
      venue.updatedAt,
    );
    const localDefault = targetVenueRepo.createDrinkPrice({ venueId: venue.id, label: 'Cola', currency: 'JPY', price: 500, isDefault: true });

    await expect(applyDataRestore(target, manifest)).resolves.toBeDefined();
    expect(targetVenueRepo.getDrinkPrice(sourceDefault.id)?.isDefault).toBe(true);
    expect(targetVenueRepo.getDrinkPrice(localDefault.id)?.isDefault).toBe(false);
  });

  it('reconciles a backup default with a different local cheki type default', async () => {
    const source = createNodeTestDb();
    const sourceIdolRepo = createIdolRepo(source);
    const idol = sourceIdolRepo.createIdol({ name: 'Rina', country: 'JP', status: 'active' });
    const sourceDefault = sourceIdolRepo.createChekiType({ idolId: idol.id, label: 'Normal', currency: 'JPY', unitPrice: 1000, isDefault: true });
    const manifest = await sealManifest(exportDataManifest(source));

    const target = createNodeTestDb();
    target.runSync(
      `INSERT INTO idol (id, name, country, status, is_favorite, schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      idol.id,
      idol.name,
      idol.country,
      idol.status,
      idol.isFavorite ? 1 : 0,
      idol.schemaVersion,
      idol.createdAt,
      idol.updatedAt,
    );
    const targetIdolRepo = createIdolRepo(target);
    const localDefault = targetIdolRepo.createChekiType({ idolId: idol.id, label: 'Special', currency: 'JPY', unitPrice: 2000, isDefault: true });

    await expect(applyDataRestore(target, manifest)).resolves.toBeDefined();
    expect(targetIdolRepo.getChekiType(sourceDefault.id)?.isDefault).toBe(true);
    expect(targetIdolRepo.getChekiType(localDefault.id)?.isDefault).toBe(false);
  });

  it('restore merge resolves conflicts by updatedAt and rolls back on failure', async () => {
    const db = createNodeTestDb();
    const idol = createIdolRepo(db).createIdol({ name: 'V1', country: 'JP', status: 'active' });
    const manifest = await sealManifest(exportDataManifest(db));

    // Target has an older version of the same record.
    const target = createNodeTestDb();
    createIdolRepo(target).createIdol({ name: 'Old', country: 'JP', status: 'inactive' });
    target.runSync(`UPDATE idol SET name = 'Old', updated_at = '2020-01-01' WHERE id = ?`, idol.id);

    await applyDataRestore(target, manifest);
    expect(createIdolRepo(target).getIdol(idol.id)?.name).toBe('V1');

    // Transaction failure inside apply should leave DB untouched.
    const badManifest = exportDataManifest(db);
    badManifest.records.cheki_entry = [{ id: 'broken', event_id: 'missing' }];
    await sealManifest(badManifest);
    // cheki_entry insert will violate FK → transaction rolls back
    await expect(applyDataRestore(target, badManifest)).rejects.toThrow();
    expect(createIdolRepo(target).getIdol(idol.id)?.name).toBe('V1');
  });

  it('restore applies tombstones from the backup', async () => {
    const db = createNodeTestDb();
    const idol = createIdolRepo(db).createIdol({ name: 'Rina', country: 'JP', status: 'active' });
    createIdolRepo(db).deleteIdol(idol.id); // tombstone
    const manifest = await sealManifest(exportDataManifest(db));

    const target = createNodeTestDb();
    await applyDataRestore(target, manifest);
    expect(createIdolRepo(target).getIdol(idol.id)).toBeNull();
  });

  it('restores media before idols that reference profile photos', async () => {
    const source = createNodeTestDb();
    createEventRepo(source).insertMediaAsset({
      id: 'profile-photo',
      kind: 'photo',
      contentHash: 'profile-hash',
      mimeType: 'image/jpeg',
      fileSize: 10,
      width: 10,
      height: 10,
      localPath: 'file:///profile.jpg',
    });
    const idol = createIdolRepo(source).createIdol({
      name: 'Photo Idol',
      country: 'JP',
      status: 'active',
      photoMediaId: 'profile-photo',
    });
    const manifest = await sealManifest(exportDataManifest(source));

    const target = createNodeTestDb();
    await expect(applyDataRestore(target, manifest)).resolves.toBeDefined();
    expect(createIdolRepo(target).getIdol(idol.id)?.photoMediaId).toBe('profile-photo');
  });

  it('rejects unknown tables and columns before constructing SQL', () => {
    const db = createNodeTestDb();
    const unknownTable = exportDataManifest(db) as unknown as Record<string, unknown>;
    (unknownTable.records as Record<string, unknown>).evil_table = [];
    expect(validateManifest(unknownTable)).toMatchObject({ ok: false });

    const unknownColumn = exportDataManifest(db) as unknown as Record<string, unknown>;
    ((unknownColumn.records as Record<string, Record<string, unknown>[]>).idol ??= []).push({
      id: 'malicious',
      name: 'Bad',
      sql_payload: 'DROP TABLE idol',
    });
    expect(validateManifest(unknownColumn)).toMatchObject({ ok: false });

    const unknownSocialColumn = exportDataManifest(db);
    unknownSocialColumn.records.groups.push({
      id: 'bad-social',
      threads_profile_url: 'https://threads.net/bad',
    });
    expect(validateManifest(unknownSocialColumn)).toMatchObject({ ok: false });
  });

  it('rejects unsafe value types, oversized strings, and media path traversal', () => {
    const db = createNodeTestDb();
    const invalidValue = exportDataManifest(db);
    invalidValue.records.region.push({
      id: 'bad-region',
      country: 'JP',
      name: { nested: true },
      schema_version: 1,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      deleted_at: null,
    });
    invalidValue.recordCounts.region = invalidValue.records.region.length;
    expect(validateManifest(invalidValue)).toMatchObject({ ok: false });

    const oversized = exportDataManifest(db);
    oversized.records.region.push({
      id: 'large-region',
      country: 'JP',
      name: 'x'.repeat(100_001),
      schema_version: 1,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      deleted_at: null,
    });
    oversized.recordCounts.region = oversized.records.region.length;
    expect(validateManifest(oversized)).toMatchObject({ ok: false });

    const unsafeMedia = exportDataManifest(db);
    unsafeMedia.category = 'media';
    unsafeMedia.media = [{
      id: '../outside',
      kind: 'photo',
      contentHash: null,
      mimeType: 'image/jpeg',
      size: 1,
      fileName: 'outside.jpg',
    }];
    expect(validateManifest(unsafeMedia)).toMatchObject({ ok: false });
  });

  it('rejects a tampered sealed manifest before touching the database', async () => {
    const digestStringAsync = Crypto.digestStringAsync as jest.Mock;
    digestStringAsync.mockImplementation(async (_algorithm: string, value: string) => `hash:${value}`);
    const source = createNodeTestDb();
    createIdolRepo(source).createIdol({ name: 'Original', country: 'JP', status: 'active' });
    const manifest = await sealManifest(exportDataManifest(source));
    manifest.records.idol[0].name = 'Tampered';

    const target = createNodeTestDb();
    await expect(applyDataRestore(target, manifest)).rejects.toThrow(/checksum/i);
    expect(createIdolRepo(target).listIdols()).toHaveLength(0);
    digestStringAsync.mockResolvedValue('test-hash');
  });

  it('accepts structurally valid legacy schema-v1 manifests', () => {
    const current = exportDataManifest(createNodeTestDb());
    const legacy = {
      ...current,
      formatVersion: 1,
      schemaVersion: 1,
      records: Object.fromEntries(
        Object.entries(current.records).filter(([table]) => table !== 'region' && table !== 'member_color'),
      ),
    };
    expect(validateManifest(legacy)).toEqual({ ok: true });
  });

  it('restores legacy schema-v1 rows while current-only columns use database defaults', async () => {
    const source = createNodeTestDb();
    const idol = createIdolRepo(source).createIdol({ name: 'Legacy Idol', country: 'JP', status: 'active' });
    const legacy = exportDataManifest(source);
    legacy.formatVersion = 1;
    legacy.schemaVersion = 1;
    delete legacy.records.region;
    delete legacy.records.member_color;
    for (const settings of legacy.records.app_settings) delete settings.theme_mode;
    for (const membership of legacy.records.group_membership) {
      for (const column of ['name', 'member_color', 'status', 'hiatus_start_date', 'hiatus_end_date', 'is_main']) {
        delete membership[column];
      }
    }
    await sealManifest(legacy);

    const target = createNodeTestDb();
    await applyDataRestore(target, legacy);
    expect(createIdolRepo(target).getIdol(idol.id)?.name).toBe('Legacy Idol');
    expect(target.getFirstSync<{ theme_mode: string }>(`SELECT theme_mode FROM app_settings WHERE id = 'default'`)?.theme_mode).toBe('light');
  });
});

describe('media backup', () => {
  it('creates a media snapshot manifest and restores files', async () => {
    const db = createNodeTestDb();
    const repo = createEventRepo(db);
    new File('file:///document/oshilog/originals/m1.jpg').write('fake-image');
    repo.insertMediaAsset({ id: 'm1', kind: 'photo', contentHash: 'h1', mimeType: 'image/jpeg', fileSize: 1, width: 1, height: 1, localPath: 'file:///document/oshilog/originals/m1.jpg' });

    const { path, count } = await createMediaSnapshot(db);
    expect(count).toBe(1);
    expect(path).toContain('oshilog-media-');

    // Restore into a fresh database whose original file is missing.
    const target = createNodeTestDb();
    const targetRepo = createEventRepo(target);
    targetRepo.insertMediaAsset({ id: 'm1', kind: 'photo', contentHash: 'h1', mimeType: 'image/jpeg', fileSize: 1, width: 1, height: 1, localPath: 'file:///missing/m1.jpg' });

    const result = await applyMediaRestore(target, path);
    expect(result.restored).toBe(1);
    expect(targetRepo.getMediaAsset('m1')?.localPath).toContain('originals/m1');
  });

  it('marks a snapshot partial and counts only files that were actually copied', async () => {
    const db = createNodeTestDb();
    createEventRepo(db).insertMediaAsset({
      id: 'missing-media',
      kind: 'photo',
      contentHash: 'missing-hash',
      mimeType: 'image/jpeg',
      fileSize: 1,
      width: 1,
      height: 1,
      localPath: 'file:///missing/not-there.jpg',
    });

    const result = await createMediaSnapshot(db);

    expect(result.count).toBe(0);
    expect(result.missing).toBe(1);
    expect(listSnapshots(db, 'media')[0].status).toBe('partial');
  });

  it('deletes the snapshot artifact together with its history row', async () => {
    const db = createNodeTestDb();
    const { path } = await writeDataBackup(db);
    const snapshot = listSnapshots(db, 'data')[0];
    expect(new File(path).exists).toBe(true);

    deleteSnapshot(db, snapshot.id);

    expect(new File(path).exists).toBe(false);
    expect(listSnapshots(db, 'data')).toEqual([]);
  });
});

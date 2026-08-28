import { createNodeSqlite, createNodeTestDb } from '@/testing/nodeSqlite';
import { getCurrentVersion, MIGRATIONS, migrate } from '@/db/schema';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import { createSettingsRepo } from '@/repositories/settings';
import { createTripRepo } from '@/repositories/trip';
import { BACKUP_TABLES } from '@/services/backup';

describe('database migrations', () => {
  it('migrates to the latest version', () => {
    const db = createNodeTestDb();
    expect(getCurrentVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
  });

  it('creates the region master table', () => {
    const db = createNodeTestDb();
    const row = db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'region'`);
    expect(row?.c).toBe(1);
  });

  it('creates Drive-only tables and default disabled schedules without exporting them locally', () => {
    const db = createNodeTestDb();
    const tables = db.getAllSync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'drive_%' ORDER BY name`,
    ).map((row) => row.name);

    expect(tables).toEqual([
      'drive_backup_job',
      'drive_backup_schedule',
      'drive_connection',
      'drive_media_hash_cache',
      'drive_operation_lock',
      'drive_upload_session',
    ]);
    expect(db.getAllSync<{ category: string; frequency: string; network_policy: string }>(
      `SELECT category, frequency, network_policy FROM drive_backup_schedule ORDER BY category`,
    )).toEqual([
      { category: 'data', frequency: 'off', network_policy: 'any' },
      { category: 'media', frequency: 'off', network_policy: 'wifi_only' },
    ]);
    expect(BACKUP_TABLES).not.toContain('drive_connection');
    expect(BACKUP_TABLES).not.toContain('drive_backup_schedule');
    expect(BACKUP_TABLES).not.toContain('drive_backup_job');
    expect(BACKUP_TABLES).not.toContain('drive_upload_session');
    expect(BACKUP_TABLES).not.toContain('drive_media_hash_cache');
  });

  it('migrates a populated v10 database without changing existing rows', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 10) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    db.runSync(
      `INSERT INTO idol (id, name, country, status, schema_version, created_at, updated_at)
       VALUES ('kept', 'Existing Idol', 'JP', 'active', 1, '2026-01-01', '2026-01-01')`,
    );

    migrate(db);

    expect(getCurrentVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(db.getFirstSync<{ name: string }>(`SELECT name FROM idol WHERE id = 'kept'`)?.name).toBe('Existing Idol');
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM drive_operation_lock`)?.c).toBe(0);
  });

  it('adds Instax preset metadata and backfills existing Cheki media to Mini', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 12) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    db.runSync(
      `INSERT INTO media_asset (id, kind, width, height, schema_version, created_at, updated_at)
       VALUES ('old-cheki', 'cheki', 540, 860, 1, '2026-01-01', '2026-01-01')`,
    );
    db.runSync(
      `INSERT INTO media_asset (id, kind, width, height, schema_version, created_at, updated_at)
       VALUES ('direct-photo', 'photo', 400, 400, 1, '2026-01-01', '2026-01-01')`,
    );

    migrate(db);

    expect(db.getAllSync<{ name: string }>('PRAGMA table_info(media_asset)').map((row) => row.name)).toContain('instax_preset');
    expect(db.getFirstSync<{ instax_preset: string }>(`SELECT instax_preset FROM media_asset WHERE id = 'old-cheki'`)?.instax_preset).toBe('mini');
    expect(db.getFirstSync<{ instax_preset: string | null }>(`SELECT instax_preset FROM media_asset WHERE id = 'direct-photo'`)?.instax_preset).toBeNull();
  });

  it('backfills historical idol and group snapshots for legacy direct album media', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 15) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }

    const idolRepo = createIdolRepo(db);
    const eventRepo = createEventRepo(db);
    const idol = idolRepo.createIdol({ name: 'Kohana Mona', country: 'JP', status: 'active' });
    const group = idolRepo.createGroup({ name: 'AQA', country: 'JP' });
    idolRepo.createMembership({
      idolId: idol.id,
      groupId: group.id,
      startDate: '2024-01-01',
      endDate: '2025-12-31',
      name: 'Kohana Mona',
      isMain: true,
    });
    eventRepo.insertMediaAsset({
      id: 'legacy-direct',
      kind: 'photo',
      contentHash: 'legacy-hash',
      mimeType: 'image/jpeg',
      fileSize: 1,
      width: 400,
      height: 600,
      localPath: 'file:///legacy.jpg',
      createdAt: '2024-06-01T00:00:00.000Z',
    });
    db.runSync(
      `INSERT INTO idol_media (media_asset_id, idol_id, sort_order, created_at, updated_at)
       VALUES ('legacy-direct', ?, 0, '2024-06-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z')`,
      idol.id,
    );

    migrate(db);

    expect(db.getAllSync<{ name: string }>('PRAGMA table_info(idol_media)').map((row) => row.name)).toEqual(
      expect.arrayContaining(['idol_name_snapshot', 'group_name_snapshot']),
    );
    expect(db.getFirstSync<{ idol_name_snapshot: string; group_name_snapshot: string }>(
      `SELECT idol_name_snapshot, group_name_snapshot FROM idol_media WHERE media_asset_id = 'legacy-direct'`,
    )).toEqual({ idol_name_snapshot: 'Kohana Mona', group_name_snapshot: 'AQA' });
  });

  it('adds explicit drink default state without inferring it from a legacy label', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 13) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    const now = '2026-01-01T00:00:00.000Z';
    db.runSync(
      `INSERT INTO venue (id, name, country, region, is_favorite, notes, schema_version, created_at, updated_at, deleted_at)
       VALUES ('v1', 'Legacy Hall', 'JP', 'Tokyo', 0, NULL, 1, ?, ?, NULL)`,
      now,
      now,
    );
    db.runSync(
      `INSERT INTO venue_drink_price (id, venue_id, label, currency, price, is_archived, schema_version, created_at, updated_at, deleted_at)
       VALUES ('d1', 'v1', 'Drink', 'JPY', 600, 0, 1, ?, ?, NULL)`,
      now,
      now,
    );
    db.runSync('ALTER TABLE venue_drink_price DROP COLUMN is_default');

    migrate(db);

    expect(db.getAllSync<{ name: string }>('PRAGMA table_info(venue_drink_price)').map((row) => row.name)).toContain('is_default');
    expect(db.getFirstSync<{ is_default: number }>(`SELECT is_default FROM venue_drink_price WHERE id = 'd1'`)?.is_default).toBe(0);
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = 'idx_drink_price_default_per_venue'`)?.c).toBe(1);
  });

  it('adds explicit cheki default state without inferring it from a legacy label', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 14) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    const now = '2026-01-01T00:00:00.000Z';
    db.runSync(
      `INSERT INTO idol (id, name, country, status, schema_version, created_at, updated_at, deleted_at)
       VALUES ('i1', 'Legacy Idol', 'JP', 'active', 1, ?, ?, NULL)`,
      now,
      now,
    );
    db.runSync(
      `INSERT INTO cheki_type (id, idol_id, label, currency, unit_price, is_archived, schema_version, created_at, updated_at, deleted_at)
       VALUES ('c1', 'i1', 'Normal', 'JPY', 600, 0, 1, ?, ?, NULL)`,
      now,
      now,
    );
    const chekiColumns = db.getAllSync<{ name: string }>('PRAGMA table_info(cheki_type)').map((row) => row.name);
    if (chekiColumns.includes('is_default')) db.runSync('ALTER TABLE cheki_type DROP COLUMN is_default');

    migrate(db);

    expect(db.getAllSync<{ name: string }>('PRAGMA table_info(cheki_type)').map((row) => row.name)).toContain('is_default');
    expect(db.getFirstSync<{ is_default: number }>(`SELECT is_default FROM cheki_type WHERE id = 'c1'`)?.is_default).toBe(0);
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = 'idx_cheki_type_default_per_idol'`)?.c).toBe(1);
  });

  it('is idempotent when run again', () => {
    const db = createNodeTestDb();
    const before = getCurrentVersion(db);
    migrate(db);
    expect(getCurrentVersion(db)).toBe(before);
    const count = db.getAllSync<{ c: number }>('SELECT COUNT(*) AS c FROM idol');
    expect(count[0].c).toBe(0);
  });

  it('repairs a missing media table before continuing a legacy upgrade', () => {
    const db = createNodeSqlite();
    MIGRATIONS[0].up(db);
    db.runSync(
      `INSERT INTO idol (id, name, country, status, schema_version, created_at, updated_at)
       VALUES ('legacy-idol', 'Legacy Idol', 'JP', 'active', 1, '2026-01-01', '2026-01-01')`,
    );
    db.execSync('PRAGMA foreign_keys = OFF; DROP TABLE media_asset; PRAGMA foreign_keys = ON; PRAGMA user_version = 1;');

    expect(() => migrate(db)).not.toThrow();
    expect(getCurrentVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'media_asset'`)?.c).toBe(1);
    expect(db.getFirstSync<{ name: string }>(`SELECT name FROM idol WHERE id = 'legacy-idol'`)?.name).toBe('Legacy Idol');
  });

  it('repairs legacy tables that lack baseline country columns', () => {
    const db = createNodeSqlite();
    db.execSync(`
      CREATE TABLE idol (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
        member_color TEXT, is_favorite INTEGER NOT NULL DEFAULT 0, notes TEXT, schema_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE groups (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, is_favorite INTEGER NOT NULL DEFAULT 0,
        notes TEXT, schema_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE venue (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, is_favorite INTEGER NOT NULL DEFAULT 0,
        notes TEXT, schema_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
    `);
    const now = '2026-01-01T00:00:00.000Z';
    db.runSync(`INSERT INTO idol (id, name, status, schema_version, created_at, updated_at, deleted_at) VALUES ('i1', 'Kohana Mona', 'active', 1, ?, ?, NULL)`, now, now);
    db.runSync(`INSERT INTO groups (id, name, schema_version, created_at, updated_at, deleted_at) VALUES ('g1', 'AQA', 1, ?, ?, NULL)`, now, now);
    db.runSync(`INSERT INTO venue (id, name, schema_version, created_at, updated_at, deleted_at) VALUES ('v1', 'Zepp Yokohama', 1, ?, ?, NULL)`, now, now);
    db.execSync('PRAGMA user_version = 1;');

    expect(() => migrate(db)).not.toThrow();
    expect(getCurrentVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(db.getFirstSync<{ country: string }>(`SELECT country FROM idol WHERE id = 'i1'`)?.country).toBe('JP');
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM idol`)?.c).toBe(1);
    const idolCols = db.getAllSync<{ name: string }>('PRAGMA table_info(idol)').map((row) => row.name);
    expect(idolCols).toContain('country');
    expect(idolCols).toContain('region');
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name = 'idx_idol_country'`)?.c).toBe(1);
  });

  it('adds the venue address column without touching existing data', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 8) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    const now = '2026-01-01T00:00:00.000Z';
    db.runSync(
      `INSERT INTO venue (id, name, country, region, is_favorite, notes, schema_version, created_at, updated_at, deleted_at)
       VALUES ('v1', 'Zepp', 'JP', 'Tokyo', 0, NULL, 1, ?, ?, NULL)`,
      now,
      now,
    );

    migrate(db);

    expect(getCurrentVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    const cols = db.getAllSync<{ name: string }>('PRAGMA table_info(venue)').map((row) => row.name);
    expect(cols).toContain('address');
    expect(db.getFirstSync<{ name: string; address: string | null }>(`SELECT name, address FROM venue WHERE id = 'v1'`))
      .toMatchObject({ name: 'Zepp', address: null });
    db.runSync(`UPDATE venue SET address = '1-2-3 Chome, Shibuya' WHERE id = 'v1'`);
    expect(db.getFirstSync<{ address: string | null }>(`SELECT address FROM venue WHERE id = 'v1'`)?.address).toBe('1-2-3 Chome, Shibuya');
  });

  it('adds social profile columns to idols and groups without touching existing data', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 9) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    const now = '2026-01-01T00:00:00.000Z';
    db.runSync(
      `INSERT INTO idol (id, name, country, status, schema_version, created_at, updated_at)
       VALUES ('i1', 'Existing Idol', 'JP', 'active', 1, ?, ?)`,
      now,
      now,
    );
    db.runSync(
      `INSERT INTO groups (id, name, country, schema_version, created_at, updated_at)
       VALUES ('g1', 'Existing Group', 'JP', 1, ?, ?)`,
      now,
      now,
    );

    migrate(db);

    const expectedColumns = ['x_profile_url', 'instagram_profile_url', 'tiktok_profile_url'];
    const idolColumns = db.getAllSync<{ name: string }>('PRAGMA table_info(idol)').map((row) => row.name);
    const groupColumns = db.getAllSync<{ name: string }>('PRAGMA table_info(groups)').map((row) => row.name);
    expect(idolColumns).toEqual(expect.arrayContaining(expectedColumns));
    expect(groupColumns).toEqual(expect.arrayContaining(expectedColumns));
    expect(db.getFirstSync(`SELECT name, x_profile_url, instagram_profile_url, tiktok_profile_url FROM idol WHERE id = 'i1'`))
      .toEqual({ name: 'Existing Idol', x_profile_url: null, instagram_profile_url: null, tiktok_profile_url: null });
    expect(db.getFirstSync(`SELECT name, x_profile_url, instagram_profile_url, tiktok_profile_url FROM groups WHERE id = 'g1'`))
      .toEqual({ name: 'Existing Group', x_profile_url: null, instagram_profile_url: null, tiktok_profile_url: null });
  });

  it('enforces foreign keys', () => {
    const db = createNodeTestDb();
    expect(() => db.runSync('INSERT INTO cheki_type (id, idol_id, label, currency, unit_price, is_archived, schema_version, created_at, updated_at) VALUES (\'x\', \'missing-idol\', \'t\', \'JPY\', 100, 0, 1, \'2026-01-01\', \'2026-01-01\')')).toThrow(/FOREIGN KEY/i);
  });

  it('enforces money pairing and non-negative financial values', () => {
    const db = createNodeTestDb();
    const now = '2026-01-01T00:00:00.000Z';
    expect(() => db.runSync(
      `INSERT INTO event (id, title, event_date, country, ticket_amount, schema_version, created_at, updated_at)
       VALUES ('bad-event', 'Bad', '2026-01-01', 'JP', 100, 1, ?, ?)`,
      now,
      now,
    )).toThrow(/event money/i);

    const idol = createIdolRepo(db).createIdol({ name: 'A', country: 'JP', status: 'active' });
    expect(() => createIdolRepo(db).createChekiType({ idolId: idol.id, label: 'Bad', currency: 'JPY', unitPrice: -1 }))
      .toThrow(/cheki type price/i);
  });

  it('enforces cheki snapshot arithmetic and ownership relations', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const eventRepo = createEventRepo(db);
    const owner = idolRepo.createIdol({ name: 'Owner', country: 'JP', status: 'active' });
    const other = idolRepo.createIdol({ name: 'Other', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: owner.id, label: 'A', currency: 'JPY', unitPrice: 500 });
    const event = eventRepo.createEvent({ title: 'Live', eventDate: '2026-01-01', country: 'JP' });
    const now = '2026-01-01T00:00:00.000Z';
    const insert = (id: string, idolId: string, quantity: number, subtotal: number) => db.runSync(
      `INSERT INTO cheki_entry (id, event_id, idol_id, cheki_type_id, quantity, currency, unit_price, subtotal,
        schema_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'JPY', 500, ?, 1, ?, ?)`,
      id,
      event.id,
      idolId,
      type.id,
      quantity,
      subtotal,
      now,
      now,
    );

    expect(() => insert('wrong-owner', other.id, 1, 500)).toThrow(/cheki relation/i);
    expect(() => insert('zero-quantity', owner.id, 0, 0)).toThrow(/cheki amount/i);
    expect(() => insert('wrong-subtotal', owner.id, 2, 500)).toThrow(/cheki amount/i);
  });

  it('rejects overlapping Main memberships and duplicate active trip countries', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'A', country: 'JP', status: 'active' });
    const a = idolRepo.createGroup({ name: 'A', country: 'JP' });
    const b = idolRepo.createGroup({ name: 'B', country: 'JP' });
    idolRepo.createMembership({ idolId: idol.id, groupId: a.id, startDate: '2020-01-01', endDate: null, isMain: true });
    const now = '2026-01-01T00:00:00.000Z';
    expect(() => db.runSync(
      `INSERT INTO group_membership (id, idol_id, group_id, start_date, is_main, schema_version, created_at, updated_at)
       VALUES ('overlap', ?, ?, '2025-01-01', 1, 1, ?, ?)`,
      idol.id,
      b.id,
      now,
      now,
    )).toThrow(/Main membership/i);

    const trip = createTripRepo(db).createTrip({
      title: 'Japan',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      countries: ['JP', 'JP'],
    });
    expect(createTripRepo(db).listTripCountries(trip.id)).toEqual(['JP']);
  });

  it('rolls back transactions on failure', () => {
    const db = createNodeTestDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Rina', country: 'JP', status: 'active' });

    expect(() =>
      db.withTransactionSync(() => {
        repo.createIdol({ name: 'This will roll back', country: 'JP', status: 'active' });
        throw new Error('boom');
      }),
    ).toThrow('boom');

    const idols = repo.listIdols();
    expect(idols).toHaveLength(1);
    expect(idols[0].id).toBe(idol.id);
  });

  it('creates membership status periods and backfills valid v16 timelines deterministically', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 16) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Timeline Idol', country: 'JP', status: 'hiatus' });
    const groups = ['Active', 'Hiatus', 'Grad', 'Grad Hiatus'].map((name) => repo.createGroup({ name, country: 'JP' }));
    const active = repo.createMembership({
      idolId: idol.id,
      groupId: groups[0].id,
      startDate: '2026-01-01',
      status: 'active',
    });
    const hiatus = repo.createMembership({
      idolId: idol.id,
      groupId: groups[1].id,
      startDate: '2026-02-01',
      status: 'hiatus',
      hiatusStartDate: '2026-02-10',
      hiatusEndDate: '2026-02-20',
    });
    const grad = repo.createMembership({
      idolId: idol.id,
      groupId: groups[2].id,
      startDate: '2026-03-01',
      endDate: '2026-03-25',
      status: 'grad',
    });
    const gradHiatus = repo.createMembership({
      idolId: idol.id,
      groupId: groups[3].id,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      status: 'grad',
      hiatusStartDate: '2026-04-10',
      hiatusEndDate: '2026-04-20',
    });

    migrate(db);

    const rows = db.getAllSync<{
      groupMembershipId: string;
      status: string;
      startDate: string;
      endDate: string | null;
    }>(
      `SELECT group_membership_id AS groupMembershipId, status, start_date AS startDate, end_date AS endDate
       FROM group_membership_status_period
       WHERE deleted_at IS NULL
       ORDER BY group_membership_id, start_date`,
    );
    expect(rows.filter((row) => row.groupMembershipId === active.id)).toEqual([
      { groupMembershipId: active.id, status: 'active', startDate: '2026-01-01', endDate: null },
    ]);
    expect(rows.filter((row) => row.groupMembershipId === hiatus.id)).toEqual([
      { groupMembershipId: hiatus.id, status: 'active', startDate: '2026-02-01', endDate: '2026-02-10' },
      { groupMembershipId: hiatus.id, status: 'hiatus', startDate: '2026-02-10', endDate: '2026-02-20' },
      { groupMembershipId: hiatus.id, status: 'active', startDate: '2026-02-20', endDate: null },
    ]);
    expect(repo.getMembership(hiatus.id)?.status).toBe('active');
    expect(rows.filter((row) => row.groupMembershipId === grad.id)).toEqual([
      { groupMembershipId: grad.id, status: 'active', startDate: '2026-03-01', endDate: '2026-03-25' },
    ]);
    expect(rows.filter((row) => row.groupMembershipId === gradHiatus.id)).toEqual([
      { groupMembershipId: gradHiatus.id, status: 'active', startDate: '2026-04-01', endDate: '2026-04-10' },
      { groupMembershipId: gradHiatus.id, status: 'hiatus', startDate: '2026-04-10', endDate: '2026-04-20' },
      { groupMembershipId: gradHiatus.id, status: 'active', startDate: '2026-04-20', endDate: '2026-04-30' },
    ]);

    MIGRATIONS.find((migration) => migration.version === 17)?.up(db);
    expect(db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM group_membership_status_period WHERE deleted_at IS NULL`,
    )?.count).toBe(rows.length);
  });

  it('preserves malformed legacy episodes without inventing status-period dates', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 16) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Repair Me', country: 'JP', status: 'inactive' });
    const group = repo.createGroup({ name: 'Legacy', country: 'JP' });
    const now = '2026-08-24T00:00:00.000Z';
    db.execSync('DROP TRIGGER IF EXISTS validate_membership_insert');
    db.runSync(
      `INSERT INTO group_membership (
        id, idol_id, group_id, start_date, end_date, status, hiatus_start_date, hiatus_end_date,
        is_main, schema_version, created_at, updated_at, deleted_at
      ) VALUES ('malformed-grad', ?, ?, '2026-01-01', NULL, 'grad', NULL, NULL, 0, 1, ?, ?, NULL)`,
      idol.id,
      group.id,
      now,
      now,
    );
    db.runSync(
      `INSERT INTO group_membership (
        id, idol_id, group_id, start_date, end_date, status, hiatus_start_date, hiatus_end_date,
        is_main, schema_version, created_at, updated_at, deleted_at
      ) VALUES ('malformed-hiatus', ?, ?, '2026-02-01', NULL, 'hiatus', '2026-02-10', NULL, 0, 1, ?, ?, NULL)`,
      idol.id,
      group.id,
      now,
      now,
    );

    migrate(db);

    expect(db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM group_membership_status_period
       WHERE group_membership_id IN ('malformed-grad', 'malformed-hiatus')`,
    )?.count).toBe(0);
    expect(db.getFirstSync<{ status: string; endDate: string | null }>(
      `SELECT status, end_date AS endDate FROM group_membership WHERE id = 'malformed-grad'`,
    )).toEqual({ status: 'grad', endDate: null });
    expect(db.getFirstSync<{ hiatusStartDate: string | null; hiatusEndDate: string | null }>(
      `SELECT hiatus_start_date AS hiatusStartDate, hiatus_end_date AS hiatusEndDate
       FROM group_membership WHERE id = 'malformed-hiatus'`,
    )).toEqual({ hiatusStartDate: '2026-02-10', hiatusEndDate: null });
  });
});

describe('integrity repair migration', () => {
  it('repairs legacy invalid amounts and duplicate groupings before enabling guards', () => {
    const db = createNodeSqlite();
    for (const migration of MIGRATIONS) {
      if (migration.version > 5) break;
      db.withTransactionSync(() => {
        migration.up(db);
        db.execSync(`PRAGMA user_version = ${migration.version}`);
      });
    }
    const now = '2026-01-01T00:00:00.000Z';
    db.runSync(`INSERT INTO idol (id, name, country, status, schema_version, created_at, updated_at) VALUES ('i1', 'A', 'JP', 'active', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO groups (id, name, country, schema_version, created_at, updated_at) VALUES ('g1', 'G1', 'JP', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO groups (id, name, country, schema_version, created_at, updated_at) VALUES ('g2', 'G2', 'JP', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO group_membership (id, idol_id, group_id, start_date, is_main, schema_version, created_at, updated_at) VALUES ('m1', 'i1', 'g1', '2020-01-01', 1, 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO group_membership (id, idol_id, group_id, start_date, is_main, schema_version, created_at, updated_at) VALUES ('m2', 'i1', 'g2', '2021-01-01', 1, 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO cheki_type (id, idol_id, label, currency, unit_price, is_archived, schema_version, created_at, updated_at) VALUES ('ct', 'i1', 'Bad', 'JPY', -10, 0, 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO trip (id, title, start_date, end_date, schema_version, created_at, updated_at) VALUES ('t', 'T', '2026-01-01', '2026-01-02', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO trip_country (id, trip_id, country, schema_version, created_at, updated_at) VALUES ('tc1', 't', 'JP', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO trip_country (id, trip_id, country, schema_version, created_at, updated_at) VALUES ('tc2', 't', 'JP', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO trip_expense (id, trip_id, title, category, currency, amount, expense_date, schema_version, created_at, updated_at) VALUES ('x', 't', 'X', 'other', 'JPY', -5, '2026-01-01', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO event (id, title, event_date, country, ticket_currency, ticket_amount, schema_version, created_at, updated_at) VALUES ('e', 'E', '2026-01-01', 'JP', NULL, -100, 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO cheki_entry (id, event_id, idol_id, cheki_type_id, quantity, currency, unit_price, subtotal, schema_version, created_at, updated_at) VALUES ('ce', 'e', 'i1', 'ct', 0, 'JPY', -10, 999, 1, ?, ?)`, now, now);

    migrate(db);

    expect(db.getFirstSync<{ amount: number }>(`SELECT amount FROM trip_expense WHERE id = 'x'`)?.amount).toBe(0);
    expect(db.getFirstSync<{ unit_price: number }>(`SELECT unit_price FROM cheki_type WHERE id = 'ct'`)?.unit_price).toBe(0);
    expect(db.getFirstSync<{ quantity: number; unit_price: number; subtotal: number }>(`SELECT quantity, unit_price, subtotal FROM cheki_entry WHERE id = 'ce'`))
      .toMatchObject({ quantity: 1, unit_price: 0, subtotal: 0 });
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM group_membership WHERE idol_id = 'i1' AND is_main = 1`)?.c).toBe(1);
    expect(db.getFirstSync<{ c: number }>(`SELECT COUNT(*) AS c FROM trip_country WHERE trip_id = 't' AND deleted_at IS NULL`)?.c).toBe(1);
  });
});

describe('membership per-group migration (v5)', () => {
  /** Builds a v4-era database: migrations 1-4 only, then raw legacy rows. */
  function createV4Db() {
    const db = createNodeSqlite();
    for (const m of MIGRATIONS) {
      if (m.version > 4) break;
      db.withTransactionSync(() => {
        m.up(db);
        db.execSync(`PRAGMA user_version = ${m.version}`);
      });
    }
    expect(getCurrentVersion(db)).toBe(4);
    const now = '2026-01-01T00:00:00.000Z';
    db.runSync(
      `INSERT INTO idol (id, name, country, status, member_color, is_favorite, notes, schema_version, created_at, updated_at, deleted_at)
       VALUES ('i1', 'Kohana Mona', 'JP', 'inactive', 'Pink', 0, NULL, 1, ?, ?, NULL)`,
      now,
      now,
    );
    db.runSync(
      `INSERT INTO groups (id, name, country, is_favorite, notes, schema_version, created_at, updated_at, deleted_at)
       VALUES ('g1', 'AQA', 'JP', 0, NULL, 1, ?, ?, NULL)`,
      now,
      now,
    );
    db.runSync(
      `INSERT INTO group_membership (id, idol_id, group_id, start_date, end_date, schema_version, created_at, updated_at, deleted_at)
       VALUES ('m1', 'i1', 'g1', '2020-01-01', NULL, 1, ?, ?, NULL)`,
      now,
      now,
    );
    return db;
  }

  it('backfills membership details from idol fields', () => {
    const db = createV4Db();
    migrate(db);

    const repo = createIdolRepo(db);
    const membership = repo.getMembership('m1');
    expect(membership?.name).toBe('Kohana Mona');
    expect(membership?.status).toBe('grad');
    expect(membership?.hiatusStartDate).toBeNull();

    const pink = repo.findMemberColor('Pink');
    expect(pink).not.toBeNull();
    expect(membership?.memberColor).toBe(pink!.id);

    // The only membership covering today (2026) becomes Main.
    expect(membership?.isMain).toBe(true);

    const colors = repo.listMemberColors();
    expect(colors.length).toBeGreaterThanOrEqual(12);
  });

  it('leaves memberships created after migration at their defaults', () => {
    const db = createV4Db();
    migrate(db);
    const repo = createIdolRepo(db);
    const otherGroup = repo.createGroup({ name: 'Other Group', country: 'JP' });
    const m = repo.createMembership({ idolId: 'i1', groupId: otherGroup.id, startDate: '2026-06-01' });
    const fetched = repo.getMembership(m.id);
    expect(fetched?.status).toBe('active');
    expect(fetched?.name).toBeNull();
    expect(fetched?.isMain).toBe(false);
  });
});

describe('event repository transactional writes', () => {
  it('creates event, entries, and photo positions atomically', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const eventRepo = createEventRepo(db);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 500 });
    const p1 = eventRepo.insertMediaAsset({ id: 'p1', kind: 'cheki', contentHash: 'h1', mimeType: 'image/jpeg', fileSize: 1, width: 10, height: 10, localPath: 'file:///p1.jpg' });
    const p2 = eventRepo.insertMediaAsset({ id: 'p2', kind: 'cheki', contentHash: 'h2', mimeType: 'image/jpeg', fileSize: 1, width: 10, height: 10, localPath: 'file:///p2.jpg' });

    const repo = createEventRepo(db);
    const event = repo.createEvent({
      title: 'Live',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        {
          idolId: idol.id,
          groupMembershipId: null,
          chekiTypeId: type.id,
          quantity: 2,
          currency: 'JPY',
          unitPrice: 500,
          photos: [{ mediaAssetId: p1.id }, { mediaAssetId: p2.id }],
        },
      ],
    });

    const entries = repo.listEntries(event.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].subtotal).toBe(1000);
    const photos = repo.listEntryPhotos(entries[0].id);
    expect(photos.map((p) => p.position).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('reindexes photo positions after deletion', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const eventRepo = createEventRepo(db);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 500 });
    const p1 = eventRepo.insertMediaAsset({ id: 'p1', kind: 'cheki', contentHash: 'h1', mimeType: 'image/jpeg', fileSize: 1, width: 10, height: 10, localPath: 'file:///p1.jpg' });
    const p2 = eventRepo.insertMediaAsset({ id: 'p2', kind: 'cheki', contentHash: 'h2', mimeType: 'image/jpeg', fileSize: 1, width: 10, height: 10, localPath: 'file:///p2.jpg' });
    const p3 = eventRepo.insertMediaAsset({ id: 'p3', kind: 'cheki', contentHash: 'h3', mimeType: 'image/jpeg', fileSize: 1, width: 10, height: 10, localPath: 'file:///p3.jpg' });

    const repo = createEventRepo(db);
    const event = repo.createEvent({
      title: 'Live',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        {
          idolId: idol.id,
          groupMembershipId: null,
          chekiTypeId: type.id,
          quantity: 3,
          currency: 'JPY',
          unitPrice: 500,
          photos: [{ mediaAssetId: p1.id }, { mediaAssetId: p2.id }, { mediaAssetId: p3.id }],
        },
      ],
    });

    const entry = repo.listEntries(event.id)[0];
    repo.deleteEntryPhoto(entry.id, 'p1');
    const photos = repo.listEntryPhotos(entry.id);
    expect(photos.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(photos.map((p) => p.position)).toEqual([1, 2]);
  });

  it('soft-deletes event together with its entries', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Yui', country: 'JP', status: 'active' });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'A', currency: 'JPY', unitPrice: 500 });

    const repo = createEventRepo(db);
    const event = repo.createEvent({
      title: 'Live',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [{ idolId: idol.id, groupMembershipId: null, chekiTypeId: type.id, quantity: 1, currency: 'JPY', unitPrice: 500 }],
    });

    repo.deleteEvent(event.id);
    expect(repo.getEvent(event.id)).toBeNull();
    expect(repo.listEntries(event.id)).toHaveLength(0);
  });
});

describe('settings repository', () => {
  it('creates default settings and patches them', () => {
    const db = createNodeTestDb();
    const repo = createSettingsRepo(db);
    const settings = repo.getSettings();
    expect(settings.surfaceStyle).toBe('outline');
    expect(settings.themeMode).toBe('light');
    expect(settings.onboardingCompleted).toBe(false);

    repo.patchSettings({ surfaceStyle: 'soft-shadow', themeMode: 'dark', accentColor: '#123456', homeHeaderLabel: 'My Journal', onboardingCompleted: true });
    const updated = repo.getSettings();
    expect(updated.surfaceStyle).toBe('soft-shadow');
    expect(updated.themeMode).toBe('dark');
    expect(updated.accentColor).toBe('#123456');
    expect(updated.homeHeaderLabel).toBe('My Journal');
    expect(updated.onboardingCompleted).toBe(true);
  });

  it('upserts country preferences', () => {
    const db = createNodeTestDb();
    const repo = createSettingsRepo(db);
    repo.upsertCountry('JP', true);
    repo.upsertCountry('ID', true);
    repo.upsertCountry('JP', false);
    const countries = repo.getCountries();
    expect(countries).toHaveLength(2);
    expect(countries.find((c) => c.country === 'JP')?.isActive).toBe(false);
    expect(repo.getActiveCountries()).toEqual(['ID']);
  });
});

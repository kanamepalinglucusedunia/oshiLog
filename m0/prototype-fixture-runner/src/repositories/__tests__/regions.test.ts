import { createNodeSqlite, createNodeTestDb } from '@/testing/nodeSqlite';
import { createRegionRepo } from '@/repositories/region';
import { createSettingsRepo } from '@/repositories/settings';
import { MIGRATIONS, migrate } from '@/db/schema';

describe('region repository', () => {
  it('creates regions bound to a country and deduplicates case-insensitively', () => {
    const db = createNodeTestDb();
    const repo = createRegionRepo(db);

    const tokyo = repo.createRegion({ country: 'JP', name: 'Tokyo' });
    expect(tokyo.country).toBe('JP');
    expect(tokyo.name).toBe('Tokyo');

    const duplicate = repo.createRegion({ country: 'JP', name: 'tokyo' });
    expect(duplicate.id).toBe(tokyo.id);

    const jakarta = repo.createRegion({ country: 'ID', name: 'Jakarta' });
    expect(jakarta.id).not.toBe(tokyo.id);

    const all = repo.listRegions();
    expect(all).toHaveLength(2);
  });

  it('lists regions filtered by country', () => {
    const db = createNodeTestDb();
    const repo = createRegionRepo(db);
    repo.createRegion({ country: 'JP', name: 'Osaka' });
    repo.createRegion({ country: 'JP', name: 'Tokyo' });
    repo.createRegion({ country: 'ID', name: 'Bandung' });

    expect(repo.listRegions('JP').map((r) => r.name).sort()).toEqual(['Osaka', 'Tokyo']);
    expect(repo.listRegions('ID').map((r) => r.name)).toEqual(['Bandung']);
    expect(repo.listRegions('MY')).toHaveLength(0);
  });

  it('deletes regions so they can be re-added', () => {
    const db = createNodeTestDb();
    const repo = createRegionRepo(db);
    const region = repo.createRegion({ country: 'JP', name: 'Nagoya' });

    repo.deleteRegion(region.id);
    expect(repo.listRegions()).toHaveLength(0);

    const reAdded = repo.createRegion({ country: 'JP', name: 'Nagoya' });
    expect(reAdded.id).not.toBe(region.id);
    expect(repo.listRegions()).toHaveLength(1);
  });

  it('ensureRegion is idempotent', () => {
    const db = createNodeTestDb();
    const repo = createRegionRepo(db);
    const a = repo.ensureRegion({ country: 'JP', name: 'Fukuoka' });
    const b = repo.ensureRegion({ country: 'JP', name: 'Fukuoka' });
    expect(a.id).toBe(b.id);
    expect(repo.listRegions()).toHaveLength(1);
  });

  it('backfills existing entity regions into the master list on migration', () => {
    const db = createNodeSqlite();
    for (const m of MIGRATIONS) {
      if (m.version > 2) break;
      db.withTransactionSync(() => {
        m.up(db);
        db.execSync(`PRAGMA user_version = ${m.version}`);
      });
    }

    const settings = createSettingsRepo(db);
    settings.upsertCountry('JP', true);
    const now = '2026-01-01T00:00:00.000Z';
    db.runSync(`INSERT INTO idol (id, name, country, region, status, schema_version, created_at, updated_at) VALUES ('i1', 'A', 'JP', 'Tokyo', 'active', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO idol (id, name, country, region, status, schema_version, created_at, updated_at) VALUES ('i2', 'B', 'JP', 'Tokyo', 'active', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO groups (id, name, country, region, schema_version, created_at, updated_at) VALUES ('g1', 'G', 'JP', 'Osaka', 1, ?, ?)`, now, now);
    db.runSync(`INSERT INTO venue (id, name, country, region, schema_version, created_at, updated_at) VALUES ('v1', 'V', 'JP', 'Osaka', 1, ?, ?)`, now, now);

    migrate(db);

    const regions = createRegionRepo(db).listRegions('JP').map((r) => r.name).sort();
    expect(regions).toEqual(['Osaka', 'Tokyo']);
  });
});

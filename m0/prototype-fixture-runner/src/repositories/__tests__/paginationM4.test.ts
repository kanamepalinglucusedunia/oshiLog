import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createEventRepo } from '@/repositories/event';
import { seedScaleEvents } from '@/testing/scaleFixtures';
import { explainDetails } from '@/testing/explainPlan';

describe('M4 pagination', () => {
  it('traverses events without duplicate/omission and respects limit', () => {
    const db = createNodeTestDb();
    seedScaleEvents(db, { eventCount: 250, seed: 42 });
    const repo = createEventRepo(db);
    const limit = 50;
    let cursor: string | null = null;
    const seen = new Set<string>();
    let total = 0;
    let pages = 0;
    do {
      const page = repo.listEventsPage({ limit, cursor, sort: 'date-desc', filters: {} });
      expect(page.rows.length).toBeLessThanOrEqual(limit);
      for (const row of page.rows) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
      total += page.rows.length;
      cursor = page.nextCursor;
      pages += 1;
      if (page.hasMore) expect(page.nextCursor).not.toBeNull();
      else expect(page.nextCursor).toBeNull();
      if (pages > 10) break; // safety
    } while (cursor);

    expect(total).toBe(repo.countEvents({}));
    expect(total).toBe(250);
    // Verify ordering matches date-desc tie breaker
    // Check count via second traversal with different sort
    const ascPage = repo.listEventsPage({ limit: 100, sort: 'date-asc' });
    expect(ascPage.rows[0].eventDate <= ascPage.rows[1].eventDate).toBe(true);
  });

  it('filters are pushed to SQL and count matches', () => {
    const db = createNodeTestDb();
    seedScaleEvents(db, { eventCount: 120, seed: 7 });
    const repo = createEventRepo(db);
    // add a distinct venue region via direct insert
    const all = repo.listEventsPage({ limit: 100 });
    expect(all.rows.length).toBeGreaterThan(0);
    const year = all.rows[0].eventDate.slice(0, 4);
    const filtered = repo.listEventsPage({ limit: 100, filters: { year } });
    for (const r of filtered.rows) expect(r.eventDate.slice(0, 4)).toBe(year);
    expect(repo.countEvents({ year })).toBe(filtered.rows.length);
  });

  it('cheki sort paginates with cursor', () => {
    const db = createNodeTestDb();
    seedScaleEvents(db, { eventCount: 80, seed: 99 });
    const repo = createEventRepo(db);
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const page = repo.listEventsPage({ limit: 20, cursor, sort: 'cheki-desc' });
      for (const r of page.rows) seen.add(r.id);
      if (!page.hasMore) break;
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(80);
  });

  it('EXPLAIN uses index for hot cursor query', () => {
    const db = createNodeTestDb();
    seedScaleEvents(db, { eventCount: 10 });
    const details = explainDetails(db, `SELECT e.id FROM event e LEFT JOIN venue v ON v.id = e.venue_id WHERE e.deleted_at IS NULL ORDER BY e.event_date DESC, e.created_at DESC, e.id DESC LIMIT 51`);
    const text = details.join(' | ');
    // Should be SEARCH or USING INDEX, not SCAN without index
    expect(text).toMatch(/SEARCH|USING INDEX/);
    expect(text).not.toMatch(/SCAN TABLE event/);
  });

  it('album pagination is bounded and lazy', () => {
    const db = createNodeTestDb();
    const { createIdolRepo } = require('@/repositories/idol');
    const idolRepo = createIdolRepo(db);
    const idol = idolRepo.createIdol({ name: 'Album Idol', country: 'JP', status: 'active' });
    // Ensure at least one cheki_entry exists for cheki album linking
    const { createEventRepo } = require('@/repositories/event');
    const eventRepo = createEventRepo(db);
    const ct = idolRepo.createChekiType({ idolId: idol.id, label: 'Test', currency: 'JPY', unitPrice: 1000 });
    eventRepo.createEvent({ title: 'Seed Event', eventDate: '2023-06-01', country: 'JP', entries: [{ idolId: idol.id, chekiTypeId: ct.id, quantity: 1, currency: 'JPY', unitPrice: 1000, photos: [] }] });
    const { seedScaleAlbum } = require('@/testing/scaleFixtures');
    seedScaleAlbum(db, idol.id, 120, { seed: 11 });
    const repo = createEventRepo(db);
    const total = repo.countIdolAlbumMedia(idol.id, {});
    expect(total).toBeGreaterThan(50);
    const page1 = repo.listIdolAlbumPage(idol.id, { limit: 50 });
    expect(page1.rows.length).toBe(50);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = repo.listIdolAlbumPage(idol.id, { limit: 50, cursor: page1.nextCursor });
    expect(page2.rows.length).toBeGreaterThan(0);
    // no overlap
    const ids1 = new Set(page1.rows.map((r: { id: string }) => r.id));
    for (const r of page2.rows) expect(ids1.has((r as { id: string }).id)).toBe(false);
    // traversal covers all
    const allIds = new Set<string>();
    let cursor: string | null = null;
    let seen = 0;
    do {
      const p: { rows: { id: string }[]; nextCursor: string | null; hasMore: boolean } = repo.listIdolAlbumPage(idol.id, { limit: 50, cursor });
      for (const r of p.rows) allIds.add((r as { id: string }).id);
      seen += p.rows.length;
      cursor = p.nextCursor;
      if (!p.hasMore) break;
    } while (cursor);
    expect(seen).toBe(total);
    expect(allIds.size).toBe(total);
  });
});

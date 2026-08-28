/**
 * Deterministic scale fixtures for M4 / T-001.
 * Generates 100k events/entries, 10k media, tombstone-heavy datasets without entering prod bundle.
 * Only imported by tests (src/testing/*). Keep helpers minimal and synchronous.
 */
import type { SqliteLike } from '@/db/types';
import { createIdolRepo } from '@/repositories/idol';

export interface ScaleFixtureOptions {
  eventCount?: number; // default 100_000
  seed?: number;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idCounter = 0;
function deterministicId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(7, '0')}-${idCounter++}`;
}

/**
 * Inserts a deterministic set of idols/groups/trips/venues needed as FK targets,
 * then bulk-inserts events with 1 cheki entry each and optional media.
 * Runs inside transactions for speed. Returns inserted counts.
 *
 * NOTE: uses low-level SQL for speed, bypassing some repo validation that would be O(N^2).
 */
export function seedScaleEvents(db: SqliteLike, opts: ScaleFixtureOptions = {}): { idols: number; events: number; entries: number } {
  const count = opts.eventCount ?? 5000; // keep default modest for unit tests; 100k only in scale suite
  const rand = mulberry32(opts.seed ?? 12345);

  // ensure at least one idol/group/cheki_type/venue/trip
  const idolRepo = createIdolRepo(db);
  const existingIdols = idolRepo.listIdols(true);
  let idolId = existingIdols[0]?.id;
  if (!idolId) {
    const idol = idolRepo.createIdol({ name: 'Scale Idol', country: 'JP', status: 'active' });
    idolId = idol.id;
    const group = idolRepo.createGroup({ name: 'Scale Group', country: 'JP' });
    try {
      idolRepo.createMembership({ idolId, groupId: group.id, startDate: '2000-01-01', isMain: true });
    } catch {
      // ignore duplicate main
    }
    idolRepo.createChekiType({ idolId, label: 'Scale Cheki', currency: 'JPY', unitPrice: 1000 });
  }
  const chekiTypes = idolRepo.listChekiTypes(idolId, false);
  const ctId = chekiTypes[0]?.id ?? '';
  const venueRow = db.getFirstSync<{ id: string }>('SELECT id FROM venue WHERE deleted_at IS NULL LIMIT 1');
  const venueId = venueRow?.id ?? null;
  const tripRow = db.getFirstSync<{ id: string }>('SELECT id FROM trip WHERE deleted_at IS NULL LIMIT 1');
  const tripId = tripRow?.id ?? null;

  const startMs = Date.UTC(2020, 0, 1);
  const dayMs = 24 * 60 * 60 * 1000;

  db.withTransactionSync(() => {
    for (let i = 0; i < count; i++) {
      const eventId = deterministicId('evt', i);
      // deterministic date with collisions to test tie-breaker
      const dayOffset = Math.floor(rand() * 900); // spread over ~2.5 years
      const date = new Date(startMs + dayOffset * dayMs);
      const eventDate = date.toISOString().slice(0, 10);
      // create only a few distinct created_at values to force tie collisions
      const createdAt = `2024-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`;
      const title = `Event ${i} ${i % 7 === 0 ? 'Festival' : 'Live'}`;
      db.runSync(
        `INSERT INTO event (id, title, event_date, country, venue_id, trip_id, schema_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, 'JP', ?, ?, 1, ?, ?, NULL)`,
        eventId,
        title,
        eventDate,
        venueId,
        tripId,
        createdAt,
        createdAt,
      );
      const entryId = deterministicId('ent', i);
      db.runSync(
        `INSERT INTO cheki_entry (id, event_id, idol_id, group_membership_id, cheki_type_id, quantity, currency, unit_price, subtotal, idol_name_snapshot, group_name_snapshot, cheki_type_label_snapshot, schema_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, NULL, ?, 1, 'JPY', 1000, 1000, 'Scale Idol', NULL, 'Scale Cheki', 1, ?, ?, NULL)`,
        entryId,
        eventId,
        idolId,
        ctId,
        createdAt,
        createdAt,
      );
    }
  });

  return { idols: 1, events: count, entries: count };
}

/**
 * Inserts `count` media assets linked as direct idol album items for a given idol.
 * Used for 10k album fixture.
 */
export function seedScaleAlbum(db: SqliteLike, idolId: string, count: number, opts: { seed?: number } = {}): number {
  const rand = mulberry32(opts.seed ?? 98765);
  const startMs = Date.UTC(2022, 0, 1);
  const dayMs = 24 * 60 * 60 * 1000;
  db.withTransactionSync(() => {
    for (let i = 0; i < count; i++) {
      const id = deterministicId('med', i);
      const dayOffset = Math.floor(rand() * 600);
      const createdAt = new Date(startMs + dayOffset * dayMs).toISOString().slice(0, 10) + 'T12:00:00.000Z';
      const kind = i % 10 === 0 ? 'video' : i % 3 === 0 ? 'photo' : 'cheki';
      db.runSync(
        `INSERT INTO media_asset (id, kind, content_hash, mime_type, file_size, width, height, local_path, thumbnail_path, instax_preset, schema_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        id,
        kind,
        `hash-${i}`,
        kind === 'video' ? 'video/mp4' : 'image/jpeg',
        1000 + i,
        1000,
        1000,
        `/tmp/${id}.jpg`,
        `/tmp/${id}_thumb.jpg`,
        kind === 'cheki' ? 'mini' : null,
        createdAt,
        createdAt,
      );
      // direct: idol_media for non-cheki, cheki: need an entry+event (use first event)
      if (kind === 'cheki') {
        // create a throwaway event/entry if needed - reuse first existing event's entry
        const entry = db.getFirstSync<{ id: string }>('SELECT id FROM cheki_entry WHERE idol_id = ? LIMIT 1', idolId);
        if (entry) {
          db.runSync(`INSERT OR IGNORE INTO cheki_entry_media (media_asset_id, cheki_entry_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, id, entry.id, i + 1, createdAt, createdAt);
        }
      } else {
        db.runSync(`INSERT OR IGNORE INTO idol_media (media_asset_id, idol_id, sort_order, idol_name_snapshot, group_name_snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, idolId, i, 'Scale Idol', null, createdAt, createdAt);
      }
    }
  });
  return count;
}

import { createEventRepo, createIdolRepo, seedFixture } from '@/testing/seed';
import type { AlbumMediaRow } from '@/repositories/event';
import {
  albumMediaAspectRatio,
  calculateAlbumTileHeight,
  buildSixMonthChekiSeries,
  filterAndGroupAlbumMedia,
  getIdolDetailHistory,
  summarizeChekiTypes,
} from '@/services/idolDetail';

function albumItem(
  id: string,
  source: AlbumMediaRow['source'],
  kind: AlbumMediaRow['kind'],
  createdAt: string,
): AlbumMediaRow {
  return {
    id,
    source,
    kind,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    schemaVersion: 1,
    contentHash: null,
    mimeType: null,
    fileSize: null,
    width: null,
    height: null,
    durationMs: null,
    localPath: `/media/${id}`,
    thumbnailPath: null,
    entryId: source === 'cheki' ? `entry-${id}` : null,
    position: 0,
    idolNameSnapshot: null,
    groupNameSnapshot: null,
  };
}

describe('idol detail aggregation', () => {
  it('returns only the selected idol events with per-type and currency totals', () => {
    const fixture = seedFixture();
    const idolRepo = createIdolRepo(fixture.db);
    const eventRepo = createEventRepo(fixture.db);
    const special = idolRepo.createChekiType({
      idolId: fixture.idolId,
      label: 'Special',
      currency: 'IDR',
      unitPrice: 50_000,
    });
    const otherIdol = idolRepo.createIdol({ name: 'Other', country: 'JP', status: 'active' });
    const otherType = idolRepo.createChekiType({
      idolId: otherIdol.id,
      label: 'Normal',
      currency: 'JPY',
      unitPrice: 1_000,
    });

    eventRepo.createEvent({
      title: 'August Live',
      eventDate: '2026-08-10',
      country: 'JP',
      venueId: fixture.venueId,
      entries: [
        {
          idolId: fixture.idolId,
          groupMembershipId: fixture.membershipBId,
          chekiTypeId: fixture.chekiTypeAId,
          quantity: 2,
          currency: 'JPY',
          unitPrice: 1_000,
        },
        {
          idolId: fixture.idolId,
          groupMembershipId: fixture.membershipBId,
          chekiTypeId: special.id,
          quantity: 1,
          currency: 'IDR',
          unitPrice: 50_000,
        },
        {
          idolId: otherIdol.id,
          chekiTypeId: otherType.id,
          quantity: 9,
          currency: 'JPY',
          unitPrice: 1_000,
        },
      ],
    });
    eventRepo.createEvent({
      title: 'June Live',
      eventDate: '2026-06-01',
      country: 'JP',
      entries: [
        {
          idolId: fixture.idolId,
          groupMembershipId: fixture.membershipBId,
          chekiTypeId: fixture.chekiTypeAId,
          quantity: 3,
          currency: 'JPY',
          unitPrice: 1_000,
        },
      ],
    });

    const history = getIdolDetailHistory(fixture.db, fixture.idolId);

    expect(history.map((event) => event.title)).toEqual(['August Live', 'June Live']);
    expect(history[0]).toMatchObject({ chekiCount: 3, venueName: 'Tachikawa Stage' });
    expect(history[0].chekiTotals).toMatchObject({ JPY: 2_000, IDR: 50_000 });
    expect(history[0].types).toEqual([
      expect.objectContaining({ label: 'Normal', quantity: 2, subtotal: 2_000 }),
      expect.objectContaining({ label: 'Special', quantity: 1, subtotal: 50_000 }),
    ]);
    expect(summarizeChekiTypes(history)).toEqual([
      expect.objectContaining({ label: 'Normal', quantity: 5, subtotal: 5_000 }),
      expect.objectContaining({ label: 'Special', quantity: 1, subtotal: 50_000 }),
    ]);
  });

  it('fills a deterministic six-month series including empty months', () => {
    const series = buildSixMonthChekiSeries(
      [
        { eventDate: '2026-08-10', chekiCount: 3 },
        { eventDate: '2026-06-01', chekiCount: 2 },
        { eventDate: '2026-02-28', chekiCount: 99 },
      ],
      '2026-08-16',
    );

    expect(series).toEqual([
      { key: '2026-03', label: 'Mar', count: 0 },
      { key: '2026-04', label: 'Apr', count: 0 },
      { key: '2026-05', label: 'May', count: 0 },
      { key: '2026-06', label: 'Jun', count: 2 },
      { key: '2026-07', label: 'Jul', count: 0 },
      { key: '2026-08', label: 'Aug', count: 3 },
    ]);
  });

  it('filters album sources and keeps date groups in the selected order', () => {
    const items = [
      albumItem('photo-aug', 'direct', 'photo', '2026-08-12T08:00:00.000Z'),
      albumItem('cheki-aug', 'cheki', 'photo', '2026-08-11T08:00:00.000Z'),
      albumItem('video-jul', 'direct', 'video', '2026-07-05T08:00:00.000Z'),
      albumItem('photo-2025', 'direct', 'photo', '2025-08-01T08:00:00.000Z'),
    ];

    expect(
      filterAndGroupAlbumMedia(items, {
        kind: 'photo',
        month: '08',
        year: '2026',
        order: 'newest',
      }),
    ).toEqual([{ date: '2026-08-12', items: [expect.objectContaining({ id: 'photo-aug' })] }]);

    expect(
      filterAndGroupAlbumMedia(items, {
        kind: 'all',
        month: 'all',
        year: 'all',
        order: 'oldest',
      }).map((group) => group.date),
    ).toEqual(['2025-08-01', '2026-07-05', '2026-08-11', '2026-08-12']);
  });

  it('uses square direct media and canonical outer-card ratios for Cheki', () => {
    expect(albumMediaAspectRatio({ source: 'direct', width: 400, height: 800 })).toBe(1);
    expect(albumMediaAspectRatio({ source: 'cheki', instaxPreset: 'mini', width: 540, height: 860 })).toBeCloseTo(54 / 86);
    expect(albumMediaAspectRatio({ source: 'cheki', instaxPreset: 'mini', width: 860, height: 540 })).toBeCloseTo(86 / 54);
    expect(albumMediaAspectRatio({ source: 'cheki', instaxPreset: 'square', width: 800, height: 600 })).toBeCloseTo(86 / 72);
    expect(albumMediaAspectRatio({ source: 'cheki', instaxPreset: 'wide', width: 600, height: 800 })).toBeCloseTo(86 / 108);
    expect(albumMediaAspectRatio({ source: 'cheki', instaxPreset: 'wide', width: null, height: null })).toBeCloseTo(86 / 108);
  });

  it('calculates a responsive Figma-based album tile height', () => {
    expect(calculateAlbumTileHeight(328)).toBe(122);
    expect(calculateAlbumTileHeight(100)).toBe(96);
    expect(calculateAlbumTileHeight(1_000)).toBe(144);
  });
});

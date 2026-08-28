import { seedFixture } from '@/testing/seed';
import { createEventRepo } from '@/repositories/event';
import { createIdolRepo } from '@/repositories/idol';
import {
  getEventsByDate,
  getRecentEventsWithStats,
  getTopIdols,
  resolveIdolPhotoUris,
} from '../dashboard';

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists(): boolean {
      return this.uri === '/thumbnails/m1.jpg' || this.uri === '/originals/m1.jpg';
    }
  },
}));

describe('dashboard queries', () => {
  it('getTopIdols returns active group name, status and favorite flag', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'Live 1',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 2, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const top = getTopIdols(f.db, 'cheki');
    expect(top).toHaveLength(1);
    expect(top[0].idolName).toBe('Hinata');
    expect(top[0].groupName).toBe('Group B');
    expect(top[0].status).toBe('active');
    expect(top[0].isFavorite).toBe(false);
    expect(top[0].chekiCount).toBe(2);
    expect(top[0].rankCurrency).toBe('JPY');
    expect(top[0].rankAmount).toBe(2000);
  });

  it('getRecentEventsWithStats aggregates cheki count and spend per event', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({
      title: 'Cream Soda',
      eventDate: '2026-08-05',
      country: 'JP',
      ticketCurrency: 'JPY',
      ticketAmount: 3000,
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 3, currency: 'JPY', unitPrice: 1000 },
      ],
    });

    const events = getRecentEventsWithStats(f.db, 5);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Cream Soda');
    expect(events[0].chekiCount).toBe(3);
    expect(events[0].primaryCurrency).toBe('JPY');
    expect(events[0].spendTotals.JPY).toBe(3000);
  });

  it('getRecentEventsWithStats preserves mixed cheki currencies instead of relabeling their sum', () => {
    const f = seedFixture();
    const idolRepo = createIdolRepo(f.db);
    const repo = createEventRepo(f.db);
    const idrType = idolRepo.createChekiType({ idolId: f.idolId, label: 'IDR', currency: 'IDR', unitPrice: 100_000 });

    repo.createEvent({
      title: 'Mixed currencies',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 },
        { idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: idrType.id, quantity: 1, currency: 'IDR', unitPrice: 100_000 },
      ],
    });

    const event = getRecentEventsWithStats(f.db, 1)[0];
    expect(event.chekiCount).toBe(2);
    expect(event.spendTotals.JPY).toBe(1000);
    expect(event.spendTotals.IDR).toBe(100_000);
  });

  it('getTopIdols counts distinct events across currencies without undercounting', () => {
    const f = seedFixture();
    const idolRepo = createIdolRepo(f.db);
    const repo = createEventRepo(f.db);
    const idrType = idolRepo.createChekiType({ idolId: f.idolId, label: 'IDR', currency: 'IDR', unitPrice: 50_000 });

    repo.createEvent({
      title: 'JPY event',
      eventDate: '2026-08-05',
      country: 'JP',
      entries: [{ idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: f.chekiTypeAId, quantity: 1, currency: 'JPY', unitPrice: 1000 }],
    });
    repo.createEvent({
      title: 'IDR event',
      eventDate: '2026-08-06',
      country: 'ID',
      entries: [{ idolId: f.idolId, groupMembershipId: f.membershipBId, chekiTypeId: idrType.id, quantity: 2, currency: 'IDR', unitPrice: 50_000 }],
    });

    const top = getTopIdols(f.db, 'event');
    expect(top[0].eventCount).toBe(2);
    expect(top[0].chekiCount).toBe(3);
    expect(top[0].spendTotals).toMatchObject({ JPY: 1000, IDR: 100_000 });
  });

  it('getEventsByDate lists events for a date with venue name', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.createEvent({ title: 'A', eventDate: '2026-08-05', country: 'JP', venueId: f.venueId });
    repo.createEvent({ title: 'B', eventDate: '2026-08-06', country: 'JP' });

    const events = getEventsByDate(f.db, '2026-08-05');
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('A');
    expect(events[0].venueName).toBe('Tachikawa Stage');
  });

  it('resolveIdolPhotoUris maps media ids to thumbnail or local path', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.insertMediaAsset({
      id: 'm1',
      kind: 'cheki',
      contentHash: 'h1',
      mimeType: 'image/jpeg',
      fileSize: 100,
      width: 100,
      height: 100,
      localPath: '/originals/m1.jpg',
      thumbnailPath: '/thumbnails/m1.jpg',
    });

    const map = resolveIdolPhotoUris(f.db, ['m1', 'missing', null]);
    expect(map.get('m1')).toBe('/thumbnails/m1.jpg');
    expect(map.has('missing')).toBe(false);
  });

  it('resolveIdolPhotoUris falls back to the local path when the thumbnail file is missing', () => {
    const f = seedFixture();
    const repo = createEventRepo(f.db);
    repo.insertMediaAsset({
      id: 'm2',
      kind: 'cheki',
      contentHash: 'h2',
      mimeType: 'image/jpeg',
      fileSize: 100,
      width: 100,
      height: 100,
      localPath: '/originals/m1.jpg',
      thumbnailPath: '/thumbnails/missing-thumb.jpg',
    });

    const map = resolveIdolPhotoUris(f.db, ['m2']);
    expect(map.get('m2')).toBe('/originals/m1.jpg');
  });
});

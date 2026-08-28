import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createEventRepo } from '@/repositories/event';
import { createIdolRepo } from '@/repositories/idol';

const MEDIA_DEFAULTS = {
  contentHash: 'album-hash',
  mimeType: 'image/jpeg',
  fileSize: 1,
  width: 400,
  height: 600,
  localPath: 'file:///album.jpg',
};

describe('album media metadata snapshots', () => {
  it('keeps direct media names from the active membership when the media was added', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const eventRepo = createEventRepo(db);
    const idol = idolRepo.createIdol({ name: 'Kohana Mona', country: 'JP', status: 'active' });
    const group = idolRepo.createGroup({ name: 'AQA', country: 'JP' });
    const membership = idolRepo.createMembership({
      idolId: idol.id,
      groupId: group.id,
      startDate: '2024-01-01',
      endDate: '2025-12-31',
      name: 'Kohana Mona',
      isMain: true,
    });
    const media = eventRepo.insertMediaAsset({
      id: 'direct-historical',
      kind: 'photo',
      ...MEDIA_DEFAULTS,
      createdAt: '2024-06-01T00:00:00.000Z',
    });

    eventRepo.attachMediaToIdol(media.id, idol.id);

    idolRepo.updateIdol(idol.id, { name: 'Mona Kohana' });
    idolRepo.updateMembership(membership.id, { name: 'Current Stage Name' });
    idolRepo.updateGroup(group.id, { name: 'Renamed AQA' });

    expect(eventRepo.listIdolAlbumMedia(idol.id)).toEqual([
      expect.objectContaining({
        id: media.id,
        source: 'direct',
        idolNameSnapshot: 'Kohana Mona',
        groupNameSnapshot: 'AQA',
      }),
    ]);
  });

  it('exposes Cheki entry snapshots on album rows', () => {
    const db = createNodeTestDb();
    const idolRepo = createIdolRepo(db);
    const eventRepo = createEventRepo(db);
    const idol = idolRepo.createIdol({ name: 'Current Name', country: 'JP', status: 'active' });
    const group = idolRepo.createGroup({ name: 'AQA', country: 'JP' });
    const membership = idolRepo.createMembership({
      idolId: idol.id,
      groupId: group.id,
      startDate: '2024-01-01',
      endDate: '2025-12-31',
      name: 'Kohana Mona',
      isMain: true,
    });
    const type = idolRepo.createChekiType({ idolId: idol.id, label: 'Normal', currency: 'JPY', unitPrice: 1000 });
    const media = eventRepo.insertMediaAsset({
      id: 'cheki-historical',
      kind: 'cheki',
      ...MEDIA_DEFAULTS,
      instaxPreset: 'wide',
      createdAt: '2024-06-01T00:00:00.000Z',
    });

    eventRepo.createEvent({
      title: 'Live',
      eventDate: '2024-06-01',
      country: 'JP',
      entries: [{
        idolId: idol.id,
        groupMembershipId: membership.id,
        chekiTypeId: type.id,
        quantity: 1,
        currency: 'JPY',
        unitPrice: 1000,
        photos: [{ mediaAssetId: media.id }],
      }],
    });

    idolRepo.updateIdol(idol.id, { name: 'Changed Current Name' });
    idolRepo.updateMembership(membership.id, { name: 'Changed Membership Name' });
    idolRepo.updateGroup(group.id, { name: 'Renamed AQA' });

    expect(eventRepo.listIdolAlbumMedia(idol.id)).toEqual([
      expect.objectContaining({
        id: media.id,
        source: 'cheki',
        idolNameSnapshot: 'Kohana Mona',
        groupNameSnapshot: 'AQA',
      }),
    ]);
  });
});

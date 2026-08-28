import {
  sortEventRows,
  sortIdolGroupRows,
  sortTripRows,
  sortVenueRows,
} from '@/services/mainListSort';

const base = {
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('main list sorting', () => {
  it('sorts idol/group rows by activity without mutating the source array', () => {
    const rows = [
      { ...base, id: 'a', name: 'Alpha', eventCount: 2, chekiCount: 12 },
      { ...base, id: 'b', name: 'Beta', eventCount: 8, chekiCount: 3 },
    ];

    expect(sortIdolGroupRows(rows, 'events-desc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(sortIdolGroupRows(rows, 'events-asc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortIdolGroupRows(rows, 'cheki-desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortIdolGroupRows(rows, 'cheki-asc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(sortIdolGroupRows(rows, 'name-asc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortIdolGroupRows(rows, 'name-desc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('uses deterministic name and id tie breakers', () => {
    const rows = [
      { ...base, id: 'b', name: 'Same', eventCount: 2, chekiCount: 1 },
      { ...base, id: 'a', name: 'Same', eventCount: 2, chekiCount: 1 },
    ];

    expect(sortIdolGroupRows(rows, 'events-desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortIdolGroupRows(rows, 'recently-added').map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('sorts venue rows by visits and events by date or cheki count', () => {
    const venues = [
      { ...base, id: 'a', name: 'Alpha', visitCount: 1 },
      { ...base, id: 'b', name: 'Beta', visitCount: 7 },
    ];
    const events = [
      { ...base, id: 'a', title: 'Alpha', eventDate: '2025-01-01', chekiCount: 9 },
      { ...base, id: 'b', title: 'Beta', eventDate: '2026-01-01', chekiCount: 2 },
    ];

    expect(sortVenueRows(venues, 'visits-desc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(sortVenueRows(venues, 'visits-asc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortVenueRows(venues, 'name-asc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortVenueRows(venues, 'name-desc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(sortVenueRows(venues, 'recently-added').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortEventRows(events, 'date-desc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(sortEventRows(events, 'date-asc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortEventRows(events, 'cheki-desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortEventRows(events, 'cheki-asc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(sortEventRows(events, 'recently-added').map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('sorts trips by start date, activity, and recently added', () => {
    const trips = [
      { ...base, id: 'a', title: 'Alpha', startDate: '2026-01-01', eventCount: 7 },
      { ...base, id: 'b', title: 'Beta', startDate: '2026-03-01', eventCount: 2, createdAt: '2026-02-01T00:00:00.000Z' },
    ];

    expect(sortTripRows(trips, 'start-desc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(sortTripRows(trips, 'start-asc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortTripRows(trips, 'events-desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortTripRows(trips, 'events-asc').map((row) => row.id)).toEqual(['b', 'a']);
    expect(sortTripRows(trips, 'recently-added').map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('falls back to labels when numeric and date values match', () => {
    const venues = [
      { ...base, id: 'b', name: 'Beta', visitCount: 1 },
      { ...base, id: 'a', name: 'Alpha', visitCount: 1 },
    ];
    const events = [
      { ...base, id: 'b', title: 'Beta', eventDate: '2026-01-01', chekiCount: 1 },
      { ...base, id: 'a', title: 'Alpha', eventDate: '2026-01-01', chekiCount: 1 },
    ];
    const trips = [
      { ...base, id: 'b', title: 'Beta', startDate: '2026-01-01', eventCount: 1 },
      { ...base, id: 'a', title: 'Alpha', startDate: '2026-01-01', eventCount: 1 },
    ];

    expect(sortVenueRows(venues, 'visits-desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortEventRows(events, 'cheki-desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortEventRows(events, 'date-desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortTripRows(trips, 'events-desc').map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortTripRows(trips, 'start-desc').map((row) => row.id)).toEqual(['a', 'b']);
  });
});

export type IdolGroupSort = 'name-asc' | 'name-desc' | 'events-asc' | 'events-desc' | 'cheki-asc' | 'cheki-desc' | 'recently-added-asc' | 'recently-added';
export type VenueSort = 'name-asc' | 'name-desc' | 'visits-asc' | 'visits-desc' | 'recently-added-asc' | 'recently-added';
export type EventSort = 'date-desc' | 'date-asc' | 'cheki-asc' | 'cheki-desc' | 'recently-added-asc' | 'recently-added';
export type TripSort = 'start-desc' | 'start-asc' | 'events-asc' | 'events-desc' | 'recently-added-asc' | 'recently-added';

interface BaseSortableRow {
  id: string;
  createdAt: string;
}

interface IdolGroupSortableRow extends BaseSortableRow {
  name: string;
  eventCount: number;
  chekiCount: number;
}

interface VenueSortableRow extends BaseSortableRow {
  name: string;
  visitCount: number;
}

interface EventSortableRow extends BaseSortableRow {
  title: string;
  eventDate: string;
  chekiCount: number;
}

interface TripSortableRow extends BaseSortableRow {
  title: string;
  startDate: string;
  eventCount: number;
}

function compareLabelAndId(
  a: BaseSortableRow,
  b: BaseSortableRow,
  labelOf: (row: BaseSortableRow) => string,
): number {
  return labelOf(a).localeCompare(labelOf(b)) || a.id.localeCompare(b.id);
}

export function sortIdolGroupRows<T extends IdolGroupSortableRow>(rows: readonly T[], sort: IdolGroupSort): T[] {
  return [...rows].sort((a, b) => {
    const tie = () => compareLabelAndId(a, b, (row) => (row as IdolGroupSortableRow).name);
    const direction = sort.endsWith('-asc') ? 1 : -1;
    if (sort.startsWith('name-')) return direction * a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    if (sort.startsWith('events-')) return direction * (a.eventCount - b.eventCount) || tie();
    if (sort.startsWith('cheki-')) return direction * (a.chekiCount - b.chekiCount) || tie();
    return direction * a.createdAt.localeCompare(b.createdAt) || tie();
  });
}

export function sortVenueRows<T extends VenueSortableRow>(rows: readonly T[], sort: VenueSort): T[] {
  return [...rows].sort((a, b) => {
    const tie = () => compareLabelAndId(a, b, (row) => (row as VenueSortableRow).name);
    const direction = sort.endsWith('-asc') ? 1 : -1;
    if (sort.startsWith('name-')) return direction * a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    if (sort.startsWith('visits-')) return direction * (a.visitCount - b.visitCount) || tie();
    return direction * a.createdAt.localeCompare(b.createdAt) || tie();
  });
}

export function sortEventRows<T extends EventSortableRow>(rows: readonly T[], sort: EventSort): T[] {
  return [...rows].sort((a, b) => {
    const tie = () => compareLabelAndId(a, b, (row) => (row as EventSortableRow).title);
    const direction = sort.endsWith('-asc') ? 1 : -1;
    if (sort.startsWith('date-')) return direction * a.eventDate.localeCompare(b.eventDate) || tie();
    if (sort.startsWith('cheki-')) return direction * (a.chekiCount - b.chekiCount) || tie();
    return direction * a.createdAt.localeCompare(b.createdAt) || tie();
  });
}

export function sortTripRows<T extends TripSortableRow>(rows: readonly T[], sort: TripSort): T[] {
  return [...rows].sort((a, b) => {
    const tie = () => compareLabelAndId(a, b, (row) => (row as TripSortableRow).title);
    const direction = sort.endsWith('-asc') ? 1 : -1;
    if (sort.startsWith('start-')) return direction * a.startDate.localeCompare(b.startDate) || tie();
    if (sort.startsWith('events-')) return direction * (a.eventCount - b.eventCount) || tie();
    return direction * a.createdAt.localeCompare(b.createdAt) || tie();
  });
}

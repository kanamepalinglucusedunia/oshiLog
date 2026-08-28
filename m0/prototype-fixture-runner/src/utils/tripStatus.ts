export type TripStatus = 'on-going' | 'upcoming' | 'passed';

export function getTripStatus(
  trip: { startDate: string; endDate: string },
  today = new Date().toISOString().slice(0, 10),
): TripStatus {
  if (trip.startDate <= today && trip.endDate >= today) return 'on-going';
  if (trip.startDate > today) return 'upcoming';
  return 'passed';
}

export function getTripProgress(
  trip: { startDate: string; endDate: string },
  today = new Date().toISOString().slice(0, 10),
): number {
  if (trip.endDate < trip.startDate) return 0;
  const start = new Date(trip.startDate).getTime();
  const end = new Date(trip.endDate).getTime();
  const now = new Date(today).getTime();
  if (now <= start) return 0;
  if (now >= end) return 1;
  const total = end - start;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / total));
}

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  'on-going': 'On Going',
  upcoming: 'Upcoming',
  passed: 'Passed',
};

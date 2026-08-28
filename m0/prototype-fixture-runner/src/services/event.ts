import { z } from 'zod';
import type { SqliteLike } from '@/db/types';
import { COUNTRIES, type CountryCode } from '@/types/domain';
import { isValidISODate } from '@/utils/date';

const countryCodes = COUNTRIES.map((c) => c.code);
const currencyCodes = ['JPY', 'IDR', 'MYR', 'KRW', 'THB'] as const;

export const chekiEntrySchema = z.object({
  idolId: z.string().min(1),
  groupMembershipId: z.string().nullable().optional(),
  chekiTypeId: z.string().min(1),
  quantity: z.number().int().positive(),
  currency: z.enum(currencyCodes),
  unitPrice: z.number().int().nonnegative(),
  photoCount: z.number().int().nonnegative(),
});

export const eventSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  eventDate: z.string().refine(isValidISODate, 'Invalid date'),
  country: z.enum(countryCodes as [CountryCode, ...CountryCode[]]),
  venueId: z.string().nullable().optional(),
  tripId: z.string().nullable().optional(),
  ticketCurrency: z.enum(currencyCodes).nullable().optional(),
  ticketAmount: z.number().int().nonnegative().nullable().optional(),
  drinkCurrency: z.enum(currencyCodes).nullable().optional(),
  drinkAmount: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
  entries: z.array(chekiEntrySchema).max(50).optional(),
});

export type ValidatedEvent = z.infer<typeof eventSchema>;

export class EventValidationError extends Error {
  issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super(issues.length > 0 ? `Event validation failed: ${issues[0].message}` : 'Event validation failed');
    this.name = 'EventValidationError';
    this.issues = issues;
  }
}

/**
 * Parses and cross-validates event input against the database.
 * Throws EventValidationError on any failure.
 */
export function validateEventInput(db: SqliteLike, input: unknown): ValidatedEvent {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    throw new EventValidationError(
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  const data = parsed.data;

  const issues: { path: string; message: string }[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });

  if (data.ticketAmount != null && !data.ticketCurrency) fail('ticketCurrency', 'Ticket currency is required when ticket amount is set');
  if (data.ticketAmount == null && data.ticketCurrency) fail('ticketAmount', 'Ticket amount is required when ticket currency is set');
  if (data.drinkAmount != null && !data.drinkCurrency) fail('drinkCurrency', 'Drink currency is required when drink amount is set');
  if (data.drinkAmount == null && data.drinkCurrency) fail('drinkAmount', 'Drink amount is required when drink currency is set');

  if (data.venueId) {
    const venue = db.getFirstSync<{ id: string }>(
      `SELECT id FROM venue WHERE id = ? AND deleted_at IS NULL`,
      data.venueId,
    );
    if (!venue) fail('venueId', 'Venue does not exist or is archived');
  }

  if (data.tripId) {
    const trip = db.getFirstSync<{ id: string; start_date: string; end_date: string }>(
      `SELECT id, start_date, end_date FROM trip WHERE id = ? AND deleted_at IS NULL`,
      data.tripId,
    );
    if (!trip) {
      fail('tripId', 'Trip does not exist or is archived');
    } else {
      if (data.eventDate < trip.start_date || data.eventDate > trip.end_date) {
        fail('tripId', `Event date must be within the trip period (${trip.start_date} to ${trip.end_date})`);
      }
      const tripCountries = db.getAllSync<{ country: string }>(
        `SELECT country FROM trip_country WHERE trip_id = ? AND deleted_at IS NULL`,
        data.tripId,
      );
      if (tripCountries.length > 0 && !tripCountries.some((c) => c.country === data.country)) {
        fail('tripId', 'Event country must be one of the trip countries');
      }
    }
  }

  for (const entry of data.entries ?? []) {
    const failPrefix = `entries[${(data.entries ?? []).indexOf(entry)}]`;
    const chekiType = db.getFirstSync<{ id: string; currency: string; unit_price: number; idol_id: string }>(
      `SELECT id, currency, unit_price, idol_id FROM cheki_type WHERE id = ? AND deleted_at IS NULL`,
      entry.chekiTypeId,
    );
    if (!chekiType) {
      fail(`${failPrefix}.chekiTypeId`, 'Cheki type does not exist or is archived');
    } else {
      if (chekiType.idol_id !== entry.idolId) {
        fail(`${failPrefix}.chekiTypeId`, 'Cheki type does not belong to the selected idol');
      }
      if (chekiType.currency !== entry.currency) {
        fail(`${failPrefix}.chekiTypeId`, 'Cheki type currency must match the saved entry currency');
      }
      if (entry.unitPrice !== chekiType.unit_price) {
        fail(`${failPrefix}.unitPrice`, 'Unit price must match the selected cheki type');
      }
    }
    if (entry.photoCount > entry.quantity) {
      fail(`${failPrefix}.photoCount`, `Photo count (${entry.photoCount}) cannot exceed quantity (${entry.quantity})`);
    }
    if (entry.groupMembershipId) {
      const membership = db.getFirstSync<{ id: string; idol_id: string }>(
        `SELECT id, idol_id FROM group_membership WHERE id = ? AND deleted_at IS NULL`,
        entry.groupMembershipId,
      );
      if (!membership) {
        fail(`${failPrefix}.groupMembershipId`, 'Membership does not exist');
      } else if (membership.idol_id !== entry.idolId) {
        fail(`${failPrefix}.groupMembershipId`, 'Membership does not belong to the selected idol');
      }
    }
  }

  if (issues.length > 0) {
    throw new EventValidationError(issues);
  }
  return data;
}

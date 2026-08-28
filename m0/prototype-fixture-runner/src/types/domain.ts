export type CountryCode = 'JP' | 'ID' | 'MY' | 'KR' | 'TH';
export type CurrencyCode = 'JPY' | 'IDR' | 'MYR' | 'KRW' | 'THB';
export type SurfaceStyle = 'outline' | 'soft-shadow';
export type ThemeMode = 'light' | 'dark';
export type EventStatus = 'completed';
export type BackupCategory = 'data' | 'media';
export type ReminderFrequency = 'off' | 'daily' | 'weekly' | 'monthly';
export type MediaKind = 'cheki' | 'photo' | 'video';
export type InstaxPreset = 'auto' | 'mini' | 'square' | 'wide';
export type StoredInstaxPreset = Exclude<InstaxPreset, 'auto'>;
export type ExpenseCategory = 'flight' | 'hotel' | 'transport' | 'meal' | 'other';
export type IdolStatus = 'active' | 'hiatus' | 'inactive';
export type MembershipStatus = 'active' | 'grad' | 'hiatus';
export type MembershipPeriodStatus = Exclude<MembershipStatus, 'grad'>;
export type SocialPlatform = 'x' | 'instagram' | 'tiktok';

export interface SocialProfileUrls {
  xProfileUrl: string | null;
  instagramProfileUrl: string | null;
  tiktokProfileUrl: string | null;
}

export const COUNTRIES: readonly { code: CountryCode; name: string; currency: CurrencyCode }[] = [
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'KR', name: 'Korea', currency: 'KRW' },
  { code: 'TH', name: 'Thailand', currency: 'THB' },
] as const;

export const CURRENCIES: Record<CountryCode, CurrencyCode> = {
  JP: 'JPY',
  ID: 'IDR',
  MY: 'MYR',
  KR: 'KRW',
  TH: 'THB',
};

export const CURRENCY_BY_CODE: Record<CurrencyCode, { symbol: string; decimals: number; name: string }> = {
  JPY: { symbol: '¥', decimals: 0, name: 'Japanese Yen' },
  IDR: { symbol: 'Rp', decimals: 0, name: 'Indonesian Rupiah' },
  MYR: { symbol: 'RM', decimals: 2, name: 'Malaysian Ringgit' },
  KRW: { symbol: '₩', decimals: 0, name: 'Korean Won' },
  THB: { symbol: '฿', decimals: 2, name: 'Thai Baht' },
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  flight: 'Flight',
  hotel: 'Hotel',
  transport: 'Transport',
  meal: 'Meal',
  other: 'Other',
};

export const DEFAULT_ACCENT = '#7F6EB5';
export const ACCENT_PRESETS = [
  { label: 'Lavender', hex: '#7F6EB5' },
  { label: 'Rose', hex: '#D65A7B' },
  { label: 'Sky', hex: '#4A9BC7' },
  { label: 'Emerald', hex: '#2E9E6B' },
  { label: 'Amber', hex: '#C98A2D' },
  { label: 'Coral', hex: '#D96C4F' },
  { label: 'Teal', hex: '#2E9E9E' },
  { label: 'Indigo', hex: '#5B6CC6' },
] as const;

interface AuditFields {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  schemaVersion: number;
}

export interface AppSettings extends AuditFields {
  id: string;
  surfaceStyle: SurfaceStyle;
  themeMode: ThemeMode;
  accentColor: string;
  homeHeaderLabel: string;
  onboardingCompleted: boolean;
  dataReminderFrequency: ReminderFrequency;
  mediaReminderFrequency: ReminderFrequency;
}

export interface CountryPreference extends AuditFields {
  id: string;
  country: CountryCode;
  isActive: boolean;
}

export interface Region extends AuditFields {
  id: string;
  country: CountryCode;
  name: string;
}

export interface Idol extends AuditFields, SocialProfileUrls {
  id: string;
  name: string;
  photoMediaId: string | null;
  country: CountryCode;
  region: string | null;
  birthDate: string | null;
  memberColor: string | null;
  status: IdolStatus;
  isFavorite: boolean;
  notes: string | null;
}

export interface Group extends AuditFields, SocialProfileUrls {
  id: string;
  name: string;
  photoMediaId: string | null;
  country: CountryCode;
  region: string | null;
  debutDate: string | null;
  endDate: string | null;
  isFavorite: boolean;
  notes: string | null;
}

export interface GroupMembership extends AuditFields {
  id: string;
  idolId: string;
  groupId: string;
  startDate: string;
  endDate: string | null;
  name: string | null;
  memberColor: string | null;
  status: MembershipStatus;
  hiatusStartDate: string | null;
  hiatusEndDate: string | null;
  isMain: boolean;
}

export interface GroupMembershipStatusPeriod extends AuditFields {
  id: string;
  groupMembershipId: string;
  status: MembershipPeriodStatus;
  startDate: string;
  endDate: string | null;
}

export interface MemberColor extends AuditFields {
  id: string;
  name: string;
  hex: string;
}

export interface IdolNameHistory extends AuditFields {
  id: string;
  idolId: string;
  groupMembershipId: string | null;
  name: string;
  effectiveAt: string;
}

export interface ChekiType extends AuditFields {
  id: string;
  idolId: string;
  label: string;
  currency: CurrencyCode;
  unitPrice: number;
  isArchived: boolean;
  isDefault: boolean;
}

export interface Venue extends AuditFields {
  id: string;
  name: string;
  country: CountryCode;
  region: string | null;
  address: string | null;
  isFavorite: boolean;
  notes: string | null;
}

export interface VenueDrinkPrice extends AuditFields {
  id: string;
  venueId: string;
  label: string | null;
  currency: CurrencyCode;
  price: number;
  isArchived: boolean;
  isDefault: boolean;
}

export interface Trip extends AuditFields {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string | null;
  isFavorite: boolean;
}

export interface TripCountry extends AuditFields {
  id: string;
  tripId: string;
  country: CountryCode;
}

export interface TripExpense extends AuditFields {
  id: string;
  tripId: string;
  title: string;
  category: ExpenseCategory;
  customCategoryLabel: string | null;
  currency: CurrencyCode;
  amount: number;
  date: string;
  note: string | null;
}

export interface Event extends AuditFields {
  id: string;
  title: string;
  eventDate: string;
  country: CountryCode;
  venueId: string | null;
  tripId: string | null;
  ticketCurrency: CurrencyCode | null;
  ticketAmount: number | null;
  drinkCurrency: CurrencyCode | null;
  drinkAmount: number | null;
  notes: string | null;
}

export interface ChekiEntry extends AuditFields {
  id: string;
  eventId: string;
  idolId: string;
  groupMembershipId: string | null;
  chekiTypeId: string;
  quantity: number;
  currency: CurrencyCode;
  unitPrice: number;
  subtotal: number;
  idolNameSnapshot: string | null;
  groupNameSnapshot: string | null;
  chekiTypeLabelSnapshot: string | null;
}

export interface MediaAsset extends AuditFields {
  id: string;
  kind: MediaKind;
  contentHash: string | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  localPath: string | null;
  thumbnailPath: string | null;
  instaxPreset?: StoredInstaxPreset | null;
}

export interface ChekiEntryMedia {
  mediaAssetId: string;
  chekiEntryId: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface IdolMedia {
  mediaAssetId: string;
  idolId: string;
  sortOrder: number;
  idolNameSnapshot: string | null;
  groupNameSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMedia {
  mediaAssetId: string;
  groupId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

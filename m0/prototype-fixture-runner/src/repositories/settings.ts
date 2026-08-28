import type { SqliteLike } from '@/db/types';
import type { AppSettings, CountryCode, CountryPreference, ReminderFrequency, SurfaceStyle, ThemeMode } from '@/types/domain';
import { nowUTCISO } from '@/utils/date';
import { uuid } from '@/utils/id';

export interface SettingsPatch {
  surfaceStyle?: SurfaceStyle;
  themeMode?: ThemeMode;
  accentColor?: string;
  homeHeaderLabel?: string;
  onboardingCompleted?: boolean;
  dataReminderFrequency?: ReminderFrequency;
  mediaReminderFrequency?: ReminderFrequency;
}

export function createSettingsRepo(db: SqliteLike) {
  const SELECT_COLS = `
    id, surface_style AS surfaceStyle, theme_mode AS themeMode, accent_color AS accentColor,
    home_header_label AS homeHeaderLabel, onboarding_completed AS onboardingCompleted,
    data_reminder_frequency AS dataReminderFrequency, media_reminder_frequency AS mediaReminderFrequency,
    schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
  `;

  function getSettings(): AppSettings {
    let row = db.getFirstSync<AppSettings>(`SELECT ${SELECT_COLS} FROM app_settings WHERE id = 'default'`);
    if (!row) {
      const now = nowUTCISO();
      const defaults: AppSettings = {
        id: 'default',
        surfaceStyle: 'outline',
        themeMode: 'light',
        accentColor: '#7F6EB5',
        homeHeaderLabel: 'oshiLog',
        onboardingCompleted: false,
        dataReminderFrequency: 'off',
        mediaReminderFrequency: 'off',
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      db.runSync(
        `INSERT INTO app_settings (id, surface_style, theme_mode, accent_color, home_header_label, onboarding_completed,
          data_reminder_frequency, media_reminder_frequency, schema_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        defaults.id,
        defaults.surfaceStyle,
        defaults.themeMode,
        defaults.accentColor,
        defaults.homeHeaderLabel,
        0,
        defaults.dataReminderFrequency,
        defaults.mediaReminderFrequency,
        defaults.schemaVersion,
        defaults.createdAt,
        defaults.updatedAt,
      );
      row = defaults;
    }
    return { ...row!, onboardingCompleted: !!row!.onboardingCompleted };
  }

  function patchSettings(patch: SettingsPatch): AppSettings {
    const current = getSettings();
    const next = { ...current, ...patch, updatedAt: nowUTCISO() };
    db.runSync(
      `UPDATE app_settings SET surface_style = ?, theme_mode = ?, accent_color = ?, home_header_label = ?,
        onboarding_completed = ?, data_reminder_frequency = ?, media_reminder_frequency = ?, updated_at = ?
       WHERE id = 'default'`,
      next.surfaceStyle,
      next.themeMode,
      next.accentColor,
      next.homeHeaderLabel,
      next.onboardingCompleted ? 1 : 0,
      next.dataReminderFrequency,
      next.mediaReminderFrequency,
      next.updatedAt,
    );
    return next;
  }

  function getCountries(): CountryPreference[] {
    const rows = db.getAllSync<CountryPreference>(`
      SELECT id, country, is_active AS isActive,
        schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
      FROM country_preference WHERE deleted_at IS NULL ORDER BY country
    `);
    return rows.map((r) => ({ ...r, isActive: !!r.isActive }));
  }

  function getActiveCountries(): CountryCode[] {
    return getCountries()
      .filter((c) => c.isActive)
      .map((c) => c.country);
  }

  function upsertCountry(country: CountryCode, isActive: boolean): void {
    const existing = db.getFirstSync<{ id: string }>(
      `SELECT id FROM country_preference WHERE country = ? AND deleted_at IS NULL`,
      country,
    );
    const now = nowUTCISO();
    if (existing) {
      db.runSync(
        `UPDATE country_preference SET is_active = ?, updated_at = ? WHERE id = ?`,
        isActive ? 1 : 0,
        now,
        existing.id,
      );
    } else {
      db.runSync(
        `INSERT INTO country_preference (id, country, is_active, schema_version, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
        uuid(),
        country,
        isActive ? 1 : 0,
        now,
        now,
      );
    }
  }

  return { getSettings, patchSettings, getCountries, getActiveCountries, upsertCountry };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;

import { create } from 'zustand';
import type { AppSettings, CountryCode, CountryPreference } from '@/types/domain';
import { getDb } from '@/db';
import { createSettingsRepo } from '@/repositories/settings';

interface SettingsState {
  settings: AppSettings | null;
  countries: CountryPreference[];
  loaded: boolean;
  loadError: string | null;
  load: () => void;
  patch: (patch: Partial<Pick<AppSettings, 'surfaceStyle' | 'themeMode' | 'accentColor' | 'homeHeaderLabel' | 'dataReminderFrequency' | 'mediaReminderFrequency'>>) => void;
  completeOnboarding: () => void;
  setCountryActive: (country: CountryCode, isActive: boolean) => void;
  activeCountries: () => CountryCode[];
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  countries: [],
  loaded: false,
  loadError: null,

  load: () => {
    try {
      const repo = createSettingsRepo(getDb());
      set({
        settings: repo.getSettings(),
        countries: repo.getCountries(),
        loaded: true,
        loadError: null,
      });
    } catch (error) {
      set({ loaded: false, loadError: error instanceof Error ? error.message : 'Could not load settings' });
      throw error;
    }
  },

  patch: (patch) => {
    const repo = createSettingsRepo(getDb());
    const next = repo.patchSettings(patch);
    set({ settings: next });
  },

  completeOnboarding: () => {
    const repo = createSettingsRepo(getDb());
    const next = repo.patchSettings({ onboardingCompleted: true });
    set({ settings: next });
  },

  setCountryActive: (country, isActive) => {
    const repo = createSettingsRepo(getDb());
    repo.upsertCountry(country, isActive);
    set({ countries: repo.getCountries() });
  },

  activeCountries: () => {
    const { countries } = get();
    return countries.filter((c) => c.isActive).map((c) => c.country);
  },
}));

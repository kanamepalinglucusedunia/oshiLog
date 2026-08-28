import type { SqliteLike } from '@/db/types';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { useFormSheetStore } from '../formSheetStore';
import { useSettingsStore } from '../settingsStore';
import { useTabPagerStore } from '../tabPagerStore';
import { useUiStore } from '../uiStore';

let mockDb: SqliteLike;
let mockDbError: Error | null = null;

jest.mock('@/db', () => ({
  getDb: () => {
    if (mockDbError) throw mockDbError;
    return mockDb;
  },
}));

describe('application stores', () => {
  beforeEach(() => {
    mockDb = createNodeTestDb();
    mockDbError = null;
    useSettingsStore.setState({ settings: null, countries: [], loaded: false, loadError: null });
    useUiStore.setState({ idolSegment: 'idol', dataVersion: 0 });
    useFormSheetStore.setState({ openForm: null });
    useTabPagerStore.setState({ focusedIndex: 0 });
  });

  it('loads and persists settings and country preferences', () => {
    const store = useSettingsStore.getState();
    store.load();
    expect(useSettingsStore.getState()).toMatchObject({ loaded: true, loadError: null });

    useSettingsStore.getState().patch({ homeHeaderLabel: 'My Oshi' });
    useSettingsStore.getState().setCountryActive('JP', true);
    useSettingsStore.getState().completeOnboarding();

    expect(useSettingsStore.getState().settings).toMatchObject({
      homeHeaderLabel: 'My Oshi',
      onboardingCompleted: true,
    });
    expect(useSettingsStore.getState().activeCountries()).toEqual(['JP']);
  });

  it('publishes load failures for startup recovery', () => {
    mockDbError = new Error('database unavailable');
    expect(() => useSettingsStore.getState().load()).toThrow('database unavailable');
    expect(useSettingsStore.getState()).toMatchObject({ loaded: false, loadError: 'database unavailable' });
  });

  it('updates navigation and form UI state deterministically', () => {
    useFormSheetStore.getState().requestOpenForm('idol');
    expect(useFormSheetStore.getState().openForm).toBe('idol');
    useFormSheetStore.getState().closeOpenForm();
    expect(useFormSheetStore.getState().openForm).toBeNull();

    useTabPagerStore.getState().setFocusedIndex(3);
    expect(useTabPagerStore.getState().focusedIndex).toBe(3);
    useUiStore.getState().setIdolSegment('group');
    useUiStore.getState().bumpDataVersion();
    expect(useUiStore.getState()).toMatchObject({ idolSegment: 'group', dataVersion: 1 });
  });
});

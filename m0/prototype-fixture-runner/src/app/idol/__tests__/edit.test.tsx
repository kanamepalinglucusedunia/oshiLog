import { act, render, screen, waitFor, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { getDb } from '@/db';
import { useSettingsStore } from '@/stores/settingsStore';
import EditIdolScreen from '@/app/idol/edit';

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
};

let mockRouteParams: Record<string, string> = { id: 'idol-1' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => mockRouter,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('@/components/ui/CountryFlag', () => ({
  CountryFlag: () => null,
}));

jest.mock('@/db', () => ({ getDb: jest.fn() }));

const testDb = createNodeTestDb();
(getDb as jest.Mock).mockReturnValue(testDb);

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    {ui}
  </SafeAreaProvider>
);

describe('EditIdolScreen end-to-end', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, countries: [], loaded: false });
    mockRouter.back.mockClear();
  });

  it('persists name and group changes and navigates back', async () => {
    const db = getDb();
    const repo = createIdolRepo(db);
    const idol = repo.createIdol({ name: 'Kohana Mona', country: 'JP', status: 'active' });
    const groupA = repo.createGroup({ name: 'AQA', country: 'JP' });
    const groupB = repo.createGroup({ name: 'Pure Palette', country: 'JP' });
    const m = repo.createMembership({ idolId: idol.id, groupId: groupA.id, startDate: '2020-01-01' });
    mockRouteParams = { id: idol.id };

    const user = userEvent.setup();
    await render(wrap(<EditIdolScreen />));

    // Edit the global name.
    const nameField = screen.getByDisplayValue('Kohana Mona');
    await user.clear(nameField);
    await user.type(nameField, 'Ichika Amu');

    // Switch the membership group via the Figma-style dropdown.
    await user.press(screen.getByLabelText('Group'));
    await user.press(screen.getByLabelText('Select group Pure Palette'));

    await user.press(screen.getByLabelText('Save Changes'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());

    const saved = repo.getIdol(idol.id);
    expect(saved?.name).toBe('Ichika Amu');

    const membership = repo.getMembership(m.id);
    expect(membership?.groupId).toBe(groupB.id);
    expect(membership?.name).toBe('Ichika Amu');
  }, 20000);

  it('loads only current Active or Hiatus memberships and leaves Grad history hidden', async () => {
    const repo = createIdolRepo(getDb());
    const idol = repo.createIdol({ name: 'History Idol', country: 'JP', status: 'active' });
    const currentGroup = repo.createGroup({ name: 'Visible Current', country: 'JP' });
    const formerGroup = repo.createGroup({ name: 'Hidden Former', country: 'JP' });
    repo.createMembership({ idolId: idol.id, groupId: currentGroup.id, startDate: '2026-01-01', status: 'active' });
    const former = repo.createMembership({
      idolId: idol.id,
      groupId: formerGroup.id,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      status: 'grad',
    });
    mockRouteParams = { id: idol.id };

    await render(wrap(<EditIdolScreen />));

    expect(screen.getByText('Visible Current')).toBeTruthy();
    expect(screen.queryByText('Hidden Former')).toBeNull();
    expect(repo.getMembership(former.id)).not.toBeNull();
  });

  it('shows empty Group Info after the final membership has graduated', async () => {
    const repo = createIdolRepo(getDb());
    const idol = repo.createIdol({ name: 'Former Idol', country: 'JP', status: 'inactive' });
    const group = repo.createGroup({ name: 'Former Group', country: 'JP' });
    repo.createMembership({
      idolId: idol.id,
      groupId: group.id,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      status: 'grad',
    });
    mockRouteParams = { id: idol.id };

    await render(wrap(<EditIdolScreen />));

    expect(screen.getByText('No current group memberships.')).toBeTruthy();
    expect(screen.queryByLabelText('Group')).toBeNull();
  });

  it('keeps Delete Idol inside Edit and confirms before archiving', async () => {
    const repo = createIdolRepo(getDb());
    const idol = repo.createIdol({ name: 'Delete Me', country: 'JP', status: 'active' });
    mockRouteParams = { id: idol.id };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const user = userEvent.setup();

    await render(wrap(<EditIdolScreen />));
    await user.press(screen.getByLabelText('Delete Idol'));

    expect(alert).toHaveBeenCalledWith(
      'Delete Idol',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Delete', style: 'destructive' })]),
    );
    const buttons = alert.mock.calls[0][2];
    await act(async () => {
      buttons?.find((button) => button.text === 'Delete')?.onPress?.();
    });

    expect(repo.getIdol(idol.id)).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/idols');
    alert.mockRestore();
  }, 20000);
});

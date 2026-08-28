import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNodeTestDb } from '@/testing/nodeSqlite';
import { createIdolRepo } from '@/repositories/idol';
import { getDb } from '@/db';
import EditGroupScreen from '@/app/group/edit';

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
let mockRouteParams: Record<string, string> = { id: 'group-1' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => mockRouter,
}));
jest.mock('@/db', () => ({ getDb: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/components/forms/GroupForm', () => ({
  GroupForm: () => null,
  createOrUpdateGroup: jest.fn(),
}));

const testDb = createNodeTestDb();
(getDb as jest.Mock).mockReturnValue(testDb);

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    {ui}
  </SafeAreaProvider>
);

describe('EditGroupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps Delete Group inside Edit Group and archives after confirmation', async () => {
    const repo = createIdolRepo(testDb);
    const group = repo.createGroup({ name: 'Delete Me', country: 'JP' });
    mockRouteParams = { id: group.id };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const user = userEvent.setup();

    await render(wrap(<EditGroupScreen />));
    await user.press(screen.getByLabelText('Delete Group'));

    expect(alert).toHaveBeenCalledWith(
      'Delete Group',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Delete', style: 'destructive' })]),
    );
    const buttons = alert.mock.calls[0][2];
    await act(async () => {
      buttons?.find((button) => button.text === 'Delete')?.onPress?.();
    });

    expect(repo.getGroup(group.id)).toBeNull();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/idols');
    alert.mockRestore();
  });
});

import { render, screen } from '@testing-library/react-native';
import { SpeedDial } from '@/components/ui/SpeedDial';
import { buildActions } from '@/app/(tabs)/_layout';

describe('SpeedDial', () => {
  it('renders actions without crashing', async () => {
    await render(
      <SpeedDial
        actions={[
          { label: 'New Idol', icon: 'star', onPress: jest.fn() },
          { label: 'New Event', icon: 'calendar', onPress: jest.fn() },
        ]}
      />,
    );
    expect(screen.getByText('New Idol')).toBeTruthy();
    expect(screen.getByText('New Event')).toBeTruthy();
  });

  it('renders empty actions without crashing', async () => {
    await render(<SpeedDial actions={[]} />);
    expect(screen.queryByText('New Idol')).toBeNull();
  });

  it('provides event, idol, and group actions for the Idol tab', () => {
    const openForm = jest.fn();
    const openEvent = jest.fn();

    const actions = buildActions('idols', openForm, openEvent);

    expect(actions.map((action) => action.label)).toEqual(['New Idol', 'New Group', 'New Event']);
    actions.find((action) => action.label === 'New Group')?.onPress();
    expect(openForm).toHaveBeenCalledWith('group');
  });
});

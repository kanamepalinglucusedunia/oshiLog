import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import SettingsMenuScreen from '../index';
import CreditsScreen from '../credits';

const mockRouter = { push: jest.fn(), back: jest.fn() };

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

describe('Credits settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is reachable from the Settings menu', async () => {
    await render(<SettingsMenuScreen />);
    await fireEvent.press(screen.getByLabelText('Credits'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/credits');
  });

  it('links the Unavatar attribution to the direct provider URL', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<CreditsScreen />);
    await fireEvent.press(screen.getByLabelText('Avatars provided by Unavatar'));
    expect(openUrl).toHaveBeenCalledWith('https://unavatar.io');
    openUrl.mockRestore();
  });
});

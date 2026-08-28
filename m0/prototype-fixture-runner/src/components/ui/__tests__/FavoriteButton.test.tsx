import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { TestInstance } from 'test-renderer';
import { BLACK_SCALE } from '@/design-system/colors';
import { FavoriteButton } from '../FavoriteButton';

describe('FavoriteButton', () => {
  const getButtonStyle = (button: TestInstance) => StyleSheet.flatten(button.props.style as StyleProp<ViewStyle>);

  it('renders inactive favorite button and handles press', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <FavoriteButton isFavorite={false} onPress={onPress} />,
    );

    const button = getByRole('button');
    expect(button).toBeTruthy();
    expect(button.props.accessibilityState).toEqual({ selected: false });
    expect(getButtonStyle(button)).toMatchObject({
      width: 40,
      height: 40,
      backgroundColor: BLACK_SCALE.B0,
      borderColor: BLACK_SCALE.B900,
      borderWidth: 1,
      borderRadius: 16,
    });
    expect(button.props.children[0].props).toMatchObject({
      name: 'favoriteHeartLarge',
      size: 24,
      color: BLACK_SCALE.B900,
      fill: 'none',
      strokeWidth: 1,
    });

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders active favorite button', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <FavoriteButton isFavorite={true} onPress={onPress} />,
    );

    const button = getByRole('button');
    expect(button.props.accessibilityState).toEqual({ selected: true });
  });

  it('renders the small active Figma variant', async () => {
    const { getByRole } = await render(
      <FavoriteButton variant="small" isFavorite onPress={jest.fn()} />,
    );

    const button = getByRole('button');
    expect(getButtonStyle(button)).toMatchObject({
      width: 20,
      height: 20,
      backgroundColor: BLACK_SCALE.B0,
      borderColor: BLACK_SCALE.B900,
      borderWidth: 1,
      borderRadius: 10,
    });
    const iconFrame = button.props.children[0];
    expect(StyleSheet.flatten(iconFrame.props.style)).toMatchObject({
      position: 'absolute',
      left: 2,
      top: 3,
      width: 14,
      height: 14,
    });

    const iconAspect = iconFrame.props.children;
    expect(StyleSheet.flatten(iconAspect.props.style)).toMatchObject({
      position: 'absolute',
      left: 1,
      top: 1,
      width: 12,
      height: 10.2427,
    });

    const icon = iconAspect.props.children;
    expect(icon.props).toMatchObject({
      name: 'favoriteHeartSmall',
      width: 13,
      height: 11.2427,
      color: BLACK_SCALE.B900,
      fill: expect.any(String),
      strokeWidth: 1,
    });
    expect(StyleSheet.flatten(icon.props.style)).toMatchObject({
      position: 'absolute',
      left: -0.5,
      top: -0.5,
    });
  });
});

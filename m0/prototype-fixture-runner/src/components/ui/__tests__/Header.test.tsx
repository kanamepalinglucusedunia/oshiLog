import { render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { Header } from '../Header';

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: MockView } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    Ionicons: (props: { name: string; size: number }) =>
      React.createElement(MockView, { testID: `header-icon-${props.name}`, ...props }),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

describe('Header', () => {
  it('renders the shared detail-header geometry and typography', async () => {
    await render(
      <Header
        variant="detail"
        testID="detail-header"
        title="Trip Details"
        right={<View accessibilityLabel="Detail action" />}
      />,
    );

    expect(StyleSheet.flatten(screen.getByTestId('detail-header').props.style)).toEqual(expect.objectContaining({
      height: 46,
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    }));
    expect(StyleSheet.flatten(screen.getByText('Trip Details').props.style)).toEqual(expect.objectContaining({
      fontFamily: 'Nunito-SemiBold',
      fontSize: 24,
      lineHeight: 30,
    }));
    expect(screen.getByTestId('header-icon-arrow-back').props.size).toBe(24);
    expect(screen.getByLabelText('Detail action')).toBeTruthy();
  });
});

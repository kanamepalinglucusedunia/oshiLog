import { render } from '@testing-library/react-native';
import { Divider } from '@/components/ui/Divider';
import { DIVIDER_THICKNESS, DIVIDER_OPACITY } from '@/design-system/theme';

describe('Divider', () => {
  it('renders horizontal major divider with default 1px thickness and 100% opacity', async () => {
    const { getByTestId } = await render(<Divider testID="test-divider" />);
    const divider = getByTestId('test-divider');
    expect(divider.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          height: DIVIDER_THICKNESS.major,
          width: '100%',
          opacity: DIVIDER_OPACITY.major,
        }),
      ]),
    );
  });

  it('renders horizontal inner divider with 0.5px thickness and 15% opacity', async () => {
    const { getByTestId } = await render(<Divider testID="test-divider" variant="inner" />);
    const divider = getByTestId('test-divider');
    expect(divider.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          height: DIVIDER_THICKNESS.inner,
          width: '100%',
          opacity: DIVIDER_OPACITY.inner,
        }),
      ]),
    );
  });

  it('renders vertical divider with 1px thickness and no default height limit', async () => {
    const { getByTestId } = await render(<Divider testID="test-divider" orientation="vertical" />);
    const divider = getByTestId('test-divider');
    expect(divider.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: DIVIDER_THICKNESS.major,
          height: undefined,
          opacity: DIVIDER_OPACITY.major,
        }),
      ]),
    );
  });

  it('renders vertical inner divider with 0.5px thickness and custom length', async () => {
    const { getByTestId } = await render(
      <Divider testID="test-divider" orientation="vertical" variant="inner" length={14} />,
    );
    const divider = getByTestId('test-divider');
    expect(divider.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: DIVIDER_THICKNESS.inner,
          height: 14,
          opacity: DIVIDER_OPACITY.inner,
        }),
      ]),
    );
  });

  it('supports custom color, custom length, and style overrides', async () => {
    const { getByTestId } = await render(
      <Divider
        testID="test-divider"
        color="#7F6EB5"
        length={111}
        opacity={0.8}
        style={{ marginTop: 8 }}
      />,
    );
    const divider = getByTestId('test-divider');
    expect(divider.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: '#7F6EB5',
          width: 111,
          opacity: 0.8,
        }),
        expect.objectContaining({
          marginTop: 8,
        }),
      ]),
    );
  });

  it('renders the Figma dashed line with a round 10px dash pattern', async () => {
    const { getByTestId } = await render(
      <Divider testID="test-divider" lineStyle="dashed" color="#000000" />,
    );

    const divider = getByTestId('test-divider');
    expect(divider.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          height: DIVIDER_THICKNESS.major,
          width: '100%',
          backgroundColor: 'transparent',
        }),
      ]),
    );

    const line = getByTestId('test-divider-line');
    expect(line.props.stroke).toBeTruthy();
    expect(line.props.strokeDasharray).toEqual([10, 10]);
    expect(line.props.strokeLinecap).toBe(1);
  });
});

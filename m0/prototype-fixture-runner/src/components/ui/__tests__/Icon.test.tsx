import { render } from '@testing-library/react-native';
import { Icon } from '@/components/ui/Icon';

describe('Icon', () => {
  it('renders every icon name without crashing', async () => {
    const names = [
      'globe', 'calendar', 'camera', 'cameraPlus', 'palette', 'star', 'user',
      'plane', 'home', 'buildingOffice', 'userGroup', 'heart', 'locationMarker',
      'bottle', 'ticket', 'imagePlus', 'chevronUp', 'chevronDown', 'chevronRight', 'chevronLeft', 'x', 'plus',
      'minus', 'xCircle', 'plusCircle', 'sort', 'back', 'arrowDown', 'arrowUp', 'filter', 'search',
      'edit', 'settings',
    ];
    for (const name of names) {
      const { toJSON } = await render(<Icon name={name as never} />);
      const json = toJSON();
      expect(json).not.toBeNull();
      expect(json!.children.length).toBeGreaterThan(0);
    }
  });

  it('applies size override and matches icon definition viewBox', async () => {
    const { toJSON } = await render(<Icon name="home" size={32} />);
    const json = toJSON();
    expect(json!.props.width).toBe(32);
    expect(json!.props.height).toBe(32);
    expect(json!.props.vbWidth).toBe(25);
    expect(json!.props.vbHeight).toBe(25);
    expect(json!.children.length).toBeGreaterThan(0);
  });

  it('locks aspect ratio with height as sizing driver for camera icon (28x25)', async () => {
    const { toJSON } = await render(<Icon name="camera" height={25} />);
    const json = toJSON();
    expect(json!.props.height).toBe(25);
    expect(json!.props.width).toBe(28);
    expect(json!.props.vbWidth).toBe(28);
    expect(json!.props.vbHeight).toBe(25);
  });

  it('calculates proportional width when size is passed', async () => {
    const { toJSON } = await render(<Icon name="camera" size={50} />);
    const json = toJSON();
    expect(json!.props.height).toBe(50);
    expect(json!.props.width).toBe(56);
  });

  it('keeps the minus icon square so it cannot overflow compact controls', async () => {
    const { toJSON } = await render(<Icon name="minus" size={12} />);
    const json = toJSON();

    expect(json!.props.width).toBe(12);
    expect(json!.props.height).toBe(12);
    expect(json!.props.vbWidth).toBe(25);
    expect(json!.props.vbHeight).toBe(25);
  });

  it('locks aspect ratio with height as sizing driver for cameraPlus icon (26.3333x25)', async () => {
    const { toJSON } = await render(<Icon name="cameraPlus" height={25} />);
    const json = toJSON();
    expect(json!.props.height).toBe(25);
    expect(json!.props.width).toBeCloseTo(26.3333, 3);
    expect(json!.props.vbWidth).toBe(26.3333);
    expect(json!.props.vbHeight).toBe(25);
  });
});

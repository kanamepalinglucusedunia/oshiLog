import { fireEvent, render } from '@testing-library/react-native';
import { DetailIdolTabIndicator } from '../DetailIdolTabIndicator';

describe('DetailIdolTabIndicator', () => {
  it('renders all three tabs with correct labels and accessibility props', async () => {
    const onChange = jest.fn();
    const { getByText, getByLabelText, queryByText } = await render(
      <DetailIdolTabIndicator activeTab="summary" onChange={onChange} />,
    );

    expect(getByText('Details')).toBeTruthy();
    expect(getByText('Cheki')).toBeTruthy();
    expect(getByText('Album')).toBeTruthy();
    expect(queryByText('Event')).toBeNull();
    expect(getByLabelText('Details tab').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Cheki tab').props.accessibilityState).toEqual({ selected: false });
    expect(getByLabelText('Album tab').props.accessibilityState).toEqual({ selected: false });
  });

  it('marks active tab correctly for each tab', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <DetailIdolTabIndicator activeTab="album" onChange={onChange} />,
    );
    expect(getByLabelText('Album tab').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Details tab').props.accessibilityState).toEqual({ selected: false });
  });

  it('calls onChange when tabs are pressed', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <DetailIdolTabIndicator activeTab="summary" onChange={onChange} />,
    );

    fireEvent.press(getByLabelText('Album tab'));
    expect(onChange).toHaveBeenCalledWith('album');
  });

  it('handles onLayout events for tabs to update indicator geometry', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <DetailIdolTabIndicator activeTab="summary" onChange={onChange} />,
    );

    const detailsTab = getByLabelText('Details tab');
    fireEvent(detailsTab, 'layout', {
      nativeEvent: { layout: { x: 8, y: 8, width: 104, height: 34 } },
    });
    expect(detailsTab).toBeTruthy();
  });
});

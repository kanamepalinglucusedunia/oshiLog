import { fireEvent, render, screen } from '@testing-library/react-native';
import { WheelFilterButton } from '@/components/ui/WheelFilterButton';

describe('WheelFilterButton', () => {
  it('uses the Album-style wheel modal and applies the draft value on Done', async () => {
    const onChange = jest.fn();
    await render(
      <WheelFilterButton
        label="Month"
        value="all"
        displayValue="All"
        options={[
          { value: 'all', label: 'All Months' },
          { value: '08', label: 'August' },
        ]}
        onChange={onChange}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Month filter: All'));
    expect(screen.getByText('Select Month')).toBeTruthy();

    await fireEvent.press(screen.getByText('August'));
    await fireEvent.press(screen.getByText('Done'));

    expect(onChange).toHaveBeenCalledWith('08');
  });
});

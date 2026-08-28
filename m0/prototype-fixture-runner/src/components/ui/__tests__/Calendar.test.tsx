import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BLACK_SCALE, DEFAULT_PRIMARY_SCALE } from '@/design-system/colors';
import { Calendar } from '../Calendar';

describe('Calendar', () => {
  it('renders month name, weekdays, and cell dates correctly', async () => {
    await render(
      <Calendar
        year={2025}
        month={5}
        today="2025-05-15"
        selectedDate="2025-05-10"
        markedDates={['2025-05-12']}
      />,
    );

    expect(screen.getByText('May 2025')).toBeTruthy();
    expect(screen.getByText('SUN')).toBeTruthy();
    expect(screen.getByText('MON')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('triggers onSelectDate when a day is pressed', async () => {
    const onSelectDate = jest.fn();
    await render(
      <Calendar
        year={2025}
        month={5}
        today="2025-05-15"
        onSelectDate={onSelectDate}
      />,
    );

    await fireEvent.press(screen.getByLabelText('2025-05-20'));
    expect(onSelectDate).toHaveBeenCalledWith('2025-05-20');
  });

  it('triggers onChangeMonth when month navigation chevrons are pressed', async () => {
    const onChangeMonth = jest.fn();
    await render(
      <Calendar
        year={2025}
        month={5}
        onChangeMonth={onChangeMonth}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Next month'));
    expect(onChangeMonth).toHaveBeenNthCalledWith(1, 2025, 6);

    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(onChangeMonth).toHaveBeenNthCalledWith(2, 2025, 5);
  });

  it('opens the month and year picker when the month header is pressed', async () => {
    await render(<Calendar year={2026} month={8} />);

    await fireEvent.press(screen.getByLabelText('Choose month and year, August 2026'));

    expect(screen.getByLabelText('Choose year 2026')).toBeTruthy();
    expect(screen.getByLabelText('Choose August 2026')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByLabelText('Choose August 2026').props.style)).toEqual(expect.objectContaining({
      backgroundColor: DEFAULT_PRIMARY_SCALE.P50,
      borderColor: DEFAULT_PRIMARY_SCALE.P300,
      borderWidth: 1,
    }));
  });

  it('applies a selected year and month, then returns to the day calendar', async () => {
    const onChangeMonth = jest.fn();
    await render(
      <Calendar
        year={2026}
        month={8}
        onChangeMonth={onChangeMonth}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Choose month and year, August 2026'));
    await fireEvent.press(screen.getByLabelText('Choose year 2026'));
    await fireEvent.press(screen.getByLabelText('Choose year 2030'));
    await fireEvent.press(screen.getByLabelText('Choose March 2030'));

    expect(onChangeMonth).toHaveBeenCalledWith(2030, 3);
    expect(screen.getByText('March 2030')).toBeTruthy();
    expect(screen.queryByLabelText('Choose March 2030')).toBeNull();
  });

  it('pages the year choices for a larger year jump', async () => {
    await render(<Calendar year={2026} month={8} />);

    await fireEvent.press(screen.getByLabelText('Choose month and year, August 2026'));
    await fireEvent.press(screen.getByLabelText('Choose year 2026'));
    await fireEvent.press(screen.getByLabelText('Next year range'));

    expect(screen.getByLabelText('Choose year 2032')).toBeTruthy();
  });

  it('renders a selected date as a circular accent fill with readable text', async () => {
    await render(<Calendar year={2026} month={8} selectedDate="2026-08-04" />);

    const selectedCircleStyle = StyleSheet.flatten(screen.getByTestId('calendar-selected-date').props.style);
    const selectedTextStyle = StyleSheet.flatten(screen.getByText('4').props.style);

    expect(selectedCircleStyle).toEqual(expect.objectContaining({
      backgroundColor: DEFAULT_PRIMARY_SCALE.P300,
      borderRadius: 9999,
    }));
    expect(selectedTextStyle.color).toBe(BLACK_SCALE.B0);
  });
});

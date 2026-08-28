import { fireEvent, render } from '@testing-library/react-native';
import { Counter } from '../Counter';

describe('Counter component', () => {
  it('renders Summary variant with 1 currency correctly', async () => {
    const { getByText } = await render(
      <Counter
        eventCount={20}
        chekiCount={400}
        totals={{ JPY: 2000, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    expect(getByText('20')).toBeTruthy();
    expect(getByText('Event')).toBeTruthy();
    expect(getByText('400')).toBeTruthy();
    expect(getByText('Cheki')).toBeTruthy();
    expect(getByText('JPY')).toBeTruthy();
    expect(getByText('¥ 2K')).toBeTruthy();
    expect(getByText('Spending')).toBeTruthy();
  });

  it('renders Summary variant with multiple currencies separated by divider', async () => {
    const { getByText } = await render(
      <Counter
        eventCount={20}
        chekiCount={400}
        totals={{ JPY: 2000, IDR: 2000, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    expect(getByText('20')).toBeTruthy();
    expect(getByText('Event')).toBeTruthy();
    expect(getByText('400')).toBeTruthy();
    expect(getByText('Cheki')).toBeTruthy();
    expect(getByText('JPY')).toBeTruthy();
    expect(getByText('¥ 2K')).toBeTruthy();
    expect(getByText('IDR')).toBeTruthy();
    expect(getByText('Rp 2K')).toBeTruthy();
    expect(getByText('Spending')).toBeTruthy();
  });

  it('renders Cheki Detail variant with full currency formatting', async () => {
    const { queryByText, getByText } = await render(
      <Counter
        chekiOnly
        chekiCount={400}
        totals={{ JPY: 2000, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    expect(queryByText('Event')).toBeNull();
    expect(getByText('400')).toBeTruthy();
    expect(getByText('Cheki')).toBeTruthy();
    expect(getByText('JPY')).toBeTruthy();
    expect(getByText('¥ 2,000')).toBeTruthy();
    expect(getByText('Spending')).toBeTruthy();
  });

  it('renders Cheki Detail with multiple currencies in full format', async () => {
    const { getByText } = await render(
      <Counter
        chekiOnly
        chekiCount={400}
        totals={{ JPY: 2000, IDR: 2000, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    expect(getByText('400')).toBeTruthy();
    expect(getByText('Cheki')).toBeTruthy();
    expect(getByText('JPY')).toBeTruthy();
    expect(getByText('¥ 2,000')).toBeTruthy();
    expect(getByText('IDR')).toBeTruthy();
    expect(getByText('Rp 2,000')).toBeTruthy();
    expect(getByText('Spending')).toBeTruthy();
  });

  it('keeps currency totals visible while toggling the downstream spending details', async () => {
    const onToggleSpendingDetails = jest.fn();
    const counter = (
      <Counter
        layout="stacked"
        metrics={[
          { label: 'Cheki', value: 400 },
          { label: 'Cheki', value: 400 },
          { label: 'Cheki', value: 400 },
        ]}
        totals={{ JPY: 20000, IDR: 10000000, MYR: 0, KRW: 0, THB: 0 }}
        compactSpending={false}
        spendingDetailsExpanded={false}
        onToggleSpendingDetails={onToggleSpendingDetails}
        testID="trip-summary"
      />
    );
    const { getAllByText, getByLabelText, getByTestId, getByText, rerender } = await render(counter);

    expect(getAllByText('400').length).toBe(3);
    expect(getAllByText('Cheki').length).toBe(3);
    expect(getByText('Total Spending')).toBeTruthy();
    expect(getByText('JPY')).toBeTruthy();
    expect(getByText('¥ 20,000')).toBeTruthy();
    expect(getByText('IDR')).toBeTruthy();
    expect(getByText('Rp 10,000,000')).toBeTruthy();
    expect(getByLabelText('Chevron down')).toBeTruthy();

    await fireEvent.press(getByTestId('trip-summary-spending-toggle'));

    expect(onToggleSpendingDetails).toHaveBeenCalledTimes(1);
    await rerender(
      <Counter
        layout="stacked"
        metrics={[
          { label: 'Cheki', value: 400 },
          { label: 'Cheki', value: 400 },
          { label: 'Cheki', value: 400 },
        ]}
        totals={{ JPY: 20000, IDR: 10000000, MYR: 0, KRW: 0, THB: 0 }}
        compactSpending={false}
        spendingDetailsExpanded
        onToggleSpendingDetails={onToggleSpendingDetails}
        testID="trip-summary"
      />,
    );
    expect(getByLabelText('Chevron up')).toBeTruthy();
  });

  it('renders zero spending fallback gracefully', async () => {
    const { getAllByText, getByText } = await render(
      <Counter
        eventCount={0}
        chekiCount={0}
        totals={{ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    expect(getAllByText('0').length).toBe(2);
    expect(getByText('Event')).toBeTruthy();
    expect(getByText('Cheki')).toBeTruthy();
    expect(getByText('JPY')).toBeTruthy();
    expect(getByText('¥ 0')).toBeTruthy();
    expect(getByText('Spending')).toBeTruthy();
  });
});

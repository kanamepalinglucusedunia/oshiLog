import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActivityBreakdownCard } from '../ActivityBreakdownCard';

describe('ActivityBreakdownCard', () => {
  const spendingBreakdown = {
    JPY: [
      { key: 'ticket', label: 'Ticket', value: 7000 },
      { key: 'cheki', label: 'Cheki', value: 5000 },
    ],
  };

  it('starts with spending pie chart and can switch to cheki and bar modes', async () => {
    await render(
      <ActivityBreakdownCard
        spendingBreakdown={spendingBreakdown}
        chekiBreakdown={[
          { key: 'idol-a', label: 'Airi', value: 4 },
          { key: 'idol-b', label: 'Hinata', value: 2 },
        ]}
      />,
    );

    expect(screen.getByText('Spending breakdown')).toBeTruthy();
    expect(screen.getByTestId('activity-chart-pie')).toBeTruthy();
    expect(screen.getByText('Ticket')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Cheki breakdown'));
    expect(screen.getByText('Cheki breakdown')).toBeTruthy();
    expect(screen.getByText('Airi')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Bar chart'));
    expect(screen.getByTestId('activity-chart-bar')).toBeTruthy();
    expect(screen.queryByTestId('activity-chart-pie')).toBeNull();
  });

  it('shows currency choices when spending has multiple currencies', async () => {
    await render(
      <ActivityBreakdownCard
        spendingBreakdown={{
          JPY: [{ key: 'ticket', label: 'Ticket', value: 7000 }],
          IDR: [{ key: 'cheki', label: 'Cheki', value: 50_000 }],
        }}
        chekiBreakdown={[]}
      />,
    );

    expect(screen.getByText('JPY')).toBeTruthy();
    expect(screen.getByText('IDR')).toBeTruthy();
    await fireEvent.press(screen.getByText('IDR'));
    expect(screen.getAllByText('Rp 50,000').length).toBeGreaterThan(0);
  });

  it('renders an empty message when the selected metric has no data', async () => {
    await render(<ActivityBreakdownCard spendingBreakdown={{}} chekiBreakdown={[]} />);

    expect(screen.getByText('No breakdown available for this period.')).toBeTruthy();
  });

  it('collapses long cheki breakdowns into top five and Others', async () => {
    await render(
      <ActivityBreakdownCard
        spendingBreakdown={{}}
        chekiBreakdown={['A', 'B', 'C', 'D', 'E', 'F'].map((label, index) => ({
          key: label,
          label,
          value: 6 - index,
        }))}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Cheki breakdown'));
    expect(screen.getByText('Others')).toBeTruthy();
    expect(screen.queryByText('F')).toBeNull();
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { EventDetailCard } from '../EventDetailCard';

const jpyTotals = { JPY: 20_000, IDR: 0, MYR: 0, KRW: 0, THB: 0 } as const;

describe('EventDetailCard', () => {
  it('renders the date header, dashed ticket divider, spend rows, and total in one card', async () => {
    await render(
      <EventDetailCard
        title="Idol Cream Soda"
        eventDate="2025-05-22"
        locationLabel="Reny Limited | JP | Nagoya"
        ticketCurrency="JPY"
        ticketAmount={1_000}
        drinkCurrency="JPY"
        drinkAmount={7_000}
        chekiTotals={jpyTotals}
        totals={{ ...jpyTotals, JPY: 28_000 }}
      />,
    );

    const card = screen.getByTestId('event-summary-card');
    expect(within(card).getByText('22')).toBeTruthy();
    expect(within(card).getByText('May')).toBeTruthy();
    expect(within(card).getByText('2025')).toBeTruthy();
    expect(within(card).getByText('Idol Cream Soda')).toBeTruthy();
    expect(within(card).getByText('Reny Limited | JP | Nagoya')).toBeTruthy();
    expect(within(card).getByText('Spend')).toBeTruthy();
    expect(within(card).getByText('Ticket Price')).toBeTruthy();
    expect(within(card).getByText('¥ 1,000')).toBeTruthy();
    expect(within(card).getByText('Drink')).toBeTruthy();
    expect(within(card).getByText('¥ 7,000')).toBeTruthy();
    expect(within(card).getByText('Total Cheki')).toBeTruthy();
    expect(within(card).getByText('¥ 20,000')).toBeTruthy();
    expect(within(card).getByText('Total ¥ 28,000')).toBeTruthy();
    expect(screen.getByTestId('event-summary-ticket-divider-svg')).toBeTruthy();
    expect(screen.getByTestId('event-summary-ticket-divider')).toBeTruthy();
    expect(screen.getByTestId('event-summary-card-frame')).toBeTruthy();
    expect(screen.queryByTestId('event-summary-ticket-divider-left-arc')).toBeNull();
    expect(screen.queryByTestId('event-summary-ticket-divider-right-arc')).toBeNull();
    expect(screen.getByTestId('event-summary-ticket-divider-dashes').props.strokeWidth).toBe(1);
    expect(screen.queryByTestId('event-summary-top-border')).toBeNull();
    expect(screen.queryByTestId('event-summary-bottom-border')).toBeNull();
    const initialSvgStyle = StyleSheet.flatten(screen.getByTestId('event-summary-ticket-divider-svg').props.style);
    expect(initialSvgStyle).toEqual(expect.objectContaining({ left: 0, right: 0, top: 0, bottom: 0 }));
  });

  it('uses the surface tokens and hides every zero-value spending row', async () => {
    await render(
      <EventDetailCard
        title="No Spend Live"
        eventDate="2025-05-22"
        locationLabel="JP"
        ticketCurrency={null}
        ticketAmount={null}
        drinkCurrency={null}
        drinkAmount={null}
        chekiTotals={{ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
        totals={{ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    const card = screen.getByTestId('event-summary-card');
    const cardStyle = StyleSheet.flatten(card.props.style);
    expect(cardStyle.borderWidth).toBe(0);
    expect(cardStyle.borderRadius).toBe(16);
    expect(cardStyle.padding).toBe(0);
    expect(cardStyle.overflow).toBe('visible');
    expect(screen.getByTestId('event-summary-card-frame').props.strokeWidth).toBe(1);
    expect(screen.queryByText('Ticket Price')).toBeNull();
    expect(screen.queryByText('Drink')).toBeNull();
    expect(screen.queryByText('Total Cheki')).toBeNull();
    expect(screen.getByText('Total —')).toBeTruthy();
  });

  it('shows only positive spending rows', async () => {
    await render(
      <EventDetailCard
        title="No Drink Live"
        eventDate="2025-05-22"
        locationLabel="JP"
        ticketCurrency="JPY"
        ticketAmount={1_000}
        drinkCurrency={null}
        drinkAmount={null}
        chekiTotals={{ JPY: 20_000, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
        totals={{ JPY: 21_000, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    expect(screen.getByText('Ticket Price')).toBeTruthy();
    expect(screen.getByText('Total Cheki')).toBeTruthy();
    expect(screen.queryByText('Drink')).toBeNull();
  });

  it('keeps the optional event location action working', async () => {
    const onPressLocation = jest.fn();
    await render(
      <EventDetailCard
        title="Linked Venue Live"
        eventDate="2025-05-22"
        locationLabel="Reny Limited"
        onPressLocation={onPressLocation}
        ticketCurrency={null}
        ticketAmount={0}
        drinkCurrency={null}
        drinkAmount={0}
        chekiTotals={{ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
        totals={{ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Event location: Reny Limited' }));
    expect(onPressLocation).toHaveBeenCalledTimes(1);
  });

  it('builds one continuous measured frame through both ticket notches', async () => {
    await render(
      <EventDetailCard
        title="Measured Card"
        eventDate="2025-05-22"
        locationLabel="JP"
        ticketCurrency={null}
        ticketAmount={null}
        drinkCurrency={null}
        drinkAmount={null}
        chekiTotals={{ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
        totals={{ JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 }}
      />,
    );

    await fireEvent(screen.getByTestId('event-summary-card'), 'layout', {
      nativeEvent: { layout: { width: 398, height: 236, x: 0, y: 0 } },
    });
    await fireEvent(screen.getByTestId('event-summary-ticket-divider'), 'layout', {
      nativeEvent: { layout: { width: 398, height: 16, x: 0, y: 76 } },
    });

    expect(screen.getByTestId('event-summary-ticket-divider-svg').props.width).toBe(398);
    expect(screen.getByTestId('event-summary-ticket-divider-svg').props.height).toBe(236);
    expect(screen.getByTestId('event-summary-ticket-divider-dashes').props.x1).toBe(9.5);
    expect(screen.getByTestId('event-summary-ticket-divider-dashes').props.x2).toBe(388.5);
    const framePath = screen.getByTestId('event-summary-card-frame').props.d as string;
    expect(framePath).toContain('V75');
    expect(framePath).toContain('V93');
    expect(framePath.match(/C/g)).toHaveLength(4);
  });
});

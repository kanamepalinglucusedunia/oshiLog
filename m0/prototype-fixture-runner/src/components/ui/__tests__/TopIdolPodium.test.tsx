import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TopIdolRow } from '@/services/dashboard';
import { TopIdolPodium } from '../TopIdolPodium';

function idol(overrides: Partial<TopIdolRow> = {}): TopIdolRow {
  return {
    idolId: 'idol-a',
    idolName: 'Airi',
    photoMediaId: null,
    groupName: null,
    status: 'active',
    isFavorite: false,
    chekiCount: 4,
    eventCount: 2,
    spendTotals: { JPY: 4000, IDR: 0, MYR: 0, KRW: 0, THB: 0 },
    rankAmount: 4000,
    rankCurrency: 'JPY',
    ...overrides,
  };
}

describe('TopIdolPodium', () => {
  it('renders the top three in 2-1-3 podium order', async () => {
    await render(
      <TopIdolPodium
        idols={[
          idol(),
          idol({ idolId: 'idol-b', idolName: 'Hinata', chekiCount: 3 }),
          idol({ idolId: 'idol-c', idolName: 'Mina', chekiCount: 1 }),
        ]}
      />,
    );

    expect(screen.getByTestId('top-idol-rank-1')).toBeTruthy();
    expect(screen.getByTestId('top-idol-rank-2')).toBeTruthy();
    expect(screen.getByTestId('top-idol-rank-3')).toBeTruthy();
    expect(screen.getByText('Airi')).toBeTruthy();
    expect(screen.getByText('Hinata')).toBeTruthy();
    expect(screen.getByText('Mina')).toBeTruthy();
  });

  it('opens the selected idol detail and omits unavailable ranks', async () => {
    const onPress = jest.fn();
    await render(<TopIdolPodium idols={[idol()]} onIdolPress={onPress} />);

    expect(screen.getByTestId('top-idol-rank-1')).toBeTruthy();
    expect(screen.queryByTestId('top-idol-rank-2')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Rank 1, Airi, 4 Cheki'));
    expect(onPress).toHaveBeenCalledWith('idol-a');
  });
});

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  FilterChoiceChip,
  FilterSection,
  FilterSortBottomSheet,
} from '@/components/ui/FilterSortBottomSheet';

describe('FilterSortBottomSheet', () => {
  it('renders sort and filter choices and exposes reset/apply actions', async () => {
    const onSortChange = jest.fn();
    const onReset = jest.fn();
    const onApply = jest.fn();

    function Harness() {
      const [sort, setSort] = useState('name-asc');
      return (
        <FilterSortBottomSheet
          visible
          title="Filter & Sort Idols"
          sortOptions={[
            { label: 'Name', ascendingValue: 'name-asc', descendingValue: 'name-desc' },
            { label: 'Events', ascendingValue: 'events-asc', descendingValue: 'events-desc' },
          ]}
          selectedSort={sort}
          onSortChange={(value) => {
            setSort(value);
            onSortChange(value);
          }}
          onReset={onReset}
          onApply={onApply}
          onClose={jest.fn()}
          resultCount={12}
        >
          <FilterSection title="Status">
            <FilterChoiceChip label="Active" selected onPress={jest.fn()} />
            <FilterChoiceChip label="Inactive" selected={false} onPress={jest.fn()} />
          </FilterSection>
        </FilterSortBottomSheet>
      );
    }
    await render(<Harness />);

    expect(screen.getByText('Filter & Sort Idols')).toBeTruthy();
    expect(screen.getByText('Sort by')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Name' })).toBeNull();

    await fireEvent.press(screen.getByLabelText('Sort by'));
    await fireEvent.press(screen.getByLabelText('Sort by Events'));
    expect(onSortChange).toHaveBeenLastCalledWith('events-asc');
    await fireEvent.press(screen.getByLabelText('Sort ascending'));
    expect(onSortChange).toHaveBeenLastCalledWith('events-desc');
    expect(screen.getByTestId('sort-direction-descending')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reset'));
    await fireEvent.press(screen.getByText('Show 12 results'));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('announces the selected state of sort rows and filter chips', async () => {
    await render(
      <FilterSortBottomSheet
        visible
        title="Filter & Sort"
        sortOptions={[{ label: 'Name', ascendingValue: 'name-asc', descendingValue: 'name-desc' }]}
        selectedSort="name-asc"
        onSortChange={jest.fn()}
        onReset={jest.fn()}
        onApply={jest.fn()}
        onClose={jest.fn()}
        resultCount={1}
      >
        <FilterChoiceChip label="Favorite" selected multiple onPress={jest.fn()} />
      </FilterSortBottomSheet>,
    );

    expect(screen.getByLabelText('Sort by').props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(screen.getByLabelText('Sort ascending')).toBeTruthy();
    expect(screen.getByLabelText('Favorite').props.accessibilityState).toEqual({ checked: true });
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DateField } from '@/components/ui/DateField';
import { Dropdown } from '@/components/ui/Dropdown';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SCREEN_KEYBOARD_AVOIDING_BEHAVIOR, Screen } from '@/components/ui/Screen';
import { buildTheme } from '@/design-system/resolveTheme';

type JsonNode = {
  props?: { style?: unknown };
  children?: JsonNode[] | string | null;
};

function findNode(node: JsonNode | null, predicate: (style: Record<string, unknown>) => boolean): JsonNode | null {
  if (!node || typeof node !== 'object') return null;
  const style = StyleSheet.flatten(node.props?.style) as Record<string, unknown> | undefined;
  if (style && predicate(style)) return node;
  if (!Array.isArray(node.children)) return null;
  for (const child of node.children) {
    const match = findNode(child, predicate);
    if (match) return match;
  }
  return null;
}

const theme = buildTheme('outline', '#7F6EB5', 'light');

describe('form field visual system', () => {
  it('fills the viewport for non-scroll screens so nested lists are not clipped', async () => {
    await render(
      <Screen scroll={false} contentStyle={{ padding: 0 }} testID="non-scroll-screen-content">
        <View />
      </Screen>,
    );

    expect(StyleSheet.flatten(screen.getByTestId('non-scroll-screen-content').props.style)).toEqual(
      expect.objectContaining({ flex: 1, padding: 0 }),
    );
  });

  it('keeps the form layout fixed while the keyboard overlays the viewport', async () => {
    const view = await render(
      <Screen scroll>
        <Field label="Name" placeholder="e.g. Name" />
      </Screen>,
    );

    expect(SCREEN_KEYBOARD_AVOIDING_BEHAVIOR).toBeUndefined();
    expect(view.root?.queryAll((node) => node.props.behavior === 'height')).toHaveLength(0);
    const scrollView = view.root?.queryAll((node) => node.props.scrollsChildToFocus !== undefined)[0];
    expect(scrollView?.props.scrollsChildToFocus).toBe(true);
    expect(scrollView?.props.keyboardDismissMode).toBe(
      Platform.OS === 'ios' ? 'interactive' : 'on-drag',
    );
  });

  it('dismisses the keyboard before shared controls run their actions', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    try {
      const onButtonPress = jest.fn();
      const onChipPress = jest.fn();
      const onToggle = jest.fn();
      const view = await render(
        <>
          <Button label="Save" onPress={onButtonPress} />
          <Chip label="Japan" onPress={onChipPress} />
          <Dropdown
            value={null}
            placeholder="Country"
            leadingIcon="globe"
            open={false}
            onToggle={onToggle}
            accessibilityLabel="Country"
          >
            <></>
          </Dropdown>
        </>,
      );

      await fireEvent.press(view.getByLabelText('Save'));
      await fireEvent.press(view.getByText('Japan'));
      await fireEvent.press(view.getByLabelText('Country'));

      expect(dismiss).toHaveBeenCalledTimes(3);
      expect(onButtonPress).toHaveBeenCalledTimes(1);
      expect(onChipPress).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledTimes(1);
    } finally {
      dismiss.mockRestore();
    }
  });

  it('keeps dropdown option scrolling inside the dropdown on Android', async () => {
    const dropdown = await render(
      <Dropdown
        value={null}
        placeholder="Country"
        open
        onToggle={jest.fn()}
        accessibilityLabel="Country"
      >
        <></>
      </Dropdown>,
    );

    const list = dropdown.root?.queryAll((node) => node.props.nestedScrollEnabled !== undefined)[0];
    expect(list?.props.nestedScrollEnabled).toBe(true);
    expect(list?.props.scrollEnabled).toBe(true);
    expect(list?.props.onMoveShouldSetResponderCapture).toEqual(expect.any(Function));
    expect(StyleSheet.flatten(list?.props.style)).toMatchObject({
      maxHeight: 264,
    });
  });

  it('reverses the trigger corners when a dropdown opens upward', async () => {
    const dropdown = await render(
      <Dropdown
        value={null}
        placeholder="Country"
        open
        openDirection="up"
        onToggle={jest.fn()}
        accessibilityLabel="Country"
      >
        <></>
      </Dropdown>,
    );

    expect(StyleSheet.flatten(dropdown.getByLabelText('Country').props.style)).toMatchObject({
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
    });
  });

  it('dismisses the keyboard when a popup opens or closes', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    try {
      const onClose = jest.fn();
      const view = await render(
        <Modal visible onClose={onClose} title="Choose one">
          <Button label="Option" onPress={jest.fn()} />
        </Modal>,
      );

      expect(dismiss).toHaveBeenCalledTimes(1);
      await fireEvent.press(view.getByLabelText('Close'));
      expect(dismiss).toHaveBeenCalledTimes(2);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      dismiss.mockRestore();
    }
  });

  it('renders a responsive regular field with a persistent label and Figma shell', async () => {
    const { toJSON } = await render(<Field label="Name *" placeholder="e.g. Name" />);

    const label = screen.getByText('Name *');
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({
      fontFamily: 'Nunito-Regular',
      fontSize: 12,
      lineHeight: 14,
    });

    const box = findNode(toJSON() as JsonNode, (style) => style.height === 36 && style.borderRadius === 16);
    expect(box).toBeTruthy();
    expect(StyleSheet.flatten(box?.props?.style)).toMatchObject({
      paddingLeft: 8,
      paddingRight: 8,
      borderWidth: theme.surface.borderWidth,
      backgroundColor: theme.color.surface,
    });
  });

  it('uses the active placeholder color on focus and lets errors override the border', async () => {
    const { rerender, toJSON } = await render(<Field label="Name" placeholder="e.g. Name" />);
    const input = screen.getByPlaceholderText('e.g. Name');

    await fireEvent(input, 'focus');
    expect(screen.getByPlaceholderText('e.g. Name').props.placeholderTextColor).toBe(theme.color.accent);
    const focusedBox = findNode(toJSON() as JsonNode, (style) => style.height === 36 && style.borderRadius === 16);
    expect(StyleSheet.flatten(focusedBox?.props?.style)).toMatchObject({ borderColor: theme.color.accent });

    await rerender(<Field label="Name" placeholder="e.g. Name" error="Name is required" />);
    const errorBox = findNode(toJSON() as JsonNode, (style) => style.height === 36 && style.borderRadius === 16);
    expect(StyleSheet.flatten(errorBox?.props?.style)).toMatchObject({ borderColor: theme.color.danger });
  });

  it('uses muted styling for read-only fields and keeps multiline fields at the agreed minimum', async () => {
    const readOnly = await render(<Field label="Name" value="Read only" editable={false} />);
    expect(StyleSheet.flatten(screen.getByDisplayValue('Read only').props.style)).toMatchObject({ color: theme.color.textMuted });

    await readOnly.unmount();
    const { toJSON } = await render(<Field label="Notes" multiline placeholder="Write notes" />);
    const box = findNode(toJSON() as JsonNode, (style) => style.minHeight === 100);
    expect(box).toBeTruthy();
  });

  it('applies the same 36px shell to date and dropdown controls', async () => {
    const onDateChange = jest.fn();
    const onToggle = jest.fn();
    const date = await render(
      <DateField label="Date *" value="" onChange={onDateChange} placeholder="Pick a date" />,
    );
    expect(StyleSheet.flatten(date.getByLabelText('Date *').props.style)).toMatchObject({
      height: 36,
      borderRadius: 16,
      paddingRight: 8,
    });
    await fireEvent.press(date.getByLabelText('Date *'));
    expect(StyleSheet.flatten(date.getByLabelText('Date *').props.style)).toMatchObject({ borderColor: theme.color.accent });

    await date.unmount();
    const dropdown = await render(
      <Dropdown
        label="Country *"
        value={null}
        placeholder="Country"
        leadingIcon="globe"
        open={false}
        onToggle={onToggle}
        accessibilityLabel="Country *"
      >
        <></>
      </Dropdown>,
    );
    expect(dropdown.getByText('Country *')).toBeTruthy();
    expect(StyleSheet.flatten(dropdown.getByLabelText('Country *').props.style)).toMatchObject({
      height: 36,
      paddingRight: 16,
    });
  });

  it('renders the dropdown chevron at the Figma glyph size', async () => {
    const dropdown = await render(
      <Dropdown
        value={null}
        placeholder="Country"
        open={false}
        onToggle={jest.fn()}
        accessibilityLabel="Country"
      >
        <></>
      </Dropdown>,
    );

    const chevron = dropdown.root?.queryAll(
      (node) => node.props.vbWidth === 15 && node.props.vbHeight === 8,
    )[0];

    expect(chevron).toBeTruthy();
    expect(chevron?.props).toMatchObject({ width: 15, height: 8 });
  });

  it('keeps date and dropdown controls muted and inert when disabled', async () => {
    const onDateChange = jest.fn();
    const onToggle = jest.fn();
    const date = await render(
      <DateField label="Date" value="" onChange={onDateChange} disabled hint="Read-only date" />,
    );
    const dateButton = date.getByLabelText('Date');
    expect(dateButton.props.accessibilityState).toMatchObject({ disabled: true });
    expect(dateButton.props.onPress).toBeUndefined();
    expect(StyleSheet.flatten(dateButton.props.style)).toMatchObject({ borderColor: theme.color.borderLight });
    expect(StyleSheet.flatten(date.getByText('Read-only date').props.style)).toMatchObject({ color: theme.color.textMuted });

    await date.unmount();
    const dropdown = await render(
      <Dropdown
        label="Country"
        value={null}
        placeholder="Select country"
        leadingIcon="globe"
        open={false}
        disabled
        onToggle={onToggle}
        accessibilityLabel="Country"
        hint="Read-only country"
      >
        <></>
      </Dropdown>,
    );
    const dropdownButton = dropdown.getByLabelText('Country');
    expect(dropdownButton.props.accessibilityState).toMatchObject({ disabled: true });
    expect(dropdownButton.props.onPress).toBeUndefined();
    expect(StyleSheet.flatten(dropdownButton.props.style)).toMatchObject({ borderColor: theme.color.borderLight });
    expect(dropdown.getByText('Read-only country')).toBeTruthy();
  });
});

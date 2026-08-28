import { act, render } from '@testing-library/react-native';
import { Animated, Keyboard, Platform, Text, TextInput } from 'react-native';
import {
  BottomSheet,
  calculateKeyboardAvoidanceOffset,
  calculateSheetTop,
  resolveSheetViewportHeight,
  shouldCloseBottomSheet,
} from '@/components/ui/BottomSheet';

describe('BottomSheet keyboard positioning', () => {
  it('keeps the sheet in place while the focused input is above the keyboard', () => {
    expect(calculateKeyboardAvoidanceOffset({ top: 180, height: 40 }, 600)).toBe(0);
  });

  it('moves only far enough to reveal a focused input covered by the keyboard', () => {
    expect(calculateKeyboardAvoidanceOffset({ top: 560, height: 80 }, 600)).toBe(-48);
  });

  it('keeps the sheet top anchored to the full screen when the modal viewport shrinks', () => {
    expect(calculateSheetTop(1000, 900)).toBe(100);
    expect(calculateSheetTop(600, 900)).toBe(0);
    expect(resolveSheetViewportHeight(720, 1000)).toBe(720);
    expect(resolveSheetViewportHeight(0, 1000)).toBe(1000);
  });

  it('closes only after a meaningful downward drag', () => {
    expect(shouldCloseBottomSheet(140, 0)).toBe(true);
    expect(shouldCloseBottomSheet(30, 1.3)).toBe(true);
    expect(shouldCloseBottomSheet(30, 0.2)).toBe(false);
  });

  it('exposes a drag handle and a dedicated sticky footer region', async () => {
    const view = await render(
      <BottomSheet visible onClose={jest.fn()} footer={<Text>Save</Text>}>
        <Text>Content</Text>
      </BottomSheet>,
    );

    expect(view.getByTestId('bottom-sheet-drag-handle')).toBeTruthy();
    expect(view.getByTestId('bottom-sheet-footer')).toBeTruthy();
  });

  it('uses the focused input layout when the keyboard reports a frame change', async () => {
    const keyboardListeners = new Map<string, (event: { duration: number; endCoordinates: { screenY: number } }) => void>();
    const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      keyboardListeners.set(eventName, listener as (event: { duration: number; endCoordinates: { screenY: number } }) => void);
      return { remove: jest.fn() } as never;
    });
    const measureInWindow = jest.fn((callback: (left: number, top: number, width: number, height: number) => void) => {
      callback(0, 560, 120, 80);
    });
    const focusedInput = jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({ measureInWindow } as never);
    const timing = jest.spyOn(Animated, 'timing');

    try {
      await render(
        <BottomSheet visible onClose={jest.fn()}>
          <></>
        </BottomSheet>,
      );

      const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
      await act(async () => {
        keyboardListeners.get(showEvent)?.({ duration: 250, endCoordinates: { screenY: 600 } });
      });

      expect(measureInWindow).toHaveBeenCalledTimes(1);
      expect(timing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: -48, duration: 250 }),
      );
    } finally {
      timing.mockRestore();
      focusedInput.mockRestore();
      addListener.mockRestore();
    }
  });

  it('does not use global KeyboardAvoidingView layout shifts', async () => {
    const view = await render(
      <BottomSheet visible onClose={jest.fn()}>
        <></>
      </BottomSheet>,
    );

    const keyboardAvoidingView = view.root?.queryAll((node) => node.props.behavior === 'height')[0];
    expect(keyboardAvoidingView).toBeUndefined();
  });
});

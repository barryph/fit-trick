import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

/**
 * Closes a `@gorhom/bottom-sheet` modal when the Android hardware back button
 * is pressed.
 *
 * `BottomSheetModal` is portaled by `BottomSheetModalProvider` rather than being
 * a react-native `Modal`, so it has no `onRequestClose`. Without this the back
 * press reaches the navigator instead: the tab changes (or the app exits) while
 * the sheet stays presented on screen. The library itself never registers a
 * hardware back handler.
 *
 * Pass the returned callback to the sheet's `onChange` prop and a stable
 * `dismiss` function.
 */
export function useSheetBackHandler(dismiss: () => void) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        dismiss();
        // Consume the press so it does not also pop the screen.
        return true;
      },
    );

    return () => subscription.remove();
  }, [isOpen, dismiss]);

  return useCallback((index: number) => setIsOpen(index >= 0), []);
}

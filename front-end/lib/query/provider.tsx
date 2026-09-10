import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { queryClient } from './client';

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Detects when the app moves between the foreground and background
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // `isConnected` only means the device is attached to a network, so a
    // captive portal or a dead Wi-Fi route still counted as online. Only an
    // explicit `false` from either signal means offline. Registered inside an
    // effect so the listener is torn down on unmount instead of accumulating
    // one subscription per module evaluation.
    return onlineManager.setEventListener((setOnline) => {
      return NetInfo.addEventListener((state) => {
        setOnline(
          state.isConnected !== false && state.isInternetReachable !== false,
        );
      });
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

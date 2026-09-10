import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * True when the device has no usable internet connection.
 *
 * `isConnected` alone only says the device is attached to a network, so a
 * captive portal or a Wi-Fi network with no route out would still look online.
 * `isInternetReachable` is the stronger signal; it is `null` while NetInfo is
 * still probing, so only an explicit `false` counts as offline.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setIsOffline(
          state.isConnected === false || state.isInternetReachable === false,
        );
      }),
    [],
  );

  return isOffline;
}

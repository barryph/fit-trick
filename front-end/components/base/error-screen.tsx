import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import Background from '@/components/backgrounds/background';
import Button from '@/components/base/button';
import { ThemedText } from '@/components/base/themed-text';
import { useIsOffline } from '@/hooks/use-is-offline';

interface IProps {
  /** Message shown when the failure was not caused by connectivity. */
  message: string;
  /** Retries the failed request. Without it no retry control is rendered. */
  onRetry?: () => void;
}

const OFFLINE_MESSAGE =
  "You're offline. Check your connection and try again.";

/**
 * Terminal state for a screen whose data could not be loaded.
 *
 * Distinct from `LoaderScreen` on purpose: a failed load used to render an
 * indefinite spinner, which is indistinguishable from a slow one and gave the
 * user nothing to act on. This always states the problem and, when the caller
 * can retry, offers a button that does.
 */
export default function ErrorScreen({ message, onRetry }: IProps) {
  const isOffline = useIsOffline();

  return (
    <View style={styles.container}>
      <Background />
      <View style={styles.content}>
        <Ionicons
          name={isOffline ? 'cloud-offline-outline' : 'alert-circle-outline'}
          size={30}
          color="#d8ecff"
        />
        <ThemedText style={styles.message}>
          {isOffline ? OFFLINE_MESSAGE : message}
        </ThemedText>
        {onRetry ? (
          <Button onPress={onRetry} style={styles.retry}>
            Try again
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  message: {
    textAlign: 'center',
    opacity: 0.85,
  },
  retry: {
    marginTop: 8,
    maxWidth: 220,
  },
});

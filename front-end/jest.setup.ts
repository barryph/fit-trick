import { cleanup } from '@testing-library/react-native';
import './test/setup/setup-expo-router';
import { resetMockAuth } from './test/setup/mock-auth';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

afterEach(async () => {
  await cleanup();
  resetMockAuth();
});

jest.mock('react-native-reanimated');

// `scheduleOnRN` bridges a UI-thread callback back to the JS thread in
// production; under jest it is a no-op scheduling primitive with no native
// worklet runtime to back it.
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: jest.fn(),
}));

/**
 * @gorhom/bottom-sheet relies on native gesture/reanimated worklets that are
 * not available under jest. Render a lightweight stand-in: the provider is a
 * plain View and the modal only renders its children once present() is called.
 */
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  const { forwardRef, useImperativeHandle, useState } = React;

  const BottomSheetModalProvider = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => React.createElement(View, null, children);

  const BottomSheetModal = forwardRef(
    (
      { children }: { children?: React.ReactNode },
      ref: React.Ref<any>,
    ) => {
      const [visible, setVisible] = useState(false);
      useImperativeHandle(ref, () => ({
        present: () => setVisible(true),
        dismiss: () => setVisible(false),
        snapToIndex: jest.fn(),
        snapToPosition: jest.fn(),
        collapse: jest.fn(),
        expand: jest.fn(),
        close: () => setVisible(false),
        forceClose: jest.fn(),
      }));
      return visible ? React.createElement(View, null, children) : null;
    },
  );

  const BottomSheet = forwardRef((props: any, ref: React.Ref<any>) => {
    const [visible, setVisible] = useState(true);
    useImperativeHandle(ref, () => ({
      present: () => setVisible(true),
      dismiss: () => setVisible(false),
      snapToIndex: jest.fn(),
      snapToPosition: jest.fn(),
      collapse: jest.fn(),
      expand: jest.fn(),
      close: () => setVisible(false),
      forceClose: jest.fn(),
    }));
    return visible ? React.createElement(View, null, props.children) : null;
  });

  const BottomSheetView = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(View, null, children);

  const BottomSheetScrollView = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => React.createElement(View, null, children);

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetModalProvider,
    BottomSheetModal,
    BottomSheet,
    BottomSheetView,
    BottomSheetScrollView,
    useBottomSheetModal: () => ({
      dismiss: jest.fn(),
      dismissAll: jest.fn(),
      snapToIndex: jest.fn(),
      snapToPosition: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
    }),
  };
});

/**
 * KeyboardAvoidingView registers Keyboard listeners and layout state updates
 * that race with RNTL's async act() in login form tests. Keyboard avoidance
 * is not under test in screen suites — mock as a plain View.
 */
jest.mock('@/components/kb-avoiding-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      style,
    }: {
      children: React.ReactNode;
      style?: object;
    }) => React.createElement(View, { style }, children),
  };
});

jest.mock('@/components/swipe-row', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('reanimated-color-picker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
    Preview: () => null,
    Panel1: () => null,
    HueSlider: () => null,
    OpacitySlider: () => null,
    Swatches: () => null,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: React.ReactNode }) =>
    children ?? null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
}));

jest.mock('@expo-google-fonts/ibm-plex-mono', () => ({
  IBMPlexMono_400Regular: 'IBMPlexMono_400Regular',
  IBMPlexMono_600SemiBold: 'IBMPlexMono_600SemiBold',
  IBMPlexMono_700Bold: 'IBMPlexMono_700Bold',
  useFonts: () => [true, null],
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: {
    show: jest.fn(),
    hide: jest.fn(),
  },
}));

/**
 * Social authentication providers are native modules with no Jest
 * implementation. Provide lightweight mocks so the auth flow can be tested;
 * tests control the SDK calls through the exported jest.fn()s.
 */
jest.mock('expo-crypto', () => {
  let callCount = 0;
  return {
    getRandomBytesAsync: jest.fn(async (length: number) => {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = (callCount + i + 1) % 256;
      }
      callCount += 1;
      return bytes;
    }),
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) =>
      `sha256-of-${value}`,
    ),
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  };
});

jest.mock('@react-native-google-signin/google-signin', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  const GoogleSigninButton = ({
    onPress,
    disabled,
    style,
  }: {
    onPress?: () => void;
    disabled?: boolean;
    style?: object;
  }) =>
    React.createElement(
      Pressable,
      {
        testID: 'google-signin-button',
        accessibilityLabel: 'Sign in with Google',
        onPress,
        disabled,
        style,
      },
      React.createElement(View, null),
    );
  GoogleSigninButton.Size = { Wide: 'wide', Standard: 'standard' };
  GoogleSigninButton.Color = { Dark: 'dark', Light: 'light' };

  return {
    GoogleSignin: {
      configure: jest.fn(),
      signIn: jest.fn(),
      signInSilently: jest.fn(),
      hasPlayServices: jest.fn(),
      getCurrentUser: jest.fn(),
      clearCachedAccessToken: jest.fn(),
      revokeAccess: jest.fn(),
    },
    GoogleSigninButton,
    statusCodes: {
      SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
      IN_PROGRESS: 'IN_PROGRESS',
      SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
      PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    },
  };
});

jest.mock('expo-apple-authentication', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  const AppleAuthenticationButton = ({
    onPress,
    style,
  }: {
    onPress?: () => void;
    style?: object;
  }) =>
    React.createElement(
      Pressable,
      {
        testID: 'apple-signin-button',
        accessibilityLabel: 'Sign in with Apple',
        onPress,
        style,
      },
      React.createElement(View, null),
    );

  return {
    signInAsync: jest.fn(),
    isAvailableAsync: jest.fn(),
    getCredentialStateAsync: jest.fn(),
    AppleAuthenticationScope: {
      FULL_NAME: 'FULL_NAME',
      EMAIL: 'EMAIL',
    },
    AppleAuthenticationButtonType: { SIGN_IN: 'SIGN_IN' },
    AppleAuthenticationButtonStyle: {
      BLACK: 'BLACK',
      WHITE: 'WHITE',
      WHITE_OUTLINE: 'WHITE_OUTLINE',
    },
    AppleAuthenticationButton,
  };
});

import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useEffect } from 'react';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-mono';
import Toast from 'react-native-toast-message';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/context/auth-context';
import { QueryProvider } from '@/lib/query/provider';
import { RootLayoutNav } from '@/components/root-layout-nav';
import Background from '@/components/backgrounds/background';
import { ThemedText } from '@/components/base/themed-text';
import { Colors } from '@/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import {
  setCrashlyticsCollectionEnabled,
  setCrashlyticsCustomKey,
} from '@/lib/crashlytics/crashlytics';

// This prevents SplashScreen from auto hiding while the fonts are in loading state
SplashScreen.preventAutoHideAsync();

function FontsProvider({ children }: { children: React.ReactNode }) {
  const [loaded, error] = useFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });

  useEffect(() => {
    if (error) {
      console.error('Failed to load fonts:', error);
    }
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // Shows overlay while fonts are loading, but also renders children in the
  // background to avoid showing text in the wrong fonts without delaying load times of children
  return (
    <>
      {!loaded && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }]}>
          <Background />
        </View>
      )}
      {children}
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  /**
   * Initialise Crashlytics once at startup. Collection is enabled for
   * preview/production builds only, so local dev-client crashes don't pollute
   * real production data. (RNFirebase auto-installs the global JS error and
   * unhandled-rejection handlers — no custom handler needed.) A custom key
   * gives debugging context on every report.
   */
  useEffect(() => {
    const variant: string =
      (Constants.expoConfig?.extra as { appVariant?: string } | undefined)
        ?.appVariant ?? 'production';
    const crashlyticsEnabled = variant !== 'development';

    setCrashlyticsCollectionEnabled(crashlyticsEnabled);
    setCrashlyticsCustomKey('app_variant', variant);
  }, []);

  const toastConfig = {
    // success: (props) => <BaseToast {...props} style={{ background: 'red' }} />,
    success: ({ text1 }) => (
      <View
        style={{
          paddingVertical: 18,
          paddingHorizontal: 18,
          minWidth: '95%',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow:
            'rgba(0, 0, 0, 0.3) 0px 19px 38px, rgba(0, 0, 0, 0.22) 0px 15px 12px',
          backgroundColor: Colors.dark.toast,
          display: 'flex',
          alignContent: 'center',
          alignItems: 'center',
          gap: 11,
          flexDirection: 'row',
        }}
      >
        <Ionicons
          name="checkmark-circle-sharp"
          size={24}
          color={Colors.toastSuccess}
        />
        <ThemedText size="small" type="defaultBold">
          {text1}
        </ThemedText>
      </View>
    ),
  };

  return (
    <GestureHandlerRootView>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <BottomSheetModalProvider>
          <FontsProvider>
            <QueryProvider>
              <AuthProvider>
                <RootLayoutNav />
                <Toast config={toastConfig} />
              </AuthProvider>
            </QueryProvider>
          </FontsProvider>
          <StatusBar style="auto" />
        </BottomSheetModalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

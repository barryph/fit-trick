/**
 * Builds on top of app.json.
 * Applies dynamic values which differ based on the type of build - 'development' | 'preview' | 'production'
 *
 * The type of build is deteremined by the env var APP_VARIANT, defined in eas.json
 */

import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT || 'production';

  // Define unique identifiers for each environment
  const uniqueIdMap: Record<string, string> = {
    development: 'com.codecompletelabs.kadence.dev',
    preview: 'com.codecompletelabs.kadence.preview',
    production: 'com.codecompletelabs.kadence',
  };

  // Define unique names for each environment
  const nameMap: Record<string, string> = {
    development: 'Kadence (Dev)',
    preview: 'Kadence (Preview)',
    production: 'Kadence',
  };

  // const appIcon: Record<string, string> = {
  //   development: './src/assets/icons/apple-app-icon-dev.png',
  //   preview: './src/assets/icons/apple-app-icon-dev.png',
  //   production: './src/assets/icons/apple-touch-icon.png',
  // };

  const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;

  // Firebase config files are picked per variant so each environment uses its
  // own Firebase project apps (dev / preview / production). These files are
  // committed to the repo (see firebase/README) and are NOT secrets — they
  // embed no server credentials. Keep the naming in sync with the files under
  // /firebase/{ios,android}.
  const iosGoogleServiceFileMap: Record<string, string> = {
    development: './firebase/ios/GoogleService-Info-dev.plist',
    preview: './firebase/ios/GoogleService-Info-preview.plist',
    production: './firebase/ios/GoogleService-Info.plist',
  };
  const androidGoogleServicesFileMap: Record<string, string> = {
    development: './firebase/android/google-services-dev.json',
    preview: './firebase/android/google-services-preview.json',
    production: './firebase/android/google-services.json',
  };

  const plugins: ExpoConfig['plugins'] = [
    ...(config.plugins ?? []),
    'expo-apple-authentication',
    // Only register the Google iOS URL scheme when configured. Set
    // GOOGLE_IOS_URL_SCHEME to the reversed iOS client ID
    // (com.googleusercontent.apps.<client-id>) before building iOS.
    ...(googleIosUrlScheme
      ? ([
        [
          '@react-native-google-signin/google-signin',
          { iosUrlScheme: googleIosUrlScheme },
        ],
      ] as [string, { iosUrlScheme: string }][])
      : []),
    // React Native Firebase (see /firebase/README for setup).
    '@react-native-firebase/app',
    ['@react-native-firebase/analytics', {}],
    ['@react-native-firebase/crashlytics', {}],
  ];

  return {
    ...config,
    name: nameMap[variant],
    slug: config.slug!,
    plugins,
    extra: {
      ...config.extra,
      // Runtime build variant so the app can gate analytics/crashlytics
      // behaviour (e.g. disable Crashlytics collection on dev builds).
      appVariant: variant,
    },
    ios: {
      ...config.ios,
      // icon: appIcon[variant],
      bundleIdentifier: uniqueIdMap[variant],
      googleServicesFile: iosGoogleServiceFileMap[variant],
    },
    android: {
      ...config.android,
      // icon: appIcon[variant],
      package: uniqueIdMap[variant],

      googleServicesFile: androidGoogleServicesFileMap[variant],
    },
  };
};

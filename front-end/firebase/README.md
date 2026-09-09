# Firebase

This directory holds the Firebase native configuration files for Kadence.

## One Firebase project, three apps per platform

Kadence builds in three variants (`development`, `preview`, `production`),
each with its own iOS bundle identifier / Android package name:

| Variant     | iOS bundle id              | Android package id        |
|-------------|----------------------------|---------------------------|
| development | `com.codecompletelabs.kadence.dev`  | `com.codecompletelabs.kadence.dev` |
| preview     | `com.codecompletelabs.kadence.preview` | `com.codecompletelabs.kadence.preview` |
| production  | `com.codecompletelabs.kadence`      | `com.codecompletelabs.kadence`     |

Create **one Firebase project** in the [Firebase console](https://console.firebase.google.com)
and register a single Android app and a single iOS app per variant
(3 Android apps + 3 iOS apps total), using the identifiers above. Enable the
free **Analytics** and **Crashlytics** SDKs (Analytics is automatic; Crashlytics
is part of the same project — no extra billing needed).

The files in this directory (named per variant) are selected automatically by
`app.config.ts` based on the `APP_VARIANT` build env (already set in `eas.json`).

## Files (committed intentionally)

These files are **not secrets** — they contain no server credentials and are
required on the EAS build machine, so they must stay in the repo. Replace each
placeholder with the value downloaded from the Firebase console.

### Android — `android/google-services*.json`

Download from: Firebase console → Project settings → Your apps → {app} → "Download google-services.json".

- `android/google-services.json` → production (`com.codecompletelabs.kadence`)
- `android/google-services-preview.json` → preview (`com.codecompletelabs.kadence.preview`)
- `android/google-services-dev.json` → development (`com.codecompletelabs.kadence.dev`)

### iOS — `ios/GoogleService-Info*.plist`

Download from: Firebase console → Project settings → Your apps → {app} → "Download GoogleService-Info.plist".

- `ios/GoogleService-Info.plist` → production (`com.codecompletelabs.kadence`)
- `ios/GoogleService-Info-preview.plist` → preview (`com.codecompletelabs.kadence.preview`)
- `ios/GoogleService-Info-dev.plist` → development (`com.codecompletelabs.kadence.dev`)

## After adding real files

```bash
pnpm exec expo prebuild --clean   # regenerate ios/android with Firebase injected
# or simply build via EAS (CNG regenerates native projects)
```

The config plugins for `@react-native-firebase/app|analytics|crashlytics` in
`app.config.ts` inject Google Services into the native build automatically.

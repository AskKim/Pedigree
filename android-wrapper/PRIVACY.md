# Privacy Policy — PWA Wrapper (Community Pedigree Android Wrapper)

**Effective Date:** 2026-11-19 · **Version:** 1.0.0 · **License:** `AGPL-3.0-or-later`

---

## 1. Core Privacy Commitment

**PWA Wrapper** is engineered as a **zero-telemetry, offline-first** native container. It contains:
- **Zero** analytics SDKs (no Google Analytics, Firebase Analytics, Mixpanel, or Matomo)
- **Zero** crash-reporting SDKs (no Crashlytics, Sentry, or Bugsnag)
- **Zero** advertising or tracking SDKs
- **Zero** Google Play Services dependency blobs (`dependenciesInfo { includeInApk = false; includeInBundle = false }` in `android-wrapper/app/build.gradle.kts`)
- **Zero** background network beacons or silent phone-home calls

All user data created inside the wrapped PWA stays strictly inside the app's private Android sandbox on the user's device unless the user explicitly exports, shares, prints, or emails a file.

---

## 2. Data Processed On-Device Only

When running inside the Android wrapper:
1. **PWA Application Data (`app_webview/`)**: Stored locally by Chromium WebView (IndexedDB, SQLite, localStorage, CacheStorage, and OPFS on WebView `>= 109`). The native wrapper never reads, parses, or modifies records inside `app_webview/`; it only measures directory byte size read-only for the Storage Truth Card.
2. **Native Backup Vault (`filesDir/pedigree-vault/`)**: When the PWA triggers `syncBackupSnapshotToNative`, encrypted/serialized backup snapshots (capped at 16 MiB, rotated to the 5 most recent unique snapshots via SHA-256) are mirrored inside the app's private internal storage (`Context.filesDir`).
3. **Diagnostic Ring Buffer (RAM Only)**: `DiagnosticRingBuffer.kt` keeps up to **100** recent technical events (WebView errors, HTTP status codes, JS console errors/warnings, Back latency, external link blocks, vault sync status) in memory only—never written to disk log files.

---

## 3. Automatic PII & Secret Stripping in Diagnostics

Even when a user opens the **Developer & Diagnostics Panel** and taps **Copy Diagnostic JSON**, the wrapper enforces strict privacy guardrails:
- **No Herd Records or User Content**: Diagnostic JSON never includes animal records, names, notes, photos, or backup contents.
- **URL Sanitization (`DiagnosticRingBuffer.sanitizeUrl`)**: Before any URL enters the ring buffer, query parameters (`?...`), URL fragments (`#...`), and embedded credentials (`user:pass@...`) are stripped, and URLs are capped at 160 characters.
- **Message Bounding**: Console/error strings are flattened to single lines and truncated to 240 characters (`MAX_MESSAGE_CHARS`).
- **Clipboard Only on Explicit Tap**: Nothing leaves the device unless the user taps **Copy Diagnostic JSON** and pastes it themselves, or triggers a bug-report export/email from the PWA.

---

## 4. User-Initiated Actions That Leave the App

The wrapper only hands data to other apps on the device when the user initiates an action:
- **File Save (`SAF` / `ACTION_CREATE_DOCUMENT`)**: Writes the user-selected export file to the folder chosen by the user in Android's system file picker.
- **File Share (`FileProvider` + `Intent.ACTION_SEND`)**: Stages a temporary copy in `cacheDir/exports/` (automatically pruned after 1 hour) and passes a read-only `content://` URI to the app chosen in the Android Share Sheet.
- **Printing (`PrintManager`)**: Passes the rendered WebView page to Android's system Print Service (physical printer or "Save as PDF").
- **External Links & Email (`https://` & `mailto:`)**: Opens `https://` links in Android Custom Tabs (with sharing disabled on OAuth URLs) or opens `mailto:` in the user's email client via `Intent.ACTION_SENDTO`.
- **Debug Builds Only (`BuildConfig.DEBUG`)**: Developers can switch the WebView target URL to an `https://askkim.github.io/...` staging URL inside `DeveloperPanelDialog`. This feature is compiled out by R8 (`isMinifyEnabled = true`) in release builds.

---

## 5. Android Permissions & Cloud Backup

- **Permissions Declared (`AndroidManifest.xml`)**: Only `android.permission.INTERNET` (required for `WebViewAssetLoader`'s virtual `https://appassets.androidplatform.net` origin, optional user-initiated sync/links, and debug staging). No location, camera, microphone, contacts, or storage-all-files permissions are requested.
- **Android Cloud Backup (`android:allowBackup="false"`)**: Disabled in `AndroidManifest.xml` so Android Auto Backup does not silently upload offline databases or private vault snapshots to Google Drive.

---

## 6. Note on the AI Studio Preview Hub (`server.ts`)

This repository also includes an AI Studio web documentation viewer (`src/App.tsx` and `server.ts`) used during development. That Express server exposes `/api/ai/generate` (using `GEMINI_API_KEY` on the server side) to help developers write Markdown docs inside AI Studio. **Neither `server.ts` nor `@google/genai` is bundled into the Android APK (`android-wrapper/`).**

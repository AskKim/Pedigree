# Wrapper Scope & PWA Compatibility Guide

Because many different PWA-to-Android wrappers exist (Capacitor, Cordova, Bubblewrap/TWA, PWABuilder, generic WebView shells)—and because this repository contains multiple wrapper-related directories—this guide explains **exactly what each folder does**, **what v1.0.0 includes and excludes**, and **what may break if you wrap a different PWA with it**.

---

## 1. Which Files Are Which in This Repository?

| Directory / File | Purpose | Use It When... |
| --- | --- | --- |
| `android-wrapper/` | Standalone Kotlin Android Studio / Gradle project (`org.askkim.pedigree.wrapper`). | Building the Android Debug or Release APK. |
| `src/native/pedigreeBridge.ts` | Zero-dependency TypeScript bridge between any web app and `window.pedigreeNative`. | Integrating a web app / PWA with this Android wrapper. |
| `src/native/pedigreeBridge.test.ts` | Vitest unit tests for `pedigreeBridge.ts`. | Verifying bridge serialization, origin checks, and web fallbacks. |
| `ready for export/` | Reference copy of `pedigreeBridge` + `AskKim/Pedigree`-specific React hooks/components (`App.tsx`, `useBarnStore.ts`, `storageProtection.ts`, `DiagnosticsAndSupportPanel.tsx`). | Exporting wrapper integration into the `AskKim/Pedigree` repo (NOT generic for other PWAs). |
| `uploaded/` | Pre-patch backup snapshots uploaded earlier during development. | Inspecting historical diffs only. **Do not copy these into production.** |
| `src/App.tsx`, `server.ts`, `docs/` | AI Studio documentation workspace & preview server (`http://localhost:3000`). | Reading/editing docs or testing the `/api/*` playground in AI Studio. **Not included in the APK.** |

---

## 2. What `android-wrapper/` DOES Include (v1.0.0)

1. **Offline Asset Bundling (`WebViewAssetLoader`)**: Serves static files from `assets/www/` at virtual HTTPS origin `https://appassets.androidplatform.net/index.html`, avoiding `file://` CORS restrictions while working 100% offline.
2. **Service Worker Request Interception**: `ServiceWorkerControllerCompat` routes same-origin Service Worker fetches through `WebViewAssetLoader`.
3. **Origin-Locked Bidirectional Bridge (`window.pedigreeNative`)**: Uses `WebViewCompat.addWebMessageListener` (never `addJavascriptInterface`) supporting both JSON control envelopes and binary `ArrayBuffer` frames.
4. **System Back Button Unwinding**: Dispatches `NATIVE_BACK` to JS (250ms timeout), then falls back to `webView.canGoBack()`, then shows a 2-second `"Press Back again to exit"` toast.
5. **File Picker (`<input type="file">`)**: Uses Android's `OpenDocument` / `OpenMultipleDocuments` with a MIME-type workaround (`*/*`) when custom extensions like `.sqlite`, `.db`, `.tsv`, or `.json` are requested.
6. **Binary File Save & Share**: Streams exported bytes off the main thread to Android SAF (`ACTION_CREATE_DOCUMENT`) or `FileProvider` + `Intent.ACTION_SEND`.
7. **Native Printing / PDF Export**: Bridges `REQUEST_PRINT` to Android's `PrintManager` (`webView.createPrintDocumentAdapter`).
8. **Safe External Links & Email**: Routes `https://` URLs to Android Custom Tabs and `mailto:` to `ACTION_SENDTO`; blocks `http:`, `file:`, `javascript:`, `data:`, and `blob:`.
9. **OAuth-in-WebView Protection**: Detects `accounts.google.com` and Firebase `/__/auth` URLs and pushes them out to Android Custom Tabs with sharing disabled (`SHARE_STATE_OFF`).
10. **Native Backup Vault (`filesDir/pedigree-vault/`)**: Mirrors up to 5 SHA-256-deduplicated snapshots (max 16 MiB each) outside `app_webview/`.
11. **Developer & Diagnostics Panel**: Triple-triggered (800ms header icon hold via JS, 5-tap top-right corner natively, or Android launcher shortcut), showing WebView version, `<109` OPFS notice, Storage Truth Card, 100-event ring buffer, `Soft Cache Reset (?emergency_reset=true)`, and a `BuildConfig.DEBUG`-only HTTPS URL switcher.
12. **Renderer Crash Recovery**: `onRenderProcessGone()` remounts crashed WebViews with a 3-crash circuit breaker.

---

## 3. What `android-wrapper/` DOES NOT Include — & What May Break in Your Own PWA

If you drop your own PWA's `dist/` folder into `android-wrapper/app/src/main/assets/www/`, expect the following differences and potential breakages unless you adapt your web code:

### A. Downloads (`<a download>` / `blob:` / `data:` URLs) — WILL BREAK WITHOUT BRIDGE
- **Why**: Android's `WebView` does **not** automatically download `<a download="backup.zip" href="blob:...">` links the way mobile Chrome does. Clicking a standard Blob download link silently does nothing.
- **Fix**: Replace or wrap your download helper with `pedigreeBridge.exportOrShareBinary({ filename, mimeType, mode: 'save' | 'share', bytes })`.

### B. Printing (`window.print()`) — WILL BREAK WITHOUT BRIDGE
- **Why**: Standard `window.print()` is a silent no-op inside Android `WebView`.
- **Fix**: Call `pedigreeBridge.requestPrint()` instead of `window.print()` directly (`requestPrint()` automatically falls back to `window.print()` in normal browsers).

### C. Popups (`window.open()`) — WILL BREAK
- **Why**: For OWASP WebView hardening, `MainActivity.kt` sets `javaScriptCanOpenWindowsAutomatically = false` and `setSupportMultipleWindows(false)`. Any `window.open(...)` call returns `null` / fails silently.
- **Fix**: Use `pedigreeBridge.openExternalUrl(url)` for external HTTPS links or `<a href="https://...">` navigation (which `ExternalNavigationBridge` intercepts and opens in Custom Tabs).

### D. Google / Firebase OAuth Login Round-Trip (`onOAuthRedirectIntent` Deferred in v1)
- **Why**: Google blocks OAuth inside embedded WebViews (`403 disallowed_useragent`). `ExternalNavigationBridge` correctly routes OAuth URLs out to Custom Tabs, **but** v1 defers deep-link redirect handling (`onOAuthRedirectIntent` is a no-op stub and no custom URI scheme / App Link `<intent-filter>` is registered in `AndroidManifest.xml`).
- **What breaks**: If your PWA relies on Google Sign-In, Firebase Auth redirect/popup, or Google Calendar OAuth, the login page will open in Custom Tabs, **but returning tokens back into the offline WebView is not wired in v1**.
- **Fix**: Register an App Link / custom redirect URI in `AndroidManifest.xml` and implement `ExternalNavigationBridge.onOAuthRedirectIntent(intent)` to forward the verified auth code/state to JS.

### E. Hardware & Sensor Permissions (Camera, Mic, GPS, Bluetooth, NFC, Biometrics)
- **Why**: `AndroidManifest.xml` declares **only** `android.permission.INTERNET` for minimal privacy footprint, and `MainActivity` does not implement `WebChromeClient.onPermissionRequest` or `onGeolocationPermissionsShowPrompt`.
- **What breaks**: `navigator.mediaDevices.getUserMedia()`, `navigator.geolocation`, WebBluetooth, WebNFC, and WebAuthn/passkeys will be denied.
- **Fix**: Declare the needed `<uses-permission>` entries in `AndroidManifest.xml`, request runtime Android permissions in `MainActivity.kt`, and implement the corresponding `WebChromeClient` callbacks.

### F. OPFS & `navigator.storage.persisted()` on Older Android (WebView `< 109`)
- **Why**: Android 8–12 devices that haven't updated Android System WebView past Chromium 109 do **not** support the Origin Private File System (`navigator.storage.getDirectory()`), and WebView commonly returns `false` for `navigator.storage.persisted()`.
- **What breaks**: PWAs that crash when `navigator.storage.getDirectory` is `undefined`, or refuse to boot unless `persisted() === true`.
- **Fix**: Always provide an IndexedDB or in-memory SQLite fallback when OPFS is unavailable, and never treat `persisted() === false` as an error inside `pedigreeBridge.isNativeWrapper()`.

### G. Web Push Notifications (`PushManager`), FCM & Background Sync
- **Why**: Zero Google Play Services / proprietary blobs are included. Web Push requires a browser push service (FCM on Chrome for Android), which does not exist in standalone `WebView`.
- **What breaks**: `Notification.requestPermission()`, `registration.pushManager.subscribe()`, and `PeriodicSyncManager` will reject or never fire.

### H. Install Banners (`beforeinstallprompt`)
- **Why**: `beforeinstallprompt` only fires in a full browser, never in an embedded `WebView`.
- **Fix**: Hide your custom PWA install prompt whenever `pedigreeBridge.isNativeWrapper()` is `true`.

### I. Non-Root Vite `--base` Subpath Builds
- **Why**: `PedigreeAssetPathHandler` maps `https://appassets.androidplatform.net/` directly to `assets/www/`.
- **What breaks**: If your PWA was built for GitHub Pages with `--base=/my-repo/`, asset tags like `/my-repo/assets/index.js` will 404 inside `assets/www/`.
- **Fix**: Always build the APK bundle with `--base=/` (root relative).

### J. Origin & Storage Isolation from Mobile Chrome
- **Why**: Android's `WebView` keeps its own `app_webview` storage at origin `https://appassets.androidplatform.net`, completely separate from Chrome's storage at `https://your-domain.com`.
- **What breaks**: Users who already saved data in Chrome will see an empty state when first launching the APK.
- **Fix**: Provide an explicit backup export (`.json`/`.zip`) in the web app and import it inside the APK.

### K. No iOS Native Shell & No Capacitor/Cordova Plugins
- **Why**: `pedigreeBridge.ts` defines the iOS `window.webkit.messageHandlers.pedigreeNative` envelope format so web code is iOS-ready, but **no Swift/Xcode iOS project is included in v1**. Capacitor/Cordova plugins (`window.Capacitor`, `window.cordova`) are also absent.

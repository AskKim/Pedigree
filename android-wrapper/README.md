# PWA Wrapper

**Version 1.0.0** · **License:** `AGPL-3.0-or-later` · **Android Target:** API 26–36 (Android 8.0 – Android 16)

**PWA Wrapper** is a lean, zero-bloat, offline-first Kotlin Android WebView wrapper, origin-locked TypeScript bridge (`pedigreeBridge`), and companion documentation hub built originally for **Community Pedigree** (`AskKim/Pedigree`) and structured so human developers (including beginners) and AI coding assistants can inspect, audit, and adapt it cleanly.

---

## Repository Map (Which Files Are Which?)

Because this repository holds the standalone Android shell, the TypeScript bridge, reference PWA patches, and the AI Studio companion hub together, use this map to know what belongs where:

| Path | Role | Included in Release APK? |
| --- | --- | --- |
| `android-wrapper/` | Standalone Kotlin Android WebView shell (`MainActivity.kt`, bridges, native backup vault, Developer Panel, Gradle project). | **Yes** (compiled into `.apk`) |
| `src/native/pedigreeBridge.ts` | Zero-dependency ES2018-compatible TypeScript bridge singleton (`window.pedigreeNative` / `webkit.messageHandlers` + web fallbacks). | **Yes** (when bundled into your PWA `dist/`) |
| `src/native/pedigreeBridge.test.ts` | Vitest unit tests verifying browser fallbacks, origin checks, binary streaming, and LIFO back unwinding. | No (test time only) |
| `ready for export/` | Reference integration patches showing how `AskKim/Pedigree` wires `pedigreeBridge` into `App.tsx`, `useBarnStore.ts`, `storageProtection.ts`, and `DiagnosticsAndSupportPanel.tsx`. | Reference for `AskKim/Pedigree` |
| `uploaded/` | Pre-patch snapshot originals kept for reference/diffing only. Do not edit or deploy directly. | No |
| `src/App.tsx` & `server.ts` | AI Studio companion documentation workspace & `/api/*` preview server. | No (AI Studio preview only) |
| `.github/workflows/build-android-apk.yml` | Automated CI pipeline building `dist/`, bundling into `assets/www/`, and producing Debug + Release APKs. | CI pipeline |
| `fastlane/metadata/android/` | F-Droid / store listing metadata (`title.txt`, `short_description.txt`, `full_description.txt`, `changelogs/1.txt`). | Store metadata |

---

## Quick Start

### 1. Run Tests, Typecheck, and Build Locally

```bash
npm install
npm test        # Runs Vitest suite for pedigreeBridge
npm run lint    # Runs tsc --noEmit
npm run build   # Builds dist/ and server bundle
```

### 2. Run the AI Studio Companion Docs Hub

```bash
npm run dev     # Starts Express + Vite dev server on http://localhost:3000
```

### 3. Build Android Debug & Release APKs

You do not need Android Studio installed locally. Push to `main` or trigger **Build Android APK** in GitHub Actions (`.github/workflows/build-android-apk.yml`), or build locally inside `android-wrapper/` after copying your PWA `dist/` output into `android-wrapper/app/src/main/assets/www/`:

```bash
cp -R dist/. android-wrapper/app/src/main/assets/www/
cd android-wrapper
gradle assembleDebug assembleRelease
```

---

## What This Wrapper Does & Does Not Include (Important Before Wrapping Your Own PWA)

Every PWA wrapper makes deliberate trade-offs. Unlike Capacitor, Cordova, or Trusted Web Activities (Bubblewrap/TWA), **PWA Wrapper** is a **strictly hardened, offline-first WebView shell with zero proprietary SDKs**.

### Included in v1.0.0
- **Offline Bundled Asset Serving**: `WebViewAssetLoader` serves `assets/www/` at `https://appassets.androidplatform.net/index.html` (plus `ServiceWorkerControllerCompat` interception and explicit `.wasm`/`.js`/`.mjs` MIME types for Android 8+).
- **Origin-Locked IPC Bridge (`window.pedigreeNative`)**: Uses AndroidX `WebViewCompat.addWebMessageListener` (never `addJavascriptInterface`) locked strictly to the active origin.
- **Native Back Gesture Coordination**: Priority + LIFO handler stack (`NATIVE_BACK` -> 250ms timeout -> `webView.canGoBack()` -> 2-second double-back-to-exit toast).
- **Native File Picker & Binary Export/Share**: `<input type="file">` via `OpenDocument`/`OpenMultipleDocuments` (with Android `DocumentsUI` `*/*` fallback for `.sqlite`/`.db`/`.tsv`/`.json`), plus off-thread binary `ArrayBuffer` transfer to SAF (`ACTION_CREATE_DOCUMENT`) or `FileProvider` + `ACTION_SEND`.
- **Native Print / Save as PDF**: `PrintManager` + `webView.createPrintDocumentAdapter`.
- **Safe External Link & `mailto:` Routing**: `https:` opens in Android Custom Tabs (with `SHARE_STATE_OFF` on OAuth URLs); `mailto:` opens `ACTION_SENDTO`; unsafe schemes (`http:`, `file:`, `javascript:`, `data:`, `blob:`) are blocked.
- **Native Backup Vault (`filesDir/pedigree-vault/`)**: Mirrors up to 5 deduplicated snapshots (SHA-256, 16 MiB cap, atomic `.tmp` rename) outside `app_webview`.
- **Unified Developer & Diagnostics Panel**: Accessible via 800ms header icon hold, 5-tap top-right corner, or launcher shortcut; displays honest storage status, WebView `<109` OPFS notice, 100-event ring buffer, and compact PII-free JSON export.
- **Renderer Crash Recovery**: `onRenderProcessGone()` remounts the WebView with a 3-crash circuit breaker and non-destructive fallback UI.

### NOT Included in v1.0.0 (What May Break in Your Own PWA)
If you drop a generic PWA into `android-wrapper/` without adapting it to `pedigreeBridge`, expect the following to break or behave differently:
1. **`<a download="file.json" href="blob:...">` Blob Downloads**: Android `WebView` does **not** download `blob:` or `data:` links like desktop/mobile Chrome. You **must** route downloads through `pedigreeBridge.exportOrShareBinary()`.
2. **`window.print()`**: Standard `window.print()` is a silent no-op in Android `WebView`. You **must** call `pedigreeBridge.requestPrint()`.
3. **`window.open()` / Multi-Window Popups**: `javaScriptCanOpenWindowsAutomatically` and `setSupportMultipleWindows` are disabled (`false`). Popups will fail silently; use `pedigreeBridge.openExternalUrl()` or `<a href="https://...">`.
4. **Google / Firebase OAuth Round-Trip (`onOAuthRedirectIntent`)**: Google blocks OAuth inside WebViews (`403 disallowed_useragent`). This wrapper routes `accounts.google.com` and `/__/auth` out to Custom Tabs, **but** `onOAuthRedirectIntent` is deferred in v1 (no custom scheme/App Link deep-link receiver is registered in `AndroidManifest.xml` yet). OAuth login flows will open Custom Tabs and cannot automatically return tokens to the WebView until you configure an App Link / redirect scheme.
5. **Hardware & Sensor APIs**: `AndroidManifest.xml` declares **only** `android.permission.INTERNET`. Camera (`getUserMedia`), Microphone, GPS/Geolocation, Bluetooth, NFC, and Biometrics are **not** permitted and will be denied unless you add manifest permissions and `WebChromeClient.onPermissionRequest`.
6. **OPFS on Android 8–12 (WebView `< 109`) & `navigator.storage.persisted()`**: Older WebViews do not support OPFS (`navigator.storage.getDirectory()`), and WebView typically returns `false` for `navigator.storage.persisted()`. Your PWA **must** support an IndexedDB/SQLite fallback.
7. **Web Push Notifications (`PushManager`), FCM, & Periodic Background Sync**: Not included (zero Google Play Services / proprietary blobs).
8. **`beforeinstallprompt` Install Banners**: Never fires inside an embedded WebView; hide install banners when `pedigreeBridge.isNativeWrapper()` is `true`.
9. **Non-Root `--base` Subpath Builds**: `PedigreeAssetPathHandler` serves from `/` at `https://appassets.androidplatform.net/`. Building Vite with `--base=/my-subpath/` will 404 assets unless rebuilt with `--base=/`.
10. **Automatic Chrome PWA Data Migration**: Installing the APK creates a fresh, isolated `app_webview` sandbox; existing data in mobile Chrome is not migrated automatically.
11. **iOS Native Shell**: `pedigreeBridge.ts` contains an iOS `WKScriptMessageHandler` adapter contract, but **no Xcode/Swift iOS wrapper is included** in v1.

See [`docs/wrapper-scope-and-compatibility.md`](./docs/wrapper-scope-and-compatibility.md) for the complete breakdown and migration checklist.

---

## Essential Project Documents

- [`LICENSE`](./LICENSE) — Full GNU Affero General Public License v3.0 (`AGPL-3.0-or-later`)
- [`PRIVACY.md`](./PRIVACY.md) — Privacy policy, zero-telemetry guarantees, and PII scrubbing rules
- [`DATA_MAP.md`](./DATA_MAP.md) — Complete map of on-device storage, IPC messages, and data lifecycle
- [`SECURITY.md`](./SECURITY.md) — OWASP WebView hardening, origin locking, and vulnerability reporting
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Guidelines for human & AI contributors
- [`CHANGELOG.md`](./CHANGELOG.md) — Version history
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) — Community standards
- [`docs/wrapper-scope-and-compatibility.md`](./docs/wrapper-scope-and-compatibility.md) — Detailed included/excluded matrix & PWA breakage guide

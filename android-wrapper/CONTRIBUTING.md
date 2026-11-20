# Contributing to PWA Wrapper

Thank you for helping make **PWA Wrapper** (`AGPL-3.0-or-later`) clear, safe, and accessible for breeders, beginner developers, and AI coding assistants.

---

## 1. Non-Negotiable Architectural Invariants

Before modifying any code in `android-wrapper/` or `src/native/pedigreeBridge.ts`, verify your change respects all of these rules:

1. **Zero Proprietary Blobs**: Keep `dependenciesInfo { includeInApk = false; includeInBundle = false }` and restrict Android dependencies strictly to AndroidX (`appcompat`, `webkit`, `browser`) and Kotlin stdlib. No Firebase, Play Services, or analytics SDKs.
2. **Strict Origin Locking**: Never introduce `addJavascriptInterface`. All JS-to-Native communication must go through `WebViewCompat.addWebMessageListener` verified against `isMainFrame && sourceOrigin == activeOrigin`.
3. **Never Touch `app_webview/`**: `NativeBackupVault`, soft cache resets, and diagnostics must never modify, delete, or corrupt files inside Chromium's `app_webview/` directory. Only read-only byte counting is permitted.
4. **Never Call `webView.pauseTimers()`**: In `MainActivity.onPause()`, call `webView?.onPause()` only—`pauseTimers()` pauses JavaScript timers process-wide.
5. **No PII or Herd Data in Diagnostics**: `DiagnosticRingBuffer` and `DeveloperPanelDialog` must sanitize URLs (strip query/hash/userinfo) and never store or export animal records, user credentials, or personal data.
6. **Honest Storage Reporting**: Never spoof `navigator.storage.persisted()` to return `true`. Report browser status honestly alongside `nativeContainerInfo`.
7. **Respect the Frozen Export Snapshot**: `ready for export/` is a frozen export snapshot for `AskKim/Pedigree`—do not modify files inside `ready for export/` unless explicitly preparing a new export release.

---

## 2. Development & Verification Workflow

```bash
# 1. Install dependencies
npm install

# 2. Run unit tests (26 bridge tests)
npm test

# 3. Typecheck TypeScript
npm run lint

# 4. Build web bundle & server
npm run build
```

For Android changes inside `android-wrapper/`:
- Open a PR or push to `main` to run `.github/workflows/build-android-apk.yml`, or run `gradle assembleDebug assembleRelease` locally inside `android-wrapper/` after copying `dist/` into `android-wrapper/app/src/main/assets/www/`.

---

## 3. Documentation Standards for Human & AI Readers

- **Kotlin (`android-wrapper/`)**: Add KDoc (`/** ... */`) on every class and public method explaining **what** it does, **why** it is designed that way (especially Android WebView quirks), and **thread/lifecycle constraints**.
- **TypeScript (`src/native/`)**: Document every exported interface, method, option, and fallback path with JSDoc. Keep `pedigreeBridge.ts` ES2018-compatible with zero external npm dependencies.
- **License Headers**: All source files in `android-wrapper/` and `src/native/` carry `SPDX-License-Identifier: AGPL-3.0-or-later`.

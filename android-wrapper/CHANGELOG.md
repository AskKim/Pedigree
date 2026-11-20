# Changelog

All notable changes to **PWA Wrapper** (`org.askkim.pedigree.wrapper`) are documented in this file.

## [1.0.0] — 2026-11-19

### Added
- **Phase 1 — TypeScript Bridge & PWA Hooks (`src/native/pedigreeBridge.ts`, `ready for export/`)**:
  - Zero-dependency ES2018 bridge singleton (`window.pedigreeNative` on Android, `window.webkit.messageHandlers.pedigreeNative` adapter for future iOS, clean fallbacks for standard browsers).
  - Priority + LIFO Back handler registry (`registerBackHandler`, `dispatchBackPress`).
  - Two-frame binary streaming (`BEGIN_BINARY_TRANSFER` + sliced `ArrayBuffer`) with `navigator.share` / Blob download fallbacks.
  - Native print trigger (`requestPrint`), strict `https:`/`mailto:` external URL validation (`openExternalUrl`), Developer Panel trigger (`openNativeDevPanel`), async container inspection (`getNativeContainerInfo`), and native vault mirroring (`syncBackupSnapshotToNative`).
  - 26 Vitest unit tests (`src/native/pedigreeBridge.test.ts`).
- **Phase 2 — Lean Kotlin Android WebView Shell (`android-wrapper/`)**:
  - Offline-first `WebViewAssetLoader` serving `assets/www/` under `https://appassets.androidplatform.net/` with `PedigreeAssetPathHandler` (explicit `.wasm`/`.js`/`.mjs` MIME types and SPA route fallback) and `ServiceWorkerControllerCompat` interception.
  - OWASP WebView hardening (`allowFileAccess = false`, `MIXED_CONTENT_NEVER_ALLOW`, `SafeBrowsingEnabled`, `WEB_MESSAGE_LISTENER` origin lock, zero `addJavascriptInterface`).
  - `onRenderProcessGone()` recovery with foreground/background awareness and 3-crash circuit breaker.
  - Reproducible, blob-free Gradle config (`minSdk 26`, `targetSdk 36`, `dependenciesInfo` disabled) and GitHub Actions CI workflow (`.github/workflows/build-android-apk.yml`).
- **Phase 3 — Native Bridges (`BackNavigationBridge`, `FileAndExportBridge`, `PrintBridge`, `ExternalNavigationBridge`)**:
  - 250ms JS back handshake + `webView.canGoBack()` + 2-second double-back-to-exit toast.
  - `<input type="file">` picker via `OpenDocument` / `OpenMultipleDocuments` (with `DocumentsUI` `*/*` workaround for `.sqlite`/`.db`/`.tsv`/`.json`).
  - Off-thread SAF save (`ACTION_CREATE_DOCUMENT`) and `FileProvider` share (`ACTION_SEND`) with 1-hour export cache pruning.
  - `PrintManager` integration and Custom Tabs / `mailto:` routing (blocking OAuth inside WebView).
- **Phase 4 — Native Backup Vault & Developer Panel (`NativeBackupVault`, `DiagnosticRingBuffer`, `DeveloperPanelDialog`)**:
  - `filesDir/pedigree-vault/` snapshot mirror with 16 MiB cap, write conflation, SHA-256 deduplication, atomic `.tmp` rename, and 5-snapshot rotation.
  - Zero-churn 100-entry RAM `DiagnosticRingBuffer` with automatic URL query/hash/userinfo stripping.
  - Lazy Developer & Diagnostics Panel triggered via 800ms header icon hold, 5-tap top-right corner, or launcher shortcut (`res/xml/shortcuts.xml`), featuring the Storage Truth Card, WebView `<109` OPFS notice, `Copy Diagnostic JSON`, `Soft Cache Reset (?emergency_reset=true)`, and `BuildConfig.DEBUG`-only HTTPS URL switcher.
- **Phase 5 — Release Prep, F-Droid Metadata & Documentation**:
  - Fastlane listing metadata (`fastlane/metadata/android/en-US/`), full GNU `AGPL-3.0-or-later` `LICENSE`, `PRIVACY.md`, `DATA_MAP.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `docs/wrapper-scope-and-compatibility.md`.

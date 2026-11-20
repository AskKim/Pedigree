# Security Policy — PWA Wrapper

**License:** `AGPL-3.0-or-later` · **Target Baseline:** OWASP Mobile / Android WebView Hardening

---

## 1. Implemented Security Controls (`android-wrapper/` & `pedigreeBridge.ts`)

| Control | Implementation | Location |
| --- | --- | --- |
| **No `addJavascriptInterface`** | Replaced entirely with origin-locked `WebViewCompat.addWebMessageListener` (`window.pedigreeNative`) checked against `isMainFrame && sourceOrigin == activeOrigin`. | `MainActivity.kt`, `pedigreeBridge.ts` |
| **Strict File/Content Isolation** | `allowFileAccess = false`, `allowContentAccess = false`, `allowFileAccessFromFileURLs = false`, `allowUniversalAccessFromFileURLs = false`. | `MainActivity.kt` |
| **HTTPS-Only & No Mixed Content** | `android:usesCleartextTraffic="false"` in manifest + `WebSettings.MIXED_CONTENT_NEVER_ALLOW`. | `AndroidManifest.xml`, `MainActivity.kt` |
| **Safe Browsing** | `WebSettingsCompat.setSafeBrowsingEnabled(settings, true)` when supported by the system WebView. | `MainActivity.kt` |
| **No Arbitrary Popups** | `javaScriptCanOpenWindowsAutomatically = false`, `setSupportMultipleWindows(false)`. | `MainActivity.kt` |
| **Scheme Allowlisting** | `openExternalUrl` and `ExternalNavigationBridge` permit **only** `https:` and `mailto:`. `http:`, `file:`, `content:`, `javascript:`, `data:`, and `blob:` are blocked and logged. | `pedigreeBridge.ts`, `ExternalNavigationBridge.kt` |
| **OAuth Outside WebView** | `accounts.google.com` and Firebase `/__/auth` URLs are blocked from loading inside the WebView and routed to Android Custom Tabs with `SHARE_STATE_OFF`. | `ExternalNavigationBridge.kt` |
| **Path-Traversal Guard** | `PedigreeAssetPathHandler` rejects `\\`, null bytes (`\u0000`), `.` and `..` segments before reading `assets/www/`. | `PedigreeAssetPathHandler.kt` |
| **Filename & ID Sanitization** | Export filenames strip directory separators and control characters (capped at 128 chars); vault snapshot IDs restrict to `[A-Za-z0-9_-]` (capped at 48 chars). | `FileAndExportBridge.kt`, `NativeBackupVault.kt` |
| **Memory Exhaustion Guard** | `NativeBackupVault` caps snapshots at 16 MiB and conflates concurrent writes to a single queued buffer. | `NativeBackupVault.kt` |
| **Debug Stripping in Release** | `WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)` and the debug HTTPS URL switcher (`https://askkim.github.io/...` only) are gated on `BuildConfig.DEBUG` and stripped by R8 in release builds. | `MainActivity.kt`, `DeveloperPanelDialog.kt`, `app/build.gradle.kts` |
| **Scoped `FileProvider`** | Only `cacheDir/exports/` is exposed via `file_paths.xml` with temporary `FLAG_GRANT_READ_URI_PERMISSION`. | `AndroidManifest.xml`, `file_paths.xml` |

---

## 2. Known Security & Scope Boundaries

- **Debug APK (`org.askkim.pedigree.wrapper.debug`)**: Intentionally enables WebView remote debugging (`chrome://inspect`) and allows switching to `https://askkim.github.io/...`. Never distribute Debug APKs to end users.
- **Release Signing**: Never commit `.jks` keystore files or signing passwords to source control. Use CI secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) as configured in `.github/workflows/build-android-apk.yml`.
- **AI Studio Preview Server (`server.ts`)**: Used only for documentation viewing/editing in AI Studio, not packaged into the Android app. Never expose `GEMINI_API_KEY` to client-side code.

---

## 3. Reporting a Vulnerability

If you discover a security issue in the WebView hardening, origin validation, file-path handling, or IPC bridge:
1. **Do not** open a public issue containing exploit details.
2. Report privately via GitHub Security Advisories on the repository or contact the project maintainer directly.
3. Include the affected file, Android API / WebView version, reproduction steps, and potential impact.

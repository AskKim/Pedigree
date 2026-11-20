# Community Pedigree Android Wrapper (`android-wrapper/`)

**Version:** `1.0.0` · **License:** `AGPL-3.0-or-later` · **SDK:** `minSdk 26` (Android 8.0) / `targetSdk 36` (Android 16)

This standalone Gradle/Kotlin module wraps an offline-first Vite/React PWA (`assets/www/`) inside a hardened Android `WebView` with zero proprietary Google Play Services or analytics SDKs.

## Kotlin Source Files (`app/src/main/java/org/askkim/pedigree/wrapper/`)

| File | Responsibility |
| --- | --- |
| `MainActivity.kt` | Lifecycle owner, OWASP WebView settings, origin-locked `WebMessageListener`, two-frame binary router, crash-loop circuit breaker, and 5-tap corner / launcher shortcut dev trigger. |
| `PedigreeAssetPathHandler.kt` | Serves `assets/www/` under `https://appassets.androidplatform.net/` with path-traversal protection, SPA fallback, and Android 8+ MIME types. |
| `BackNavigationBridge.kt` | 250ms `NATIVE_BACK` JS handshake -> `webView.canGoBack()` -> 2s double-back-to-exit toast. |
| `FileAndExportBridge.kt` | `<input type="file">` (`OpenDocument`/`OpenMultipleDocuments`), SAF save (`ACTION_CREATE_DOCUMENT`), and `FileProvider` Share Sheet (`ACTION_SEND`). |
| `PrintBridge.kt` | Bridges `REQUEST_PRINT` to Android's `PrintManager` (`createPrintDocumentAdapter`). |
| `ExternalNavigationBridge.kt` | Routes `https:` to Custom Tabs (with `SHARE_STATE_OFF` on OAuth URLs) and `mailto:` to `ACTION_SENDTO`. |
| `NativeBackupVault.kt` | Mirrors up to 5 SHA-256-deduplicated backup snapshots (max 16 MiB) in `filesDir/pedigree-vault/`. |
| `DiagnosticRingBuffer.kt` | 100-entry RAM-only circular buffer that strips URL queries/hashes/userinfo and bounds strings to 240 chars. |
| `DeveloperPanelDialog.kt` | Lazy, leak-free `AlertDialog` showing WebView info, `<109` OPFS notice, Storage Truth Card, event log, soft cache reset, and `DEBUG`-only URL switcher. |

## Building Locally

1. Build your PWA with root base (`npm run build` / `vite build --base=/`).
2. Copy `dist/*` into `app/src/main/assets/www/`.
3. Run `gradle assembleDebug assembleRelease` inside `android-wrapper/`.

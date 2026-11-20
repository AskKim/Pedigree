# Data Map — PWA Wrapper Storage, IPC & Data Flows

**Version:** 1.0.0 · **Purpose:** Complete inventory of where data lives on-device, how it moves across the WebView-to-Native bridge, how long it is retained, and how it is deleted.

---

## 1. On-Device Storage Inventory (Android Sandbox)

All persistent files live inside the app's private Android application sandbox (`org.askkim.pedigree.wrapper`, or `.debug` for debug builds). Other apps cannot read these directories unless the user explicitly shares or saves a file via Android's system pickers.

| Storage Location | Owner | Format & Contents | Capacity / Retention | Read/Write Behavior |
| --- | --- | --- | --- | --- |
| `app_webview/` (`dataDir/app_webview`) | Android System WebView (Chromium) | IndexedDB, SQLite/WebSQL, `localStorage`, Service Worker `CacheStorage`, and OPFS (WebView `>= 109`). | Managed by Chromium WebView quota. | **Never modified by native wrapper code.** `NativeBackupVault` only calculates total byte size read-only (`measureAppWebViewBytesBlocking()`). |
| `filesDir/pedigree-vault/` | `NativeBackupVault.kt` | Mirrored PWA backup snapshots (`<epochMs>_<seq>_<snapshotId>.{json,sqlite,zip,bin}`). | Max **16 MiB** per snapshot (`MAX_SNAPSHOT_BYTES`); retains **5 newest** unique snapshots (`MAX_RETAINED_SNAPSHOTS`), deduplicated by SHA-256 + byte length. | Written off main thread on a single serial executor via 16 KiB buffered streams to `.tmp`, then atomically `renameTo()` final file. |
| `cacheDir/exports/` | `FileAndExportBridge.kt` | Temporary copies of user-shared binary exports (`mode: 'share'`) exposed via `FileProvider` (`${applicationId}.fileprovider`). | Automatically pruned when older than **1 hour** (`EXPORT_CACHE_TTL_MS = 3,600,000 ms`) or by Android OS cache pressure. | Written off main thread in unique timestamped subdirectories (`<ts36>_<seq>/<sanitizedFilename>`). |
| `SharedPreferences` (`pedigree_wrapper_debug_prefs`) | `MainActivity.kt` (`BuildConfig.DEBUG` only) | Single optional string key `debug_target_url` (strictly restricted to `https://askkim.github.io/...`). | Until cleared or reset to Bundled Assets. | Never read or written in Release builds (`if (!BuildConfig.DEBUG) return`). |
| Process RAM (`DiagnosticRingBuffer`) | `DiagnosticRingBuffer.kt` | Up to 100 `DiagnosticEvent` entries (`ts`, `lvl`, `code`, `msg`, `n`). | **100 entries max** (circular overwrite); **0 bytes on disk**; cleared when app process terminates. | 60-second repeat deduplication; URL query/hash/userinfo stripped and messages capped at 240 chars. |
| User-chosen SAF destination | Android `DocumentsUI` (`ACTION_CREATE_DOCUMENT`) | Exported backups or reports saved by the user (`mode: 'save'`). | Permanent user-owned file outside app sandbox. | Streamed in 16 KiB chunks off main thread via `ContentResolver.openOutputStream(uri, "wt")`. |

---

## 2. Browser / PWA-Side Storage (When Integrated with `AskKim/Pedigree`)

Inside the PWA layer (`ready for export/` reference integration):
- **Primary Store (`StorageAdapter`)**: IndexedDB / SQLite / OPFS (when WebView `>= 109`) holding animals, pedigrees, breedings, tasks, care logs, shows, settings, and photos.
- **Rolling Backup Mirror (`community_pedigree_rolling_backups` IDB)**: Up to 3 recent rolling snapshots stored in IndexedDB (`storageProtection.ts`).
- **PWA Preference Keys (`localStorage`)**:
  - `pedigree_manual_offline_v1`: Boolean flag for manual offline mode.
  - `pedigree_clock_skew_ms_v1`: Recorded HTTP `Date` header clock drift offset in milliseconds.
- **Emergency Session Trace (`sessionStorage`)**: Compact fallback crash trace if primary IndexedDB log storage is full/unavailable.

---

## 3. WebView-to-Native IPC Bridge Map (`window.pedigreeNative`)

Transport: `WebViewCompat.addWebMessageListener` locked strictly to `activeOrigin` (`https://appassets.androidplatform.net` in release; `https://askkim.github.io` if overridden in debug) and `isMainFrame == true`.

### A. PWA -> Native Messages

| Message `type` | Payload Fields | Trailing Binary Frame? | Native Handler & Effect |
| --- | --- | --- | --- |
| `NATIVE_BACK_RESULT` | `{ handled: boolean }` | No | `BackNavigationBridge.handleNativeBackResult`: Cancels 250ms timer; if `handled == false`, runs `webView.canGoBack()` or double-back exit toast. |
| `BEGIN_BINARY_TRANSFER` | `{ filename, mimeType, mode: 'save' \| 'share', byteLength, base64Data? }` | Yes (`ArrayBuffer`), unless `base64Data` is provided | `FileAndExportBridge`: Saves via SAF (`ACTION_CREATE_DOCUMENT`) or shares via `FileProvider` + `ACTION_SEND`. |
| `SYNC_BACKUP_SNAPSHOT` | `{ snapshotId, createdAt, format, byteLength, metadata?, base64Data? }` | Yes (`ArrayBuffer`), unless `base64Data` is provided | `NativeBackupVault`: Streams snapshot to `filesDir/pedigree-vault/` if `<= 16 MiB` and SHA-256 differs from latest snapshot. |
| `REQUEST_PRINT` | *(none)* | No | `PrintBridge`: Opens Android `PrintManager` with `webView.createPrintDocumentAdapter("Community Pedigree")`. |
| `OPEN_EXTERNAL_URL` | `{ url, protocol, purpose }` | No | `ExternalNavigationBridge`: Allows only `https:` (Custom Tabs) and `mailto:` (`ACTION_SENDTO`). |
| `OPEN_DEV_PANEL` | *(none)* | No | `MainActivity` -> `DeveloperPanelDialog`: Opens native diagnostics modal. |
| `GET_CONTAINER_INFO` | *(none)* | No | `MainActivity`: Replies with `CONTAINER_INFO_RESULT` containing WebView package/version, OPFS support (`>= 109`), origin, debug flag, vault metrics, and read-only `app_webview` size. |

### B. Native -> PWA Messages

| Message `type` | Payload Fields | Trigger |
| --- | --- | --- |
| `NATIVE_BACK` | *(none; correlated by `requestId`)* | Android hardware/gesture Back press (`OnBackPressedCallback`). Dispatched via `replyProxy` or origin-checked `window.__pedigreeBridgeReceive(...)`. |
| `CONTAINER_INFO_RESULT` | `{ platform, appVersion, webViewPackage, webViewVersion, webViewMajorVersion, opfsSupportedInWebView, origin, isDebugBuild, vaultSnapshotCount, vaultTotalBytes, lastVaultBackupAt, appWebViewBytes }` | Reply to `GET_CONTAINER_INFO`. |

---

## 4. Two-Frame Binary Streaming State Machine (`MainActivity.kt`)

Because `WebMessageCompat` sends JSON metadata (`TYPE_STRING`) and raw bytes (`TYPE_ARRAY_BUFFER`) as two separate frames:
1. Receiving `BEGIN_BINARY_TRANSFER` sets `pendingBinaryTarget = EXPORT` (unless inline `base64Data` is present).
2. Receiving `SYNC_BACKUP_SNAPSHOT` sets `pendingBinaryTarget = VAULT` (unless inline `base64Data` is present).
3. Receiving the next `TYPE_ARRAY_BUFFER` reads and immediately resets `pendingBinaryTarget = NONE`, routing the bytes to the matching subsystem.
4. If any other envelope arrives while `pendingBinaryTarget != NONE`, `MainActivity` logs `BINARY_FRAME_MISMATCH` and clears both pending targets so frames can never cross wires.

---

## 5. Data Deletion & Reset Behavior

| Action | Clears HTTP / SW Cache? | Clears IndexedDB / SQLite / OPFS? | Clears `pedigree-vault/`? | Clears Android Backup? |
| --- | --- | --- | --- | --- |
| **Soft Cache Reset (`?emergency_reset=true`)** in Dev Panel | **Yes** (`webView.clearCache(false)`) | **No** (preserved) | **No** (preserved) | N/A |
| **App Uninstall** | **Yes** | **Yes** | **Yes** | N/A (`allowBackup="false"`) |
| **Android Settings -> Clear Storage** | **Yes** | **Yes** | **Yes** | N/A |
| **Android Settings -> Clear Cache** | **Yes** (also clears `cacheDir/exports/`) | **No** | **No** | N/A |

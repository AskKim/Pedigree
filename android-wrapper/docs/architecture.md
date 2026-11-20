# System Architecture — PWA Wrapper

**PWA Wrapper** separates the web application (`pedigreeBridge.ts`) from the native Android host (`android-wrapper/`) using a strict, origin-locked message-passing boundary.

## Architectural Diagram

```text
+-------------------------------------------------------------------+
|               PWA Web Layer (dist/ in assets/www/)                |
|  - Served at https://appassets.androidplatform.net/index.html     |
|  - src/native/pedigreeBridge.ts (ES2018, zero npm dependencies)   |
|  - Browser fallbacks when !isNativeWrapper()                      |
+-------------------------------------------------------------------+
                 |                                 ^
                 | WebMessageCompat                | replyProxy /
                 | (JSON + ArrayBuffer)            | __pedigreeBridgeReceive
                 v                                 |
+-------------------------------------------------------------------+
|          MainActivity.kt (Origin-Locked WebView Host)             |
|  - PedigreeAssetPathHandler (assets/www/ -> virtual HTTPS origin) |
|  - PedigreeServiceWorkerClient (SW asset interception)            |
|  - BackNavigationBridge     - FileAndExportBridge                 |
|  - PrintBridge              - ExternalNavigationBridge            |
|  - NativeBackupVault        - DiagnosticRingBuffer                |
|  - DeveloperPanelDialog     - Renderer Crash Circuit Breaker      |
+-------------------------------------------------------------------+
                 |
                 v
+-------------------------------------------------------------------+
|                 Private Android App Sandbox                       |
|  - app_webview/ (Chromium IDB/SQLite/OPFS — read-only accounting) |
|  - filesDir/pedigree-vault/ (5-snapshot SHA-256 vault)            |
|  - cacheDir/exports/ (1h TTL FileProvider share staging)          |
+-------------------------------------------------------------------+
```

## Core Layers

### 1. TypeScript Bridge (`src/native/pedigreeBridge.ts`)
Detects Android (`window.pedigreeNative`), iOS (`window.webkit.messageHandlers.pedigreeNative`), or standard browser (`web`). In wrapped environments, it translates high-level web actions (binary export, print, back press, external links, vault snapshots, container info) into structured JSON + `ArrayBuffer` envelopes.

### 2. Android WebView Shell (`android-wrapper/`)
Built with pure AndroidX (`appcompat`, `webkit`, `browser`) and Kotlin stdlib—zero Capacitor, Cordova, or proprietary Google Play Services SDKs. Enforces OWASP WebView hardening (`allowFileAccess = false`, `MIXED_CONTENT_NEVER_ALLOW`, Safe Browsing, no `addJavascriptInterface`).

### 3. AI Studio Companion Hub (`src/App.tsx` & `server.ts`)
Used only during development inside AI Studio (port 3000) to browse/edit `/docs/*.md` and inspect bridge APIs. **Not** packaged inside the Android APK.

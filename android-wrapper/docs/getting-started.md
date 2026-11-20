# Getting Started with PWA Wrapper

Welcome to **PWA Wrapper** (`AGPL-3.0-or-later`), a hardened, offline-first Kotlin Android WebView shell and zero-dependency TypeScript bridge (`pedigreeBridge`) designed originally for **Community Pedigree** (`AskKim/Pedigree`) and built for clarity by both human developers and AI assistants.

## Overview

PWA Wrapper bundles a static Vite/React PWA (`dist/`) into a standalone Android APK served locally over HTTPS (`https://appassets.androidplatform.net`) using AndroidX `WebViewAssetLoader`, with native bridges for Back navigation, file picking, binary export/sharing, printing, external links, backup vault mirroring, and diagnostics.

### Key Capabilities
- **100% Offline Cold Launch**: Serves bundled web assets without requiring internet access.
- **Origin-Locked Native Bridge (`window.pedigreeNative`)**: Zero `addJavascriptInterface`; uses AndroidX `WebMessageListener` + `ArrayBuffer` binary streaming.
- **Native Android UX**: Back-stack modal/route unwinding, SAF file save, `FileProvider` Share Sheet, `PrintManager` PDF/printing, Custom Tabs for external URLs.
- **Native Backup Vault & Developer Panel**: Automatic 5-snapshot deduplicated mirror in `filesDir/pedigree-vault/` and a built-in Storage Truth + 100-event diagnostics panel.

> **Important:** Before wrapping your own PWA, read [Wrapper Scope & Compatibility](./wrapper-scope-and-compatibility.md) to see exactly what v1 **does** and **does not** include so you know what web APIs (`<a download="blob:">`, `window.print()`, `window.open()`, OPFS on `<109`, OAuth) need bridge calls or fallbacks.

## Quick Verification

```bash
# Install dependencies for the TypeScript bridge & companion docs hub
npm install

# Run the 26 unit tests covering pedigreeBridge
npm test

# Typecheck TypeScript
npm run lint

# Build the companion app
npm run build
```

## Directory Overview

- `android-wrapper/` — Standalone Gradle/Kotlin Android project (`minSdk 26`, `targetSdk 36`)
- `src/native/` — Canonical `pedigreeBridge.ts` and `pedigreeBridge.test.ts`
- `ready for export/` — Reference integration files for `AskKim/Pedigree`
- `docs/` — Architecture, bridge API reference, phase plans, and compatibility docs
- `fastlane/metadata/android/` — F-Droid & release store metadata

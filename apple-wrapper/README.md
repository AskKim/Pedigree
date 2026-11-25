# Apple Wrapper Architecture (iOS & macOS `WKWebView`)

## Plain-English Overview
The Apple Wrapper is an upcoming lightweight native shell (written in Swift) for iPhone, iPad, and Mac computers. It loads the exact same React, Vite, and TypeScript application that runs in the browser, packaging it as a native Apple app.

The most critical job of this wrapper is **permanent data protection**. On Apple devices, Apple's browser engine (WebKit) has a strict policy called Intelligent Tracking Prevention (ITP) that automatically wipes out website data (including `IndexedDB` and `localStorage`) if a user does not open the app for seven days or if device storage runs low. To protect users from losing local records and history, this wrapper bridges database calls directly into Apple's native SQLite storage engine inside the app's permanent storage folder (`Application Support/`), guaranteeing records never get deleted by iOS.

---

## AI & Developer Technical Specifications

### 1. Upcoming Wrapper Purpose
- **Target Platforms:** iOS (iPhone/iPad) and macOS via `WKWebView`.
- **Packaging Model:** Thin native host container (Swift + SwiftUI or UIKit) that packages the built React PWA (`dist/`) into app resources and mounts an offscreen-accelerated `WKWebView`.
- **Eviction Defense:** Apple WebKit enforces automated 7-day storage purge under ITP and memory/disk pressure. The Apple wrapper bypasses WebKit browser storage by delegating all persistence to native SQLite located in `Application Support/` or `Documents/`.

### 2. Shared TypeScript Storage Adapter Contracts
- **Bridge Endpoint:** Swift registers a `WKScriptMessageHandler` on `WKUserContentController` matching the app's configured `nativeBridgeKey` (default fallback: `"nativeStorage"`).
- **Core Adapter:** `@engine/storage/nativeBridgeStorageAdapter.ts` implements `IStorageAdapter`, translating `read`, `write`, `delete`, `list`, and `vaultSnapshot` calls into JSON message envelopes.
- **IPC & SQLite Contracts:** Defined in [`BRIDGE_CONTRACT.md`](./BRIDGE_CONTRACT.md) and [`WKWebViewSQLiteContract.md`](./WKWebViewSQLiteContract.md) (superseding the legacy iOS-only draft in `../ios-wrapper/BRIDGE_CONTRACT.md`):
  - Request: Posted via `window.webkit.messageHandlers.<channel>.postMessage(...)` with `type: "NATIVE_STORAGE_OP"`, unique `requestId`, `action`, `key`, and `data`.
  - Correlated Reply: Evaluated by Swift via `window.__platformBridgeStorageReceive({ requestId, ok, data, error })`.
  - Resilience: Client-side timeout ceiling (default 5,000ms) with graceful fallback and error telemetry.

### 3. Zero-Domain-Logic Boundary Rules
- **Pure Container:** Contains zero application-domain terms or business rules.
- **Content Agnosticism:** Host Swift code knows only about string keys, string values, byte streams, print requests, and file export paths.
- **Domain Confinement:** All domain schemas, calculations, workflows, and UI remain 100% inside the React + TypeScript PWA (`src/`).

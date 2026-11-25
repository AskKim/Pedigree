# Desktop Wrapper Architecture (Windows, macOS & Linux)

## Plain-English Overview
The Desktop Wrapper is an upcoming lightweight desktop application installer for Windows PCs, Apple Mac computers, and Linux desktops. It allows users to install the web application as a regular computer program that appears in their Start Menu or Applications folder, runs completely offline, and doesn't require an active internet connection or browser window.

Just like the Android and Apple wrappers, the desktop wrapper does not replace or rewrite the React application. Instead, it acts as a thin native window frame that renders the React web app locally, unlocks direct printer connections for formatted documents, and allows instant file saves to standard computer folders without browser download prompts.

---

## AI & Developer Technical Specifications

### 1. Upcoming Wrapper Purpose
- **Target Platforms:** Windows (`.exe` / `.msi`), macOS (`.dmg`), and Linux (`.AppImage` / `.deb`) — see [`INSTALLER_TARGETS.md`](./INSTALLER_TARGETS.md).
- **Packaging Technologies:** Lightweight desktop runtime (Tauri preferred for minimal bundle size and native webview; Electron fallback).
- **Core Functionality:** Local file system access, native file save/open dialogues, window state persistence, offline bundling of Vite assets, and high-resolution direct printing.

### 2. Shared TypeScript Storage Adapter Contracts
- **Bridge Abstraction:** Implemented by `@engine/bridge/desktopBridgeAdapter.ts`, sniffing `window.__TAURI_INTERNALS__` / `window.__TAURI__` or `window.electronAPI`.
- **Storage Interface:** Implements `IPlatformBridge` and integrates with `@engine/storage/nativeBridgeStorageAdapter.ts` for desktop SQLite or local filesystem persistence when running outside standard browser sandboxes.
- **IPC Contract:** Defined in [`BRIDGE_CONTRACT.md`](./BRIDGE_CONTRACT.md):
  - `exportBinary`: Native OS save/share dialog delegating to desktop file system APIs.
  - `printDocument`: Silent or system-dialog print spooling using the host window manager.
  - `openExternal`: System default browser launch via OS desktop shell service (`https:` / `mailto:` only).
  - `onBackPressed`: Optional desktop back-navigation hook dispatched through `PlatformBridge.dispatchBackPress()`.

### 3. Zero-Domain-Logic Boundary Rules
- **Framework Separation:** Zero domain-specific references inside desktop wrapper scaffolding.
- **Strict IPC Decoupling:** Desktop host scripts handle only window management, IPC message routing, and file system bytes.
- **No Domain Duplication:** All business logic, calculations, and UI rendering remain strictly in the React PWA (`src/`).

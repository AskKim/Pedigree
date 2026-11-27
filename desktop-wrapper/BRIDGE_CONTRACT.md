# Desktop Wrapper IPC & Preload Bridge Contract (Electron / Tauri)

Content-agnostic IPC contract implemented by `@engine/bridge/desktopBridgeAdapter.ts` and `@engine/bridge/platformBridge.ts` with zero `electron` or `@tauri-apps/*` dependencies in the core web bundle.

## 1. Electron Preload Surface (`window.electronAPI`)
Expose **only** via `contextBridge.exposeInMainWorld('electronAPI', ...)` with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`:

- `exportBinary({ filename, mimeType, mode, base64Data, byteLength }) -> Promise<boolean | PlatformExportResult>`
- `printDocument({ title, htmlContent, orientation }) -> Promise<boolean>`
- `invokeStorageBridge({ action, key, data, options }) -> Promise<NativeStorageBridgeResult>`
- `openExternal(url) -> Promise<boolean>` (allowlist `https:` and `mailto:` only)
- `onBackPressed(handler: () => void) -> () => void` (returns unsubscribe callback)

## 2. Tauri Command Surface (`window.__TAURI_INTERNALS__.invoke`)
Allowlisted Rust commands invoked via `invoke(cmd, args)`:
- `bridge_export_binary`
- `bridge_print_document`
- `bridge_storage_op`
- `bridge_open_external`

## 3. Security & Atomic Write Invariants
- Never expose raw filesystem paths, arbitrary shell execution, or unrestricted `ipcRenderer` to the renderer.
- Validate filenames (basename only, strip path separators) and enforce `https:` / `mailto:` protocol checks in the host process before launching external handlers.
- Perform native storage writes atomically via temp-file + rename in the OS app-data directory.

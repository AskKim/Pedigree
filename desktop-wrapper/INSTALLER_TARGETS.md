# Desktop Wrapper Installer Targets

Packaging blueprint for wrapping the compiled React + Vite + TypeScript PWA (`dist/`) into offline desktop installers without adding desktop runtime dependencies to the core web repository.

| Platform | Target Format(s) | Preferred Runtime | Storage Directory |
| :--- | :--- | :--- | :--- |
| **Windows 10/11 (x64, arm64)** | `.msi` / NSIS `.exe` | Tauri (WebView2) or Electron | `%APPDATA%\<AppId>\` |
| **macOS 12+ (Universal)** | Signed & notarized `.dmg` / `.app` | Tauri (`WKWebView`) or Electron | `~/Library/Application Support/<AppId>/` |
| **Linux (x64, arm64)** | `.AppImage`, `.deb` | Tauri (WebKitGTK) or Electron | `$XDG_DATA_HOME/<AppId>/` |

## Packaging Guardrails
1. Bundle the static Vite build (`npm run build -- --base=/`) directly into desktop app resources for 100% offline launch.
2. Keep all UI, state, and business logic inside the React PWA; desktop wrapper code is strictly limited to window lifecycle, native printing, OS file dialogs, and atomic local storage IPC.
3. Keep `package.json` in the core web repository free of `electron` or `@tauri-apps/*` dependencies.

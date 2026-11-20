## Phase 1 — PWA Bridge, History Sync & Header Long-Press (`AskKim/Pedigree` in AI Studio)

### Prior Assumptions Check
- Confirm `WorkspaceRoute` in `src/hooks/useBarnStore.ts` still uses React `useState` with the 11 routes (`home`, `dashboard`, `herd`, `breeding`, `pedigree`, `reports`, `memo`, `importExport`, `settings`, `techyStuff`, `prompts`) and only calls `window.history.replaceState` once on boot to clear deep-link query params.
- Confirm `src/App.tsx` still renders `<header>` directly with a text-only `"Community Pedigree"` button in Zone 1 and opens `'techyStuff'` (`TechyStuffScreen`) via `SettingsAndSyncScreen.tsx`, `AsyncErrorToastHost.tsx`, or the offline badge.
- Confirm `npm run verify:improvements`, `npm test`, `npm run lint`, and `npm run build` still pass cleanly on the PWA repo before edits.

### Implementation Plan
- Create `src/native/pedigreeBridge.ts`: Build a zero-dependency, ES2018-compatible singleton bridge that detects `window.webkit.messageHandlers` or an Android `WebMessageListener` injection, provides `isNativeWrapper()` / `getPlatform()`, registers Back handlers (`registerBackHandler`), streams binary exports/shares (`exportOrShareBinary`), triggers printing (`requestPrint`), routes external/OAuth URLs (`openExternalUrl`), opens the native Developer Panel (`openNativeDevPanel`), queries honest container metadata (`getNativeContainerInfo`), and mirrors backup snapshots (`syncBackupSnapshotToNative`), falling back cleanly to normal browser behavior when not wrapped.
- Sync Modal & Route State with Browser History: Add lightweight history state entries for open dialogs and route steps so browser and WebView Back gestures unwind modals and step back toward `'home'` before returning `false` at the Home root.
- Add Header Icon with 800ms Long-Press (`src/App.tsx`): Place a compact app icon inside Zone 1 of `<header>` that keeps normal taps navigating to `'home'` while triggering `openNativeDevPanel()` (or routing to `'techyStuff'` in a standard browser) after an 800ms hold—canceling cleanly if pointer movement exceeds 10px.
- Hide Browser Install Banner in Wrapper & Report Honest Storage Status: Suppress the `"Install Offline Barn PWA"` prompt inside `src/App.tsx` when `isNativeWrapper()` is true, and update `src/storage/storageProtection.ts` and `src/components/DiagnosticsAndSupportPanel.tsx` to show native container isolation separately from `navigator.storage.persisted()` without faking `true`.
- Add Bridge Unit Tests: Add a Vitest unit test covering browser fallback behavior and Android/iOS message serialization without breaking existing `IMPROVEMENTS.md` invariants.

### Confirmed Edge-Case Decisions
- **WebMessageListener Global Name & Binary Envelope**:
  - Global injected object name: `window.pedigreeNative` (origin-locked strictly to `https://appassets.androidplatform.net` on Android and `window.location.origin` in TypeScript).
  - JSON control envelope: `{ type: string, requestId?: string, payload?: Record<string, unknown> }`.
  - Request/reply messages (`NATIVE_BACK` -> `NATIVE_BACK_RESULT`, `GET_CONTAINER_INFO` -> `CONTAINER_INFO_RESULT`) correlate via `requestId`.
  - Binary export/share (`exportOrShareBinary`): send JSON metadata first (`{ type: "BEGIN_BINARY_TRANSFER", requestId, payload: { filename, mimeType, mode, byteLength } }`), followed immediately by the sliced `ArrayBuffer` over Android `WebMessageCompat` (`MESSAGE_ARRAY_BUFFER`). Keep `bytes` as `Uint8Array` inside `pedigreeBridge.ts` so a future iOS `WKScriptMessageHandler` adapter can serialize it without changing caller code.
- **History Sync, `?emergency_reset=true` & LIFO Back Priority (`src/hooks/useBarnStore.ts`)**:
  - Preserve `?emergency_reset=true` so boot deep-link query cleanup never strips or interferes with the `index.html` emergency cache reset hatch.
  - Guard `popstate` handling with an `isApplyingHistoryStepRef` flag so state restoration never pushes duplicate history entries.
  - Maintain a deterministic LIFO back stack (`backStackRef`) that closes open modals first, then steps `WorkspaceRoute` back toward `'home'`, and returns `{ handled: false }` immediately at `'home'` with no open dialogs so Android's 250ms reply check finishes cleanly.
- **800ms Header Long-Press (`src/App.tsx`)**:
  - Add a compact app icon inside Zone 1 of `<header>` with `select-none`, `touch-manipulation`, and `onContextMenu={(e) => e.preventDefault()}` so Android's ~400–500ms contextmenu/selection popup does not interrupt the 800ms hold.
  - Cancel the 800ms timer if pointer movement exceeds 10px (`Math.hypot(dx, dy) > 10`).
  - When the 800ms hold triggers, set `longPressTriggeredRef.current = true` and call `pedigreeBridge.openNativeDevPanel()` (falling back to `store.setRoute('techyStuff')` in standard browsers), and swallow the trailing `onClick` so normal taps still navigate to `'home'`.
- **Async Storage Info & WebView `<109` Notice (`storageProtection.ts` & `DiagnosticsAndSupportPanel.tsx`)**:
  - Never spoof `navigator.storage.persisted()`—report it honestly alongside a separate `nativeContainerInfo` field (`NativeContainerInfo | null`).
  - `getNativeContainerInfo(timeoutMs = 400)` resolves to `null` immediately when `!isNativeWrapper()` or if no reply arrives within 400ms, never blocking initial render.
  - Surface a concise, non-blocking WebView `<109` (no OPFS; using IndexedDB/SQLite fallback) status line in `DiagnosticsAndSupportPanel.tsx` as well as in Phase 4's native Developer Panel.
- **`openExternalUrl(url, purpose)` Rules (`mailto:` & `https://`)**:
  - Parse with `new URL(url)` inside a `try/catch` and permit ONLY `protocol === 'https:'` or `protocol === 'mailto:'`.
  - Reject `http:`, `file:`, `javascript:`, `data:`, `blob:`, and malformed URLs (returning `false` and logging a diagnostic event). Phase 3 routes `mailto:` to `Intent.ACTION_SENDTO` and external `https://` / future OAuth flows to Android Custom Tabs / default browser.


# Legacy Browser Compatibility, Pre-Flight Guard & Graceful Degradation Plan

> **Status:** Approved & In Implementation  
> **Scope:** Item #1 from `docs/plans/suggestions-backlog.md` expanded with zero-bloat runtime fallbacks, Tier 1 / outdated browser export gates, and visible disabled controls with polite reason text.

---

## 1. Strategic Architecture & Decisions

### 1.1 Build Target vs. `@vitejs/plugin-legacy` Evaluation
Instead of adding `@vitejs/plugin-legacy`, the build locks to an **ES2020 mid-modern baseline** paired with targeted, zero-bloat vanilla runtime fallbacks and an early pre-flight guard:
- **Why `@vitejs/plugin-legacy` is avoided:** Dual-bundle builds duplicate JavaScript assets (`SystemJS` + `core-js` + `regenerator-runtime`), nearly doubling production bundle and offline PWA precache footprint while burning extra JS heap during parse/eval on Tier 1 and Tier 2 phones (`50–250 MB` JS heap). Furthermore, React 19, Tailwind CSS v4 (`@layer`, modern CSS custom properties), and `sql.js` WebAssembly do not run reliably on pre-2020 engines (such as iOS 12 Safari) even with transpiled JS.
- **Selected Approach (Zero-Bloat ES2020 Floor + CSS Target):**
  - Configure both TypeScript (`tsconfig.json`) and Vite (`vite.config.ts`) downleveling to **ES2020** (`chrome80`, `safari14`, `firefox80`, `edge80`) so modern syntax (optional chaining `?.`, nullish coalescing `??`) works cleanly on ~2020+ mobile browsers without bundle bloat.
  - Guard any post-ES2020 or restricted runtime APIs (`navigator.clipboard`, `navigator.share`, `navigator.storage.persist`, `showDirectoryPicker`, `Worker({ type: 'module' })`, `WebP` canvas encode, `WebAssembly`) with lightweight native fallbacks.
  - Pair ES2020 syntax compatibility with an **ES5-safe pre-flight guard** in `index.html` so unsupported browsers fail politely with actionable, calm guidance rather than a blank white screen.

---

### 1.2 Pre-Flight Boot Architecture (`index.html` → App Shell)

```
+-------------------------------------------------------------------+
|  1. Inline ES5 Pre-Flight Script (runs BEFORE ES module bundle)   |
+-------------------------------------------------------------------+
         |
         +---> Checks: ES basics (Promise, fetch, Map, Set, Find)
         |             + Storage readiness (indexedDB availability)
         |
         +---> [MISSING ES / PROMISE / INDEXEDDB]
         |        |
         |        +---> Halt bundle mount cleanly
         |        +---> Render self-contained Warm Parchment Notice:
         |              polite reason + browser upgrade / storage steps
         |
         +---> [CORE APIs PRESENT]
                  |
                  +---> Probe WebAssembly support (optional check)
                  +---> Store pre-flight capability flags globally
                  +---> Start Module Load Watchdog (catches ES module
                        or CSS parse failures on edge user-agents)
                  +---> Boot React App Shell
                           |
                           +---> [WASM MISSING/BLOCKED]
                           |        +---> Persist via IndexedDB JSON
                           |        +---> Show dismissible top notice
                           |              explaining SQLite fallback
                           |
                           +---> [ALL CORE + WASM READY]
                                    +---> Normal SQLite + OPFS boot
```

---

## 2. Capability Detection & Feature Gating Matrix

| Capability / Constraint | Affected Targets | App Behavior & Fallback Strategy | User Communication |
| :--- | :--- | :--- | :--- |
| **Missing `Promise`, `fetch`, core ES, or `indexedDB`** | Pre-2020 browsers, locked-down WebViews, disabled storage | Block React boot cleanly before mounting; never leave a blank screen | Polite Warm Parchment card naming missing APIs and recommending browser upgrade or relaxing private storage lock |
| **Missing or blocked `WebAssembly`** | iOS Lockdown Mode, restricted enterprise browsers, legacy builds | Boot normally into IndexedDB JSON snapshot persistence; keep raw SQLite import/export disabled | Polite dismissible banner at top of app + disabled reason note on Raw SQLite buttons |
| **Memory-heavy exports (Complete `.ZIP`, Photos `.ZIP`, Support Bundle `.ZIP` with photos)** | **Tier 1 (`<=1 GB` RAM)** OR **Outdated Browsers** / missing module Worker | Allow operation behind a **polite confirmation warning** rather than hard blocking | Confirmation notice explaining memory risk and advising **Timestamped Backup (.JSON)** if `.ZIP` fails |
| **Module Web Worker unavailable** | Browsers lacking `Worker({ type: 'module' })` or strict worker blocks | Yielded main-thread async execution with frame yields | Exposed in Device Capability & heavy `.ZIP` caution |
| **High-res image optimization & WebP** | Browsers without `WebP` canvas encoding or `createImageBitmap` | Auto-fallback to `<img>` decode + JPEG encoding; auto-step-down to Compact (`960px`) | Existing image compression notice updates cleanly |
| **OPFS Directory Storage unavailable** | Older Safari/Firefox/Chrome versions, private contexts | Fall back automatically to rolling IndexedDB snapshots | Backup Sink / Vault panel remains visible with clear IndexedDB fallback note |
| **File System Access (`showDirectoryPicker`)** | Safari, Firefox, iOS/Android mobile browsers | Keep **Connect Backup Sink Folder** & **Sync Local Folder** buttons visible in `disabled` state | Inline reason text (`aria-describedby`) explaining browser limitation and suggesting `.JSON` / Delta exports |
| **Clipboard Write (`navigator.clipboard`)** | Older browsers or restricted iframes | Inline copyable fallback box + `execCommand` best-effort fallback | Clear status feedback pointing to inline copy box or `.TXT`/`.MD` download |
| **Native Share (`navigator.share` with files)** | Desktop browsers or older mobile browsers | Automatic fallback to standard file download | Inline note explaining direct download mode |
| **Persistent Storage (`navigator.storage.persist`)** | Browsers lacking persistence lock API | Keep **Lock Persistent Storage** button visible in `disabled` state | Inline reason text explaining OS/browser automatic storage management |

---

## 3. Workstreams & Verification

1. **Workstream A (Build Floor):** Update `tsconfig.json` and `vite.config.ts` to `ES2020` + compatible CSS targets (`chrome80`, `safari14`, `firefox80`, `edge80`), keeping `src/core/` 100% pure TypeScript.
2. **Workstream B (Pre-Flight Guard):** Add ES5-safe pre-flight guard + module boot watchdog in `index.html`, cleared in `src/main.tsx`.
3. **Workstream C (Browser Compatibility Model & Tier 1 / Older Browser `.ZIP` Gate):** Extend `src/core/deviceCapability.ts` and `src/storage/deviceCapabilityDetector.ts` with pure browser feature classification (`assessBrowserCompatibility`, `getHeavyZipExportGate`), plus `.ZIP` warning confirmation modals/cards in Settings and Diagnostics recommending `.JSON` backup on failure.
4. **Workstream D (Visible Disabled Optional Controls + WASM Banner):** Keep optional browser-specific buttons visible in `disabled` state with polite reason text in `UnifiedBackupVaultPanel`, `SettingsAndSyncScreen`, and `DiagnosticsAndSupportPanel`, plus a dismissible WASM-fallback banner in `App.tsx`.
5. **Verification:** Expand Vitest coverage, register `IMP-019` in `src/core/improvementRegistry.ts`, and verify with `npm test`, `npm run verify:improvements`, `tsc --noEmit`, and `vite build`.

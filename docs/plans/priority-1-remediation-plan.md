# Community Pedigree — Priority 1 Security, Data-Loss & Offline Resilience Remediation Plan

**Target Scope:** `docs/plans/suggestions-backlog.md` Priority 1 (Current Remaining Items #1–#3; original #1–#3 completed, original #4 now #1 bypassed pending further research)  
**Aligned Standards:** `/.github/prompts/master_system_prompt.md` (Zero-Cloud Offline-First, Pure `src/core/`, ES2018+ Compatibility, OPFS/IndexedDB Integrity, `IMP-008`)  
**Status:** Workstreams 1, 2 & 3 Completed & Verified — Ready for Workstreams 5 & 6 (#1 Bypassed)

---

## Execution Scope & Confirmed Decisions

1. **Workstream 1 (Original `#1` — Barn Binder `.HTM` Primary Photo XSS):** **Completed & Verified** (`31` Vitest files / `199` tests passing, `23/23` `verify:improvements`, removed from `suggestions-backlog.md`).
2. **Workstream 2 (Original `#2` — Backup Sync Terminology + OPFS Retention on Sync Failure):** **Completed & Verified** (`32` Vitest files / `205` tests passing, `23/23` `verify:improvements`, removed from `suggestions-backlog.md`).
3. **Workstream 3 (Original `#3` — Cross-Tab Locking & Silent Tab B Reload):** **Completed & Verified** (`32` Vitest files / `205` tests passing, `23/23` `verify:improvements`, removed from `suggestions-backlog.md`).
4. **Workstream 4 (Current `#1` / Original `#4` — Outbox Sync Completeness & Reset State Cleanup):** **NEEDS FURTHER RESEARCH — BYPASSED FOR NOW.** Deferred per Kimberly's decision unless a blocking dependency arises in another workstream.
5. **Workstream 5 (Current `#2` / Original `#5` — ES2018+ 2018 Browser Compatibility):** Execute next — target 2018+ browsers (Chrome 68+ / Safari 12+ / Firefox 63+ / Edge 79+, and older where possible) via `FileReader` fallback & `es2018Shims.ts`.
6. **Workstream 6 (Current `#3` / Original `#6` — GitHub Pages Subpath Build & Required Bun Toolchain):** Execute after Workstream 5 — **stay strictly on Bun** in `.github/workflows/deploy-pages.yml`, add an explicit explanatory comment in code/workflow files so Bun is never replaced, and fix subpath asset/PWA manifest URLs without violating `IMP-008`.

---

## Workstream 1 — Barn Binder Primary Photo XSS Sanitization (`Completed & Verified`)
- **Target File:** `src/core/barnBinder.ts` (`lines 546–549`)
- **Status:** **Completed & Verified** (Removed from `docs/plans/suggestions-backlog.md`; `barnBinder.test.ts` 5/5 tests passing).
- **Resolution:**
  1. Replaced raw `startsWith('data:image/')` with `sanitizeSafeRasterImageDataUrl(primaryPhoto.dataUrl)`.
  2. Audited all `data:image/` prefix checks across `src/` — confirmed no other SVG data-URL bypasses exist.
  3. Added regression tests in `src/core/__tests__/barnBinder.test.ts` verifying `data:image/svg+xml,...` and HTML attribute breakout payloads are stripped from primary and gallery slots while safe raster images render.

---

## Workstream 2 — Rename "Backup Sink" → "Backup Sync" & Fix Pre-Prune Sync Failure Retention (`Completed & Verified`)
- **Target Files:** `src/storage/opfsStorage.ts`, `src/storage/localSyncChannels.ts`, `src/core/deviceCapability.ts`, `src/hooks/useBarnStore.ts`, `src/components/UnifiedBackupVaultPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/App.tsx`, `src/storage/__tests__/opfsStorage.test.ts`
- **Status:** **Completed & Verified** (Removed from `docs/plans/suggestions-backlog.md`; `opfsStorage.test.ts` 15/15 tests passing).
- **Resolution:**
  1. Renamed `"Backup Sink"` → **`"Backup Sync"`** across UI strings, types, function names, callbacks, and storage keys (`backup_sync_folder` / `pedigree.backupSyncMeta.v1`) while transparently migrating legacy `backup_sink_folder` / `pedigree.backupSinkMeta.v1` keys.
  2. Updated `enforceVaultRetention` to retain expiring local OPFS backups (`keepSet.add(item.key)`) and flag `retained: true` when an active sync folder fails with `permission_required` or `write_failed`, while keeping bounded FIFO caps on `not_configured` / `unsupported`.
  3. Added `flushOpfsBackupsToSyncFolder()` to offload retained backups cleanly after folder re-authorization and trim back down to Tier caps once verified synced.

---

## Workstream 3 — Cross-Tab IndexedDB Write Locking & Silent Tab B Reload (`Completed & Verified`)
- **Target Files:** `src/storage/storageAdapter.ts`, `src/storage/webSqliteAdapter.ts`, `src/storage/localSyncChannels.ts`, `src/hooks/useBarnStore.ts`, `src/storage/__tests__/crossTabLockAndReload.test.ts`
- **Status:** **Completed & Verified** (Removed from `docs/plans/suggestions-backlog.md`; `crossTabLockAndReload.test.ts` 4/4 tests passing).
- **Resolution:**
  1. Added non-reentrant `withCrossTabLock` (`navigator.locks` + per-tab sequential fallback) around `WebSqliteAdapter` lifecycle and all 19 incremental SQL/fallback mutations, persisted `IDB_WRITE_EPOCH_KEY` (`pedigree_write_epoch`) across `rebuildCleanDatabase`, and verified/reloaded stale `this.db` state inside the lock before reading/mutating.
  2. Added `publishCrossTabDbCommit` + `subscribeCrossTabDbCommits` (`BroadcastChannel` + `window` `'storage'` fallback with self-tab filtering and per-epoch dedupe) and wired `reloadFromAdapterSilently` + visibility-resume stale check in `useBarnStore.ts`.
  3. Serialized `allocateNextLogicalCounterLocked` and `appendSyncOperationsToIdb` (with `(device_id, logical_counter)` collision repair and minimal-mock safety guard) plus `replaceSyncOperationsInIdb` under Web Locks.

---

## Workstream 4 — Outbox Sync Completeness & Reset State Cleanup (Current `#1` / High Sync & Reset Integrity)
- **Status:** **NEEDS FURTHER RESEARCH — BYPASSED FOR NOW**
- **Reason:** Deferred per Kimberly's request (`master_system_prompt.md` Deferred Decisions Guardrail) pending deeper review of photo delta JSON sizing and factory-reset/replace sync history expectations.
- **Boundary Check:** Does not block Workstreams 1, 2, 3, 5, or 6. Cross-tab lock protection on `allocateNextLogicalCounter` in Workstream 3 remains purely concurrency-safe without changing outbox schema or reset rules.

---

## Workstream 5 — ES2018+ (2018 Browsers & Older Where Possible) Compatibility (Current `#2` / High Offline Compatibility)
- **Target Files:** `src/utils/es2018Shims.ts`, `src/storage/webImageOptimizer.ts:177`, `src/components/SettingsAndSyncScreen.tsx:807,951`, `src/components/WipedStorageRecoveryModal.tsx:115,123`, `src/components/ExternalImporterPanel.tsx:282`, `src/storage/opfsStorage.ts:326`
- **Confirmed Policy:** Strictly achieve at least 2018-era browser support (Chrome 68+, Safari 12+, Firefox 63+, Edge 79+)—and older where feasible without polyfill bloat.
- **Implementation Steps:**
  1. Export `readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer>` in `src/utils/es2018Shims.ts` using native `blob.arrayBuffer()` when available and `FileReader.prototype.readAsArrayBuffer` fallback otherwise.
  2. Install a non-enumerable `Blob.prototype.arrayBuffer` shim inside `ensureEs2018Globals()` when missing.
  3. Replace all direct `.arrayBuffer()` calls in `src/` with `readBlobAsArrayBuffer(...)`.
  4. Audit `src/` for any other post-2018 standard library calls (e.g., `String.prototype.replaceAll`, `Array.prototype.at`, `Array.prototype.flat`/`flatMap`, `BroadcastChannel` availability in Safari <15.4, `crypto.randomUUID`, etc.) and ensure graceful ES2018 fallbacks are in place.
  5. Add unit tests in `src/storage/__tests__/es2018AndPwaUpdate.test.ts` verifying `readBlobAsArrayBuffer` and `Blob.prototype.arrayBuffer` when native `.arrayBuffer` is absent.

---

## Workstream 6 — GitHub Pages Subpath Build & Required Bun Workflow (Current `#3` / High Deployment & CI)
- **Target Files:** `.github/workflows/deploy-pages.yml`, `.github/workflows/ci.yml`, `vite.config.ts`
- **Confirmed Policy:** GitHub Pages deployment **absolutely requires Bun** (previous attempts switching away from Bun broke GitHub Pages). An explicit explanatory comment must be placed directly inside `.github/workflows/deploy-pages.yml` (and referenced in `vite.config.ts`) so future updates never replace Bun.
- **Implementation Steps:**
  1. Keep `.github/workflows/deploy-pages.yml` on `oven-sh/setup-bun@v2` and `bun install` / `bun run ...`, adding a prominent inline comment warning that Bun is strictly required for GitHub Pages deployment and must not be changed to `npm`.
  2. Preserve `IMP-008` invariants in `vite.config.ts` (`const basePath = '/'`, `hmr: false`, `watch: null`, zero references to `process.env.VITE_BASE_PATH` or `process.env.DISABLE_HMR`).
  3. Pass the dynamic GitHub Pages subpath (`--base=${{ steps.pages.outputs.base_path }}`) via CLI in `.github/workflows/deploy-pages.yml` (and `.github/workflows/ci.yml`'s subpath check), and update `VitePWA` manifest/icon paths in `vite.config.ts` to use relative URLs (`'./'` / relative icons) so the built bundle, WASM assets, Service Worker, and PWA manifest resolve cleanly both at root `/` (AI Studio preview) and under `/Pedigree/` (GitHub Pages subpath).
  4. Verify generated `dist/index.html`, `dist/manifest.webmanifest`, and `dist/sw.js` paths on both root and subpath builds.

---

## Cross-Workstream Verification Gate

Before marking remaining Priority 1 workstreams done:
1. Run `npm test` (and `bun run test` parity check where applicable) including regression tests for `.HTM` SVG stripping, Backup Sync retention on `permission_required`/`write_failed`, cross-tab epoch reload/locks, and ES2018 `FileReader` fallback.
2. Run `npm run verify:improvements` (`23/23` PASS; keep `IMP-008` green and update `improvementRegistry.ts` / `IMPROVEMENTS.md` if new invariants are added).
3. Run `npm run lint` (`tsc --noEmit`) and `npm run build` (plus subpath CLI `--base=/Pedigree/` build verification).
4. Remove remaining completed items from `docs/plans/suggestions-backlog.md` while keeping `#1` (original `#4`) clearly marked `Needs Further Research`.

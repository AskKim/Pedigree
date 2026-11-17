# Community Pedigree — Amended Implementation Plan: Optimization, Accessibility & Next-Phase Resilience

> **Supersedes / Amends:** [`public/assets/aistudio/implementation_plan.md__1__b5d2b611.txt`](../../public/assets/aistudio/implementation_plan.md__1__b5d2b611.txt) (*Unified Coat Color Genetics, Variety Safety & Carrier Lineage Plan*)
> **Aligned With:** [`.github/prompts/master_system_prompt.md`](../../.github/prompts/master_system_prompt.md) · [`docs/plans/suggestions-backlog.md`](./suggestions-backlog.md) · [`ARCHITECTURE.md`](../../ARCHITECTURE.md)

---

## 1. Completed Milestone Verification (`implementation_plan.md__1__b5d2b611.txt`)

A full codebase audit confirmed that **both Milestone 1 and Milestone 2** of the *Unified Coat Color Genetics, Variety Safety & Carrier Lineage Plan* are implemented across core logic, storage migrations, exports, UI screens, and unit tests:

| Objective | Verified Modules | Status |
|---|---|---|
| Conservative presets + interactive verification gate (`A_ B_ C_ D_ ee __` for New Zealand Red) | `src/core/geneticsEngine.ts`, `src/components/AnimalEditorModal.tsx` | Complete |
| Standalone non-Mendelian `rufusLevel` (`High` / `Medium` / `Low`) | `src/core/models.ts`, `src/storage/webSqliteAdapter.ts`, `src/components/AnimalEditorModal.tsx`, `src/components/HerdScreen.tsx` | Complete |
| Hybrid `clearedCarrierOf` firewall + verified homozygous coat-locus clearance + independent Sire/Dam branch traversal | `src/core/carrierGenetics.ts`, `src/components/CarrierTraitCombobox.tsx`, `src/components/PedigreeScreen.tsx` | Complete |
| Herd Carrier Finder filter & Breeding Lab combined genetic + shared-carrier risk alerts | `src/components/HerdScreen.tsx`, `src/components/BreedingScreen.tsx` | Complete |
| Non-assuming HerdBoss / CSV / Universal pedigree importers | `src/core/importers/herdBossImporter.ts`, `src/core/importers/universalPedigreeImporter.ts`, `src/components/ExternalImporterPanel.tsx` | Complete |
| Full 11-species `SpeciesGeneticsSpec` registry, X-linked `O/o` sex-split Punnett rows, custom-species `null` fallback & lethal alerts | `src/core/geneticsEngine.ts`, `src/core/__tests__/geneticsEngine.test.ts` | Complete |
| Persistent expert-verification notice banner & print/export carrier parity | `src/components/ColorGeneticsNotice.tsx`, `src/core/syncAndExports.ts`, `src/core/barnBinder.ts`, `src/core/csvExport.ts` | Complete (PDF DTO parity closed in `IMP-021`) |

---

## 2. Audit Fixes Completed Now (`IMP-021` — Pre-Phase Optimization & Accessibility Pass)

Before launching Phase 1 below, a code, lifecycle, export, and WCAG keyboard-navigation audit closed the following loose ends:

1. **WAI-ARIA Combobox Keyboard Navigation & Blur Closure (`src/utils/comboboxNav.ts`):**
   - Upgraded `CarrierTraitCombobox`, `SearchableParentPicker`, and `ExternalImporterPanel`'s Default Species selector with `aria-activedescendant`, `ArrowDown` / `ArrowUp` / `Home` / `End` option traversal (skipping disabled options via `stepEnabledComboboxIndex`), active visual highlights, `scrollIntoView({ block: 'nearest' })`, and `Enter` selection.
   - Added `onBlur` container boundary handling to `ExternalImporterPanel`'s Default Species combobox so keyboard `Tab` navigation closes `#importer-species-listbox` reliably.
2. **Global Shortcuts Coverage & Widget Guards (`src/App.tsx`, `src/components/SettingsAndSyncScreen.tsx`):**
   - Assigned non-conflicting shortcuts **`O` (Reports)** and **`S` (Import & Settings)** alongside existing `H`, `D`, `R`, `B`, `P`, and `?`, synchronized across `navItems`, `aria-keyshortcuts`, desktop footer hints, the Shortcuts Help modal, and Settings' Keyboard Shortcuts Reference panel.
   - Guarded `onGlobalShortcut` against IME composition (`e.isComposing`), open `[aria-modal="true"]` dialogs, and focus inside interactive ARIA widgets (`[role="combobox"]`, `[role="listbox"]`, `[role="menu"]`, `[role="slider"]`, `[role="application"]`).
3. **Focus Visibility, Pedigree Tab-Scroll & Semantic Polish:**
   - Restored visible `focus-visible` outlines on Home species title buttons (`HomeSpeciesScreen.tsx`) and Pedigree node / `"Link"` triggers (`PedigreeScreen.tsx`) with automatic `scrollIntoView({ block: 'nearest', inline: 'nearest' })` on focus across 3–6 gen trees.
   - Wrapped clickable showcase images in `AnimalPhotoGallery.tsx` inside accessible `<button>` triggers, prevented scroll side effects on Lightbox `ArrowLeft` / `ArrowRight`, added `role="img"` summary labels on `WeightTrendSvg` (`HerdScreen.tsx`), and added `aria-pressed` state to `SpeciesMemoScreen.tsx` mode toggles.
4. **DOM Observer Coalescing & PDF DTO Export Parity:**
   - Coalesced `App.tsx`'s `document.body` `MutationObserver` through `requestAnimationFrame` (with `cancelAnimationFrame` cleanup) and suppressed no-op state updates, removing synchronous `querySelector` overhead on keystrokes.
   - Passed `{ herdById: herdMap, includeCleared: true, includeLineage: true }` into `buildPdfReadyBarnSnapshot` (`src/core/syncAndExports.ts`) so PDF DTO output matches `.HTM`, Barn Binders, and CSV exports.

---

## 3. Next-Phase Roadmap: Optimization, Virtualization & Offline Update Resilience

Grounded in [`docs/plans/suggestions-backlog.md`](./suggestions-backlog.md), the next execution phase locks down mobile DOM budgets, update control, and backup/sync verification in two focused stages while preserving 100% pure TypeScript inside `src/core/` (Expo / React Native parity).

### Stage A — Pedigree DOM Virtualization & App-Shell Update Governance *(Completed — `IMP-022`)*

1. **Lazy Generation 4+ Ancestor Branch Expansion (`PedigreeScreen.tsx`, `pedigreeCalculator.ts`) — *Complete (`IMP-022`)***
   - *Implemented:* Initial chart SVG connectors and ancestor cards remain bounded to Subject + Generations 1–3 (`15` slots max) by default via `buildPedigreeBranchViewport`, expanding Generation 4–6 (`+16` to `+64` slots) only per-branch (`expandedGen3Branches`) or via toolbar toggle. Dynamic bottom-up Gen-3 band layout keeps collapsed trees compact, keyboard `Tab` flow stays intact, and `generateEvansHtmPedigree` / Barn Binder printouts continue rendering full requested depths.
2. **PWA Update Governor (`auto` / `notify` / `pinned`), Offline Toggle & Connectivity Probe (`pwaUpdateManager.ts`, `storageProtection.ts`, `useBarnStore.ts`, `SettingsAndSyncScreen.tsx`, `App.tsx`) — *Complete (`IMP-022`)***
   - *Implemented:* Decoupled service worker updates from raw `navigator.onLine` via `pedigree_pwa_update_policy_v1` (`auto` | `notify` | `pinned`), added persisted Manual App Offline Mode (`pedigree_manual_offline_v1`) holding calendar/sync checks locally without device airplane mode, and added `probeNetworkConnectivity` using `AbortController` against uncached `./version.json` (plus HTTP `Date` skew capture and HTML captive-portal rejection).
3. **Uncached `version.json` / `status.json` Upgrade Gate & Pre-Upgrade Verification (`public/`, `upgradeGate.ts`, `backupVault.ts`, `pwaUpdateManager.ts`, `vite.config.ts`) — *Complete (`IMP-022`)***
   - *Implemented:* Added uncached `public/version.json` (`appVersion`, `schemaVersion`, `minDirectUpgradeSchema`) and `public/status.json` (`allowUpdates`, `revokedVersions`) with `Cache-Control: no-store` middleware and Workbox `navigateFallbackDenylist` exclusions. `applyPwaUpdateNow` runs pre-flight `evaluateUpgradeGate` to block revoked builds or paused releases, requires SHA-256-verified `_schemaVersion` `pre_upgrade` JSON backups (`buildVerifiedPreUpgradeJsonBackup`) when `schemaDelta >= 2`, and triggers Safe-Harbor Archive & Re-Import instructions if `currentSchemaVersion < minDirectUpgradeSchema`.

### Stage B — Storage Pruning, Pre-Restore Safety & Clock-Safe Sync *(Completed — `IMP-023`)*

4. **Stale Photo Breakdown & Downscale Pruner (`photoMaintenance.ts`, `webImageOptimizer.ts`, `DiagnosticsAndSupportPanel.tsx`) — *Complete (`IMP-023`)***
   - *Implemented:* Added `analyzePhotoStorageFootprintPure`, `removeOrphanPhotosFromSnapshotPure`, `pruneFullResPayloadsFromSnapshotPure`, and `reoptimizeAnimalPhotoRecord` (honoring Never-Inflate guards), surfaced in `DiagnosticsAndSupportPanel` with per-species byte breakdowns, orphan removal, oversized batch re-optimization, and 2-step safety-snapshotted full-res compaction keeping thumbnails.
5. **Pre-Restore Archive Inspector (`archiveInspector.ts`, `archiveAndImport.worker.ts`, `webSqliteAdapter.ts`, `SettingsAndSyncScreen.tsx`) — *Complete (`IMP-023`)***
   - *Implemented:* Added off-thread dry-run inspection (`inspectBackupArchiveOffThread`, `inspectSnapshotBeforeRestorePure`, and non-destructive `inspectRawSqliteBytes`) displaying format, species breakdown, active/archived animal & photo byte counts, detected tattoo/sex/health conflicts, and replace-vs-merge impact before committing `.ZIP`/`.JSON`/`.SQLITE` restores.
6. **Device Clock Skew Delta Compensation, Monotonic `_rev` & Deterministic Calendar IDs (`storageProtection.ts`, `syncOutbox.ts`, `calendarExport.ts`, `googleCalendarClient.ts`, `useBarnStore.ts`, `App.tsx`) — *Complete (`IMP-023`)***
   - *Implemented:* Persisted server HTTP `Date` skew (`recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc`), surfaced a dismissible Drift Nudge Banner in `App.tsx` when `|clockSkewMs| >= 5 min`, added monotonic `_rev` / `record_rev` priority (`compareSameEntitySyncOperations`, `bumpRecordRevision`), and generated deterministic `[a-v0-9]` Google Calendar IDs (`buildDeterministicGoogleCalendarEventId`) with automatic HTTP `409` `PUT` update-in-place retry.
7. **Optional Passphrase Encryption for Shared `.ZIP` Backups & Sync Folders (`encryptedExport.ts`, `passphraseCrypto.ts`, `localSyncChannels.ts`, `SettingsAndSyncScreen.tsx`) — *Complete (`IMP-023`)***
   - *Implemented:* Added opt-in client-side Web Crypto PBKDF2-SHA256 + AES-256-GCM encryption for `.ZIP`/`.JSON` backups and folder/delta sync (`parseDeltaFileTextAsync`, `wrapEncryptedZipContainer`) with strictly in-memory passphrases while preserving 1-click unencrypted exports as the default.

---

## 4. Standing Guardrails & Verification Gate

Every increment under this amended plan must maintain:
- **Zero DOM / Node Coupling in `src/core/`** (tested directly via Vitest in pure JS runtime).
- **Keyboard & Focus Accessibility:** Zero stripped outlines without `focus-visible` rings, complete `aria-activedescendant` + `Arrow`/`Home`/`End`/`Escape` handling on custom widgets, and `useAccessibleDialog` focus traps on every modal.
- **Deferred Architectural Scope (Unchanged from `master_system_prompt.md`):** Keep `EXPO` / React Native builds, Firebase/Supabase hosted cloud backend + auth, and dark-mode `.HTM` printing excluded from core implementation unless explicitly promoted.
- **Verification Gate Before Merging:**
  1. `npm test` (all Vitest suites green)
  2. `npm run verify:improvements` (all `IMP-*` invariants intact)
  3. `npm run lint && npm run build` (strict TypeScript + production bundle clean)

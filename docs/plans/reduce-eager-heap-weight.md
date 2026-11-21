# Implementation Plan: Audit & Reduce Eager/Resident JS Heap Weight (2,000+ Animals)

**Status:** In Progress  
**Created:** 2026-11-21

## Hard Exclusions (Must Preserve)
- NO server-side storage of user information.
- NO community sales board or marketplace features.
- NO new encryption features (`src/core/encryptedExport.ts` / `src/storage/passphraseCrypto.ts` untouched).
- NO PDF layout redesign (`src/core/barnBinder.ts` / `src/core/pdfExporter.ts` / `src/components/PrintPreviewModal.tsx` layout untouched).
- Strict TypeScript (`tsc --noEmit`, zero `as any` / `@ts-ignore` / `@ts-expect-error`).
- Keep `src/core/` 100% pure TypeScript with zero DOM/`window` dependencies.
- Keep `IMPROVEMENTS.md` and `src/core/improvementRegistry.ts` invariants intact.

## Baseline Audit Findings
1. **Initial Entry Chunk Bloat (`dist/assets/index-*.js` = 1,594.03 kB / 447.32 kB gzip):**
   - `src/hooks/useBarnStore.ts` statically imports `offThreadWorkerClient.ts`, which statically imports `backupArchive.ts` (`fflate`), `archiveInspector.ts`, `supportBundle.ts`, and `importers/registry.ts` (all CSV/Evans/PDF importers) even though those are only needed for Worker fallbacks on Import/Export/Diagnostics routes.
   - `src/hooks/useBarnStore.ts` statically imports `googleCalendarClient.ts`, which statically imports `firebase/app` + `firebase/auth` and runs `initGoogleCalendarAuth()` on boot even though `cachedAccessToken` starts `null` and Google Calendar sync is opt-in.
   - `src/App.tsx` statically imports `WipedStorageRecoveryModal` even when `wipedRecoveryContext?.detected` is false.
   - `src/components/HerdScreen.tsx` (138.20 kB chunk) statically imports `AnimalEditorModal` (~101 kB), `PrintPreviewModal` (~92 kB), `SpeciesMigrationModal`, and `ArchivedHerdsModal`, pulling all heavy editor/print UI into the Herd list view immediately.
2. **Eager/Resident Heap & Per-Render Work (`useBarnStore.ts`, `webSqliteAdapter.ts`, `HerdScreen.tsx`):**
   - `useBarnStore.ts` `coiByAnimalId` eagerly runs `createSpeciesCoiEvaluator` across all `animals` (2,000+ active + archived) on `'herd' | 'pedigree' | 'breeding'` routes even though `BreedingScreen` never reads `coiByAnimalId`, `PedigreeScreen` only needs the selected `subject`, and `HerdScreen` only renders the virtualized `visibleAnimals` slice + `activeAnimal`.
   - `useBarnStore.ts` `baseSpeciesData` & `conflictsBySpeciesAnimalId` eagerly filter/sort all 15 species collections and run `analyzeBarnAnimalConflicts` even when on non-species routes (`home`, `settings`, `importExport`, `techyStuff`, `prompts`, `suggestions`).
   - `useBarnStore.ts` `pedigreeAncestorCacheRef` and `loadedPedigreeArchiveKeysRef` are not cleared on `selectSpeciesWorkspace` or `onHidden` background freeze.
   - `useBarnStore.ts` `nextEntityRev` linearly scans `syncOperationsRef.current` on every write instead of using an O(1) `maxRevByEntityRef` index.
   - `webSqliteAdapter.ts` `loadSnapshotUnlocked({ lightweightPhotos: true })` strips `animal_photos.data_url`, but still loads `feed_batches.tag_photo_data_url` and `ledger_entries.receipt_photo_data_url` full-res data URLs into reactive `snapshot` memory (when `lightweightPhotos: true` only needs thumbnails until viewed/exported).
   - `HerdScreen.tsx` `carrierAnalysisById` eagerly runs `analyzeAnimalCarrierLineage(a, herdById)` for all 2,000+ animals even when `carrierFilterMode === 'all'` and `carrierTraitQuery` is empty; when no carrier filter is active, only `visibleAnimals` + `activeAnimal` need lineage analysis.
   - `HerdScreen.tsx` `herdVirtual` uses `overscan: 8` and `initialFallbackCount: HERD_PAGE_SIZE` (50) regardless of Low-Memory / constrained device tier; constrained/Low-Memory devices can use leaner `overscan` (3) and `initialFallbackCount` (20) while keeping `HERD_PAGE_SIZE = 50` exported for invariants.
3. **Unbounded Dropdown DOM Nodes (`SearchableParentPicker.tsx`):**
   - Renders all `selectableOptions` into the DOM at once (2,000+ `<button role="option">` items per Sire/Dam picker when "Include Archived" is checked).
   - Allocates `[c.name, c.tattoo, ...].join(' ').toLowerCase()` per candidate per keystroke and keeps an unbounded `optionRefs` array.
   - Needs `useVirtualWindow` virtualization on the listbox, keyboard `activeIndex` scroll sync, allocation-free filtering, and bounded `Map` refs.

## Progress Checklist
- [x] Step 1: Inspect `useBarnStore.ts`, `App.tsx`, `lazyRoute.tsx`, `HerdScreen.tsx`, `SearchableParentPicker.tsx`, and related bundle/storage paths; record baseline audit.
- [ ] Step 2: Reduce initial entry chunk & cold route/modal eager imports (`offThreadWorkerClient.ts` dynamic fallback imports, `googleCalendarClient.ts` lazy Firebase Auth, `App.tsx` lazy `WipedStorageRecoveryModal`, `HerdScreen.tsx` lazy modals).
- [ ] Step 3: Trim resident heap & eager cross-species/photo/derived caches (`useBarnStore.ts` lazy/scoped `coiByAnimalId`, non-species route lightweight `baseSpeciesData`/conflict skip, species-switch & `onHidden` cache eviction, O(1) `maxRevByEntityRef`; `webSqliteAdapter.ts` lightweight feed/receipt photo loading + on-demand fetchers).
- [ ] Step 4: Keep Herd list & parent picker DOM/CPU lean on 2,000+ animals and Low-Memory devices (`HerdScreen.tsx` on-demand carrier analysis for visible rows + constrained virtual overscan/fallback; `SearchableParentPicker.tsx` virtualized listbox via `useVirtualWindow`, allocation-free filtering, Map refs).
- [ ] Step 5: Add/update unit tests for new lazy/virtualization/lightweight-load invariants and sync `IMPROVEMENTS.md` / `src/core/improvementRegistry.ts` if needed.
- [ ] Step 6: Run `npm test`, `npm run verify:improvements`, `npm run lint`, and `npm run build`; update this plan to `Complete`.

# Active Backlog Plan: "Barn Bench" Fast Sequential Batch Entry Mode

- **Backlog Item:** #1 — `"Barn Bench" Fast Sequential Batch Entry Mode`
- **New Improvement ID:** `IMP-034`
- **Status:** Implementing

## Architecture & File Plan

1. **Pure Domain Module (`src/core/barnBench.ts`)** (zero DOM/window dependencies)
   - Define `BarnBenchFocusMode` (`'all' | 'weight' | 'bcs' | 'nail_trim' | 'cage_move'`), `BarnBenchStatusFilter`, `BarnBenchRowItem`, `BarnBenchBatchEntryDraft`, and `BarnBenchCommitPlan`.
   - `extractSpeciesCageSections(cages, speciesName)`: returns sorted unique cage row/section labels for a species.
   - `buildBarnBenchQueue(...)`: strictly species-isolated (`isSameSpecies`), filters to housing-eligible animals (`isCageOccupyingAnimal`), filters by section (`ALL`, `UNASSIGNED`, or section name), status (`housing`, `active_only`, `junior_only`), and search query; sorts in natural cage-walkthrough order (`section` -> natural numeric `cageLocation` -> `name` -> `tattoo`); enriches each row with latest BCS and latest `Grooming & Hoof` date in O(L) pass.
   - `buildBarnBenchCommitPlan(animal, draft, timestampIso)`: pure builder producing `CareLog[]` (`Weight Check`, `Health Score / BCS`, `Grooming & Hoof`), optional `updatedAnimal` (`weightGrams`, `cageLocation`, bumped `_rev`), and readable summary parts.
   - `findNextPendingBenchIndex(...)`: advances to the next unlogged row (or next sequential row) cleanly.

2. **Storage & Store (`src/storage/storageAdapter.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`)**
   - Add optional `saveCareLogsBatch?(logs: CareLog[]): Promise<void>` on `StorageAdapter` and implement transactional `saveCareLogsBatch` on `WebSqliteAdapter`.
   - Add `'bench'` to `WorkspaceRoute` in `src/hooks/useBarnStore.ts`.
   - Add queued FIFO `commitBarnBenchEntry(draft: BarnBenchBatchEntryDraft)` in `useBarnStore.ts` that persists generated `CareLog`s and `Animal` patches atomically, records field-level `syncOutbox` operations, reloads snapshot, and returns a typed result (`{ ok: boolean; animalId: string; summary: string[] }`).

3. **UI Screen & Navigation (`src/components/BarnBenchScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/HerdScreen.tsx`, `src/App.tsx`)**
   - Create `BarnBenchScreen.tsx`: tap-friendly sequential Barn Bench chore sheet with species/cage-row filters, focus mode pills, auto-advance toggle, active cage card (weight in species unit, 1-tap BCS pills + custom input, 1-tap nail trim, cage move selector with inline `evaluateCageAssignmentCapacityWarning` soft confirmation, quick note, Prev/Skip/Save & Next with `useAsyncSubmitLock`), and clickable walkthrough queue below.
   - Lazy-load `BarnBenchScreen` via `lazyNamedRoute` in `src/App.tsx` under `route === 'bench'`, add `K` keyboard shortcut (Barn Bench) + help entry, and add launch buttons in `SpeciesDashboardScreen.tsx` and `HerdScreen.tsx`.

4. **Tests & Registry Sync**
   - Add comprehensive unit tests in `src/core/__tests__/barnBench.test.ts`.
   - Register `IMP-034` in `src/core/improvementRegistry.ts`, update `IMPROVEMENTS.md`, and run `npm test`, `npm run verify:improvements`, `npm run lint`, and `npm run build`.

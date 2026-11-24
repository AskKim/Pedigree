# Community Pedigree Project — Architecture & Expo Migration Guide

- **Project Name:** Community Pedigree Project
- **App Name:** Community Pedigree
- **Repository:** [`pedigree`](https://github.com/pedigree)
- **Package Name:** `pedigree`
- **License:** Apache-2.0

## Cross-Platform & Expo Migration Guardrails

1. **100% Pure TypeScript Domain Core (`src/core/`):**
   - `models.ts`: Canonical entities (`BarnSettings`, `SpeciesProfile`, `Animal`, `CageLocation`, `BreedingRecord`, `BarnTask`, `CareLog`, `ShowEvent`) with globally unique `id` (UUID v4) and ISO-8601 UTC `updatedAt` timestamps.
   - `pedigreeCalculator.ts`: Recursive pedigree slot builder, topological Wright COI / coancestry engine, path contribution decomposition, and cycle prevention.
   - `geneticsEngine.ts`: ARBA coat color loci (`A, B, C, D, E, W, En, V, Du`), variety baseline auto-fill, parent/offspring recessive allele inference, and Punnett test-breeding simulator.
   - `masterTaskList.ts`: Automated Master Task List chore cascading from configurable species milestone offsets.
   - `syncAndExports.ts`: Deterministic UUID + ISO-8601 `updatedAt` multi-device merge engine, `.json` (v5 + legacy v3/v4 import), `.csv`, Evans-compatible `.HTM` pedigrees, 4"×2" thermal cage cards, and PDF-ready DTO snapshots.
   - **Zero Browser DOM Coupling:** None of the modules in `src/core/` touch `window` or `document`, so `src/core/` copies directly into an Expo / React Native codebase untouched.

2. **Pluggable Storage Adapter (`src/storage/`):**
   - `storageAdapter.ts`: Defines the `StorageAdapter` contract.
   - `webSqliteAdapter.ts`: Executes standard relational SQLite (`PEDIGREE_SQLITE_SCHEMA`) in the browser via `sql.js` WebAssembly and persists the unencrypted `.sqlite` binary inside IndexedDB.
   - **Why SQLite-First Wins Cross-Platform:** The exact same `PEDIGREE_SQLITE_SCHEMA` SQL runs in `expo-sqlite` on Android/iOS, and users can export/sync a literal unencrypted `.sqlite` database file across devices via Google Drive, OneDrive, Dropbox, or SyncThing.

3. **Strict Species Isolation:**
   - Every animal, breeding, task, cage, care log, and show carries an explicit `species` field.
   - `useBarnStore.ts` computes `activeSpeciesData` via case-insensitive `isSameSpecies(...)` filtering and resets selected animal IDs on species switch so records from one species never leak into another species' Herd, Breeding, or Pedigree screens.

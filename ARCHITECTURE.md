# Community Pedigree Project — Architecture & Expo Migration Guide

- **Project Name:** Community Pedigree Project
- **App Name:** Community Pedigree
- **Repository:** [`AskKim/Pedigree`](https://github.com/AskKim/Pedigree)
- **Package Name:** `pedigree`
- **License:** GNU AGPLv3 (`AGPL-3.0-or-later`) — see [LICENSE](./LICENSE)

## Cross-Platform & Expo Migration Guardrails

1. **100% Pure TypeScript Domain Core (`src/core/`):**
   - `models.ts`: Canonical entities (`BarnSettings`, `SpeciesProfile`, `Animal`, `CageLocation`, `BreedingRecord`, `BarnTask`, `CareLog`, `ShowEvent`) with globally unique `id` (UUID v4), ISO-8601 UTC `updatedAt` timestamps, per-species weight unit overrides (`lbs_oz`, `lbs`, `kg`, `grams`), and species-aware identifier labels.
   - `pedigreeCalculator.ts`: Recursive pedigree slot builder (3–6 gen), exact topological Wright COI / coancestry engine, depth-8 shared ancestor path contributions, pedigree completeness summaries, and cycle prevention.
   - `geneticsEngine.ts`: Multi-species coat color loci, allele inference, and Punnett test-breeding simulator across 11 predefined species plus custom-species fallback (flagged under development / incomplete via `ColorGeneticsNotice` and export notices pending domain-expert sign-off).
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

4. **Documentation & Backlog (`docs/plans/`):**
   - Active unimplemented suggestions live in `docs/plans/suggestions-backlog.md` alongside `ARCHITECTURE.md` and `IMPROVEMENTS.md` so roadmap items persist across GitHub syncs and AI Studio reinstalls.

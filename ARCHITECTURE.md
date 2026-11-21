# Community Pedigree Project — Architecture & Expo Migration Guide

- **Project Name:** Community Pedigree Project
- **App Name:** Community Pedigree
- **Repository:** [`AskKim/Pedigree`](https://github.com/AskKim/Pedigree)
- **Package Name:** `pedigree`
- **License:** GNU AGPLv3 (`AGPL-3.0-or-later`) — see [LICENSE](./LICENSE)

## Cross-Platform & Expo Migration Guardrails

1. **100% Pure TypeScript Domain Core (`src/core/`):**
   - `models.ts`: Canonical entities (`BarnSettings`, `SpeciesProfile`, `Animal`, `CageLocation`, `BreedingRecord`, `BarnTask`, `CareLog`, `ShowEvent`) with globally unique `id` (UUID v4), ISO-8601 UTC `updatedAt` timestamps, per-species weight unit overrides (`lbs_oz`, `lbs`, `kg`, `grams`), and species-aware identifier labels.
   - `pedigreeCalculator.ts`: Recursive pedigree slot builder (3–6 gen), lazy Gen 4+ branch viewport helper (`buildPedigreeBranchViewport`), exact topological Wright COI / coancestry engine, depth-8 shared ancestor path contributions, pedigree completeness summaries, and cycle prevention.
   - `geneticsEngine.ts`: Multi-species coat color loci, allele inference, and Punnett test-breeding simulator across 11 predefined species plus custom-species fallback (flagged under development / incomplete via `ColorGeneticsNotice` and export notices pending domain-expert sign-off).
   - `taskMaster.ts`: Automated Master Task List chore cascading from configurable species milestone offsets, per-breed schedule overrides, and post-birth task recalculation.
   - `showResults.ts`: Structured per-animal `ShowEvent.results` normalization, XSS-safe E-Leg certificate photo sanitization, Grand Championship (3-leg / multi-judge) progress computation, `Animal.legsCount` delta reconciliation, and pedigree/report/binder show honor summaries.
   - `syncAndExports.ts`: Deterministic UUID + ISO-8601 `updatedAt` multi-device merge engine, `.json` (v5 + legacy v3/v4 import), `.csv`, Evans-compatible `.HTM` pedigrees, 4"×2" thermal cage cards, and PDF-ready DTO snapshots.
   - `backupVault.ts`, `upgradeGate.ts`, `archiveInspector.ts`, `encryptedExport.ts`, `photoMaintenance.ts`: `_schemaVersion`-stamped SHA-256 vault/pre-upgrade backup verification, pure uncached `version.json`/`status.json` release gate evaluation (`revokedVersions`, `schemaDelta >= 2`, Safe-Harbor floor), dry-run pre-restore species/conflict inspection, pure PBKDF2/AES-GCM container framing, and photo storage/orphan footprint auditing.
   - `syncOutbox.ts`, `calendarExport.ts`, & `supportBundle.ts`: Monotonic per-record `_rev` counters paired with clock-skew-adjusted timestamps (`compareSameEntitySyncOperations`), deterministic base32hex Google Calendar event IDs, and pure diagnostic support bundle packaging.
   - **Zero Browser DOM Coupling:** None of the modules in `src/core/` touch `window` or `document` or import from `src/storage/`, `src/hooks/`, `src/components/`, or `src/utils/`, so `src/core/` copies directly into an Expo / React Native codebase untouched.

2. **Pluggable Storage Adapter (`src/storage/`) & Optional Client OAuth (`src/utils/`):**
   - `storageAdapter.ts`: Defines the `StorageAdapter` contract.
   - `webSqliteAdapter.ts`: Executes standard relational SQLite (`PEDIGREE_SQLITE_SCHEMA`) in the browser via `sql.js` WebAssembly and persists the unencrypted `.sqlite` binary inside IndexedDB.
   - **Why SQLite-First Wins Cross-Platform:** The exact same `PEDIGREE_SQLITE_SCHEMA` SQL runs in `expo-sqlite` on Android/iOS, and users can export/sync a literal unencrypted `.sqlite` database file across devices via Google Drive, OneDrive, Dropbox, or SyncThing.
   - **Strictly Optional Google Calendar OAuth:** `firebase` (`firebase/app`, `firebase/auth`) + `firebase-applet-config.json` are scoped exclusively to `src/utils/googleCalendarClient.ts` for opt-in client-side Google Calendar sign-in; all core barn workflows remain 100% offline-first with `.ics` fallback.

3. **Strict Species Isolation:**
   - Every animal, breeding, task, cage, care log, and show carries an explicit `species` field.
   - `useBarnStore.ts` computes `activeSpeciesData` via case-insensitive `isSameSpecies(...)` filtering and resets selected animal IDs on species switch so records from one species never leak into another species' Herd, Breeding, or Pedigree screens.

4. **Documentation & Backlog (`docs/plans/`):**
   - Active unimplemented suggestions live in `docs/plans/suggestions-backlog.md` alongside `ARCHITECTURE.md` and `IMPROVEMENTS.md` so roadmap items persist across GitHub syncs and AI Studio reinstalls.

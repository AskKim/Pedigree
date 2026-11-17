# Implementation Plan: Hybrid OPFS Storage Architecture, Unified Backup Vault, Archived Herds & Eviction Recovery

This plan details the architecture and implementation steps for backlog Item #8 (**OPFS Ephemeral Export Scratchpad, Backup Vault & Archived Herds**), integrating Origin Private File System (`navigator.storage.getDirectory`) alongside the existing `sql.js` WASM SQLite and IndexedDB persistence layers without sacrificing zero-cloud sovereignty or pure cross-platform domain separation.

---

## 1. Confirmed Product & Architecture Decisions

Based on our design alignment, the implementation delivers:

1. **Unified Backup Vault (OPFS + IndexedDB Fallback):** Consolidates Settings recovery into a single **Unified Backup Vault** panel displaying OPFS vault snapshots (`/backups`) alongside IndexedDB rolling snapshots as automatic fallback on browsers without OPFS support.
2. **Full Offload & Restore for Archived Herds (`/archives`):** Implements full per-animal/cohort offload to compressed OPFS archives for **Sold** or **Deceased** animals (triggered via user prompt on status change, manual selection in Herd Registry, or an opt-in Settings rule) with one-click re-hydration back into the active database.
3. **Pause & Prompt on Wiped Browser Storage:** Detects returning users whose browser storage was evicted (e.g., iOS Safari 7-day tab eviction) and pauses startup before silently re-seeding sample herds, presenting an accessible recovery dialog to restore from the latest OPFS backup, upload a `.JSON`/`.ZIP`/`.SQLITE` file, or explicitly start fresh.
4. **Combined Automatic + User-Prompted Vault Backups:** Runs automatic **monthly** backups (retaining the newest **6**) and **pre-upgrade / pre-migration** safety backups (retaining the newest **3**) in OPFS `/backups`, paired with user-prompted vault saves inside unbacked-edits reminders, pre-reset flows, and an explicit on-demand **Save to Vault** control.

---

## 2. System & Storage Architecture

The storage architecture maintains strict separation between **pure TypeScript domain logic** (zero DOM or browser APIs so business rules stay portable to mobile) and **browser storage adapters / UI controllers**.

```
+-----------------------------------------------------------------------+
|                       React UI & Store Controller                     |
|   App Root · Unified Backup Vault · Archived Herds View · Recovery    |
+-----------------------------------+-----------------------------------+
                                    |
        +---------------------------+---------------------------+
        v                                                       v
+-------------------------------+       +-------------------------------+
|   Pure Core Domain Services   |       |   Browser OPFS & Storage I/O  |
|   (Zero DOM / Storage APIs)   |       |                               |
|                               |       |  [OPFS Root Directory]        |
| - Backup Schema Envelope      |       |   ├── /tmp       (Scratchpad) |
|   (_schemaVersion, checksum)  |       |   ├── /backups   (Vault)      |
| - Shape Migration & Root      |       |   └── /archives  (Retired)    |
|   JSON Validation             |       |                               |
| - Archived Cohort Packager    |       |  [SQLite WASM + IndexedDB]    |
|   (.ZIP + Pedigree Stubs)     |       |   ├── Primary .sqlite blob    |
| - Export Canary Round-Trip    |       |   ├── JSON fallback mirror    |
|   Verifier                    |       |   └── Rolling IDB snapshots   |
+-------------------------------+       +-------------------------------+
```

---

## 3. Core Engineering Components

### A. OPFS Core Service & Safe Handle Lifecycle
A dedicated browser storage adapter (`src/storage/opfsStorage.ts`) manages `navigator.storage?.getDirectory()` behind strict feature detection (`isOpfsSupported()`) and defensive handle guarantees:

- **Namespace Layout:** Lazily initializes three isolated subdirectories under the OPFS root: `/tmp`, `/backups`, and `/archives`.
- **Safe Handle Wrapper:** Every read, write, and stream operation wraps `FileSystemWritableFileStream` in `try / finally` blocks guaranteeing `.close()` execution even after aborts or mid-stream failures.
- **Leak-Free Download / Share Pipeline:** Helper functions reading temporary OPFS files into downloadable `File` / `Blob` objects always call `URL.revokeObjectURL()` deterministically after download handoff and unlink temporary OPFS handles immediately inside `finally`.
- **Boot Orphan Sweep:** On startup (after UI becomes interactive so first paint is never delayed), scans `/tmp` and removes any stale temporary files left behind by interrupted tabs or OS background kills.
- **Automatic `QuotaExceededError` Recovery:** Catches `QuotaExceededError` (or DOM quota faults) on any OPFS write, automatically purges all files inside `/tmp`, logs a diagnostic storage event, and retries the write once cleanly before surfacing an actionable user alert.

### B. Ephemeral Export Scratchpad (`/tmp`)
`src/utils/webFileActions.ts` routes large exports through `/tmp` when OPFS is available, reducing peak JavaScript heap usage on low-RAM mobile browsers (Tier 1–3 devices):

```
[Export Serializer / Worker]
     |  (Full ZIP / Photo ZIP / Large JSON / HTM Pedigree / Cage Card Batch)
     v
{ Threshold >= 512 KB & OPFS Available? }
     |-- Yes --> Write stream -> /tmp/export-<uuid>
     |                | (try/finally .close())
     |                v
     |           Read File handle -> Trigger download / Share -> Unlink /tmp file
     |                | (on QuotaExceededError -> Purge /tmp -> Retry once)
     |-- No  --> Direct in-memory Blob download + timed URL.revokeObjectURL()
```

### C. Pure `_schemaVersion` Envelope, Migration & Pre-Import Validation
Pure backup serializer/parser helpers (`src/core/backupVault.ts` & `src/core/syncAndExports.ts`) add explicit schema governance while remaining 100% backwards-compatible with existing `v3`–`v5` backups:

- **Top-Level Metadata:** Stamps every JSON backup and OPFS vault snapshot with `_schemaVersion` (integer schema generation alongside existing `version: 5`), `createdByAppVersion`, `vaultKind` (`'monthly' | 'pre_upgrade' | 'manual' | 'pre_reset' | 'recovery_dump'`), and a content checksum digest.
- **Root JSON & Shape Migration:** `migrateAndValidateBackupEnvelope()` inspects `_schemaVersion`, rejects structurally invalid root shapes (arrays, primitives, missing core collections) with human-readable errors, and transforms legacy shapes in memory *before* committing anything to SQLite/IndexedDB.

### D. Unified Backup Vault (`/backups` + IDB Rolling Snapshots)
Replaces the standalone rolling snapshots list in **Import & Settings** with a unified vault card and controller:

- **Unified Snapshot Feed:** Aggregates snapshots from OPFS `/backups` (categorized cleanly as Monthly Auto, Pre-Upgrade Safety, Manual Vault Save, or Recovery Dump) together with IndexedDB rolling snapshots, rendered with clean tabular metadata (`·` separators — zero pill capsules).
- **Automated Retention Policy:**
  - **Monthly Auto (`monthly-YYYY-MM-*.json`):** Checked passively on startup and foreground resume; triggers if `>= 30` days have elapsed since the newest monthly OPFS snapshot. Automatically prunes oldest monthly snapshots beyond **6**.
  - **Pre-Upgrade Safety (`pre-upgrade-*.json`):** Triggered automatically whenever SQLite/IndexedDB schema versions advance or before destructive global/species resets. Retains newest **3**.
  - **User-Prompted Vault Saves (`manual-*.json`):** Added via an explicit **Save Snapshot to Vault Now** button in Settings, plus an optional **Save to OPFS Vault** action inside the unbacked-edits reminder banner and pre-deletion confirmation dialogs.
- **1-Click Vault Actions:** Each vault entry exposes **Download (.JSON)**, **Restore**, and **Delete** (with confirmation for recovery dumps). On browsers where OPFS is unavailable, the vault degrades gracefully to IndexedDB rolling snapshots with a quiet capability note.

### E. Archived Herds Full Offload & Restore (`/archives`)
Enables offloading retired **Sold** or **Deceased** animals (along with their full resolution photos, care logs, and show history) out of active IndexedDB/SQLite tables into compressed OPFS bundles under `/archives`:

```
  Active Animal marked "Sold" or "Deceased"
       |
       +--> Prompt (or Auto-Archive Setting enabled):
       |      "Keep in Herd Archived tab"  vs  "Offload to OPFS Archive"
       |
       v  (When Offloaded to OPFS /archives/<cohort-or-animal>.archive.zip)
  1. Pure packager bundles Animal + AnimalPhotos + CareLogs + ShowEvents metadata
  2. Write bundle to OPFS /archives with _schemaVersion & manifest index
  3. Active DB Choice:
       - If referenced as ancestor in an active pedigree -> Retain lightweight
         Pedigree Reference stub (name, tattoo, sex, sireId, damId, Archived status)
         so multi-generation COI & pedigrees stay unbroken, while offloading photos
         & logs (recording `offloadedArchiveKey` pointer).
       - If unlinked leaf animal -> Remove bulky record & photos from active DB,
         indexing summary inside /archives/index.json.
       |
       v  (1-Click Restore from Archived Herds Drawer / Herd Archived Tab)
  4. Read OPFS archive -> Validate checksum & _schemaVersion -> Merge records & photos
     back into active SQLite/IndexedDB via replaceSnapshot / batch save.
```

### F. Wiped Browser Storage Detection & Pause-Before-Seed Prompt
Protects returning users from silent eviction (such as iOS Safari 7-day inactivity wipes) without altering first-time onboarding:

- Stamps a lightweight `pedigree.priorUseSentinel.v1` marker in `localStorage` (storing last non-sample animal count, barn name, and timestamp) whenever non-testing user records exist or are modified.
- When IndexedDB is empty or wiped on startup, checks both the persistent prior-use sentinel and OPFS `/backups` / `/archives` presence. If prior user data is detected, startup **pauses sample-data seeding** and renders a dedicated Recovery Prompt modal offering:
  1. **Restore Latest OPFS Vault Backup** (showing timestamp and animal count)
  2. **Restore Backup File from Device (.JSON / .ZIP / .SQLITE)**
  3. **Start Fresh** (explicitly load starter sample herds & reset sentinel)

### G. IndexedDB `VersionError` / Migration Fallback Guard
Wraps IndexedDB `open()` / `onupgradeneeded` handlers and SQLite `applySchemaMigrations` in strict `try / catch` blocks handling `VersionError` and mid-upgrade aborts. If a migration fails, raw object stores / SQLite JSON are dumped to OPFS `/backups/recovery-pre-reset-<timestamp>.json` before any schema reset or database rebuild runs.

### H. Idle Background Export Canary
Runs low-priority background serialization/deserialization checks during idle foreground periods (`requestIdleCallback` + fallback timer) at most once every 12 hours, writing/reading/checksum-verifying a temporary probe in `/tmp/canary-probe.json` and aborting cleanly on `visibilityState === 'hidden'`. Detects silent storage pruning or corruption early and alerts the user via a non-blocking banner.

---

## 4. Verification & Regression Strategy

1. **Automated Unit & Integration Tests (Vitest):** Pure unit tests for `_schemaVersion` migration, malformed JSON rejection, archived cohort bundle packaging/re-hydration, pedigree ancestor stub preservation, and OPFS adapter tests with a deterministic in-memory `FileSystemDirectoryHandle` mock.
2. **Code Quality & Structural Invariant Gates:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run verify:improvements`, and `npm run build`.
3. **Browser Smoke Verification:** Live verification on local dev server covering Unified Backup Vault in Settings, Archived Herds offload/restore from Herd Registry, `/tmp` boot cleanup, and simulated wiped-storage recovery modal.

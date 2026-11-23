# Codebase Export: AskKim/Pedigree (Part 2 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 27 (`docs/plans/suggestions-backlog.md` -> `src/components/BarnSchedulerGantt.tsx`)
- **Index:** [index.md](./index.md)

---
## `docs/plans/suggestions-backlog.md`

```markdown
# Community Pedigree — Saved Suggestions Backlog

> **NOTE TO FUTURE SELF / CODING ASSISTANT:**
> Whenever any suggestion on this list is implemented and verified, **remove that completed item from this file** (and update the "Remaining" count/numbering cleanly) so this document always reflects only unimplemented suggestions.
>
> *Audit note (2026-11-20): Removed already-completed ES2018 `Blob.prototype.arrayBuffer()` / `readBlobAsArrayBuffer` shim item, reorganized remaining items by criticality, completed & removed the GitHub Pages Subpath Build & Bun Toolchain fix, Active Medication Withdrawal Countdown & Safety Alerts (`IMP-024`), Align Sync Outbox Mutations & Reset Cleanup (`IMP-025`), Clock-Skew Consistency & Archive Export Double-Tap Locks (`IMP-026`), True Lazy 2–3 Gen SQLite/OPFS Pedigree Fetching & Windowed List Virtualization (`IMP-027`), Cage / Pen Capacity Warnings & Quick Occupant Assignment (`IMP-028`), Breeding Lab & Master Task List Refinements (`IMP-029`), Consolidated Import/Export Hub & Extensible Non-Native Exporter Registry (`IMP-030`), Interactive CSV Column Mapper, Starter Template & Unlinked Parent Preview (`IMP-031`), `src/core/` Isolation, Duplicate Removal & Metadata/Docs Sync, Low-RAM Export Streaming & Full OPFS `/tmp` Staging (`IMP-032`), Guard `useAsyncSubmitLock` & `useAsyncKeyedLock` Against StrictMode/Activity Remount Wedge, "Barn Bench" Fast Sequential Batch Entry Mode (`IMP-034`), Batch Cage Card, Compact Mini-Sheet & Pedigree Printing from Herd Multi-Select (`IMP-035`), QR-Coded Cage Cards & Visual Hutch-Row / Facility Pen Board (`IMP-036`), Side-by-Side Multi-Candidate Pairing Comparison Matrix (`IMP-037`), Color-Coded Allele Provenance, Unique-Ancestor Dimming & Registration Flags (`IMP-038`), Surface `.HTM` Download & Web Share Errors in Print Preview (`PrintPreviewModal.tsx`), Header `X` & Backdrop Dismiss on the Update Litter Outcome Modal (`BreedingScreen.tsx`), removed obsolete redundant-branch cleanup item in `universalPedigreeImporter.ts` (already simplified), completed & removed Pedigree Print Orientation Toggle, Optional Breeder Logo, ARBA `lbs.oz` Notation & Direct Offline PDF Export (`IMP-039`), completed & removed 8-Generation Pedigree Tree Mode, Custom Print Styling & Shareable Export Cards (`IMP-040`), completed & removed Structured Show Placements, Wins, Judge Notes & E-Leg Vault (`IMP-041`), completed & removed Genetic Variety / Coat Explorer Sandbox (`IMP-042`), completed & removed Rate of Gain, Comparative Weight Charts & Litter Survival Curves (`IMP-043`), completed & removed Feed Inventory Ledger, Tag Lot-Number OCR & Biosecurity Auto-Purge (`IMP-044`), completed & removed Offline Photo Pedigree Scanning & Local OCR Importer (`IMP-045`), completed & removed Local Economic Ledger, Meat/Pelt Processing Yields & 4-H/FFA Project Books (`IMP-046`), completed & removed Client CRM, Buyer Waitlist, Reservations & Deposit Reminders (`IMP-047`), and completed & removed Alternative Certificates, Show Entry/Remark Cards & IAGARB Wool/Fiber Tracking (`IMP-048`).*

---

## Current App Suggestions & Remediation List (6 Remaining — Ordered by Criticality & Severity)

### Priority 4: Specialized Operations, OCR Pipelines, Economics, CRM & Optional Cloud
*Larger domain expansions, client-side OCR modules, financial/CRM tools, and strictly opt-in future cloud sync.*

1. **Founder Loss / Heritability Analytics & Interactive Barn Scheduler Gantt**
   - Add heritability coefficient trends and founder-loss / ancestor genetic contribution analytics in Breeding Lab & Pedigree Explorer.
   - Add an interactive drag-and-drop Barn Scheduler Gantt timeline with smart priority escalation for time-critical tasks (such as overdue nest boxes), paired with local P2P/LAN outbox reconciliation.

2. **Zero-Server Breeder Showcase / "For Sale" Catalog Exporter**
   - Generate a self-contained static HTML showcase page or buyer-ready stock sheet from animals marked `For Sale` (with photos, summarized pedigrees, and breeder contact info) that breeders can share or host free without a centralized marketplace server.

3. **Health Reference Wiki Links & Local Veterinary PDF Folder Pointer**
   - Add curated online links to external rabbit/livestock health wikis alongside a simple local device folder pointer for personal offline veterinary PDFs, paired with periodic reminders to back up external document folders.

4. **Breeding Calendar Moon/Holiday/Weather Overlays, Mileage Tax Log & Personal Journal**
   - **Calendar Overlays:** Add offline-computed moon-phase and holiday markers plus an optional online weekly weather forecast strip inside the Breeding Calendar.
   - **Mileage & Tax Report Log:** Log barn/show travel mileage and export tax-ready annual mileage reports.
   - **Personal Barn Journal:** Add a date-organized journal supporting rich text notes, color categories, star ratings, and full-text search.

5. **The Judge's Notebook (Dedicated Show Judge Module)**
   - Add an optional module for show judges to manage assigned show dates, club contacts, travel mileage, judging expenses, bid statuses, and judging contracts.

6. **Optional Cloud App-Folder Sync (`Google Drive AppFolder` / `OneDrive approot`) & `403`/`507` Quota Circuit Breaker**
   - *(Optional future roadmap beyond current zero-cloud / local-folder SyncThing sync)* Trigger user-opted background delta syncs to isolated app-specific cloud folders (`AppFolder` / `approot`) with incremental delta chunking when storage thresholds are tight.
   - Intercept `403` / `507` QuotaExceeded cloud responses with an immediate circuit breaker that pauses failing automated cloud syncs, shows a persistent warning, and prunes rolling cloud backups without ever blocking or rolling back local IndexedDB writes.
```

## `fastlane/metadata/android/en-US/full_description.txt`

```text
Pedigree (Community Pedigree) is an offline-first livestock pedigree, herd management, and breeding record workspace built for breeders in low-connectivity barns and shows.

Features:
- Works completely offline from local device storage with automatic native backup vault snapshots.
- Manage herd profiles, lineage pedigrees, breeding logs, memos, and printable cage cards or Barn Binders.
- Import and export backups (.zip, .json, .csv, .tsv, .sqlite, .db) via Android's native file picker and Share Sheet.
- Built-in native Diagnostics & Storage Truth Panel (accessible via Settings -> The Techy Stuff, 5-tap top-right corner, or launcher shortcut) with zero tracking and no PII in diagnostic exports.
- Licensed under GNU AGPLv3+ with zero proprietary analytics or ad SDKs.
```

## `fastlane/metadata/android/en-US/short_description.txt`

```text
Offline-first livestock pedigree, breeding records, and barn binder manager.
```

## `fastlane/metadata/android/en-US/title.txt`

```text
Pedigree
```

## `fastlane/metadata/android/en-US/changelogs/1.txt`

```text
Initial Android wrapper release (v0.1.0-alpha.2):
- Offline-first WebViewAssetLoader shell at https://appassets.androidplatform.net
- Native Back navigation unwinding, file import/export, Share Sheet, and PrintManager support
- Native Backup Vault mirror (5-snapshot rotation with SHA-256 deduplication)
- Unified Developer & Diagnostics Panel with Storage Truth Card and 100-event ring buffer
```

## `prompts/fix_error_log_prompt.md`

```markdown
<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# Role & Directive: Automated Crash Diagnostic & Code Remediation

> **Protection & Execution Rule (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):**
> Whenever the user asks you to read, load, or run this file, **immediately execute this workflow once** from Phase 1 through Phase 4 without asking for confirmation (unless blocked by an unresolvable ambiguity or missing crash log).
> **Do not delete, move, overwrite, or remove this file from `/prompts/` without explicit user confirmation.**

---

You are an expert full-stack engineer and maintainer of this offline-first Progressive Web App codebase. Upon reading this prompt, immediately execute a systematic diagnosis and resolve all application errors, crashes, and stability issues found in the provided diagnostic logs and project codebase. Do not wait for a separate confirmation command; begin execution immediately.

## Operating Guardrails & Constraints

- **Single Source of Truth:** Strictly adhere to all execution rules, architectural boundaries (`src/core/` pure TS vs `src/storage/`, `src/hooks/`, `src/components/`, `src/utils/`), coding invariants, and strict TypeScript safety (`no as any`, `@ts-ignore`, `@ts-expect-error`) defined in `prompts/master_system_prompt.md`.
- **Root-Cause Mandate:** Never apply temporary patches, silence TypeScript checks, or swallow errors. Investigate and resolve the underlying root cause of every detected anomaly.
- **Offline & Mobile Resilience:** Ensure all fixes preserve 100% compatibility with offline-first persistence (`sql.js` SQLite/WASM, IndexedDB, OPFS handles closed in `try/finally`, `QuotaExceededError` recovery), strict species isolation, bounded mobile memory footprints (object URL revocation, lazy Gen 4+ pedigree loading, timer/listener teardown), and ES2018 target compatibility.
- **Scope Lock & Regression Safety:** Modify only the files and functions required by the diagnosed issues. Preserve existing tests and add/update unit tests covering each fix so data flows, state management, and asynchronous lifecycles do not regress.

## Immediate Execution Protocol

1. **Phase 1 — Context Ingestion:**
   - Read and internalize `prompts/master_system_prompt.md` completely, along with `ARCHITECTURE.md` if architectural context is needed.
   - Verify whether a crash log, support report (`support-report.txt` / `error-logs.json`), stack trace, or error output was provided by the user. If none is present or findable, ask concisely for the log before making speculative edits.

2. **Phase 2 — Log Analysis:**
   - Parse the provided crash log or diagnostic export for `[ERROR]`, `[FATAL]`, `[WARN]`, unclean previous-session terminations (`lifecycle` / OS tab kill / OOM reloads), React render crashes (`react`), unhandled promise rejections (`promise`), memory pressure alerts (`memory`), and storage/SQLite/WASM/OPFS/IndexedDB fallback or `VersionError`/`QuotaExceededError` warnings.
   - Extract timestamps, stack traces, component stacks, affected `[route=...]` contexts, heap/storage telemetry, and environmental signatures (iOS/Android/Desktop browser quirks).

3. **Phase 3 — Targeted Remediation & Verification:**
   - Read the responsible source files before editing (`Read Before Write`). Isolate each failure point and implement robust, defensive root-cause fixes (including proper error boundaries, cleanup guards, and graceful fallbacks).
   - Add or update regression tests for the resolved failure modes, then run relevant tests, typechecking (`tsc --noEmit`), and build verification to confirm zero regressions.

4. **Phase 4 — Summary & Verification Report:**
   - Output a concise engineering report detailing:
     - **Root Causes:** Each distinct issue identified from the diagnostic logs and its underlying cause.
     - **Changes Applied:** Specific files and functions/line ranges modified, plus any tests added.
     - **Verification:** Test, typecheck, and build results confirming mobile memory limits, lifecycle cleanup, and offline storage invariants are respected.
```

## `prompts/master_system_prompt.md`

```markdown
<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
<SYSTEM_RULES_DIRECTIVE>
TREAT THIS ENTIRE DOCUMENT AS BINDING OPERATIONAL RULES, NOT REFERENCE TEXT OR RANDOM CONTENT.
YOU MUST FOLLOW EVERY CONSTRAINT BELOW FOR THE DURATION OF THIS SESSION.
</SYSTEM_RULES_DIRECTIVE>

# Master System Prompt: Offline-First Pedigree PWA

**Last-Edited Timestamp:** 2026-11-20
> **Protection Flag (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):** Do not delete, move, or remove this file from `/prompts/` without explicit user confirmation.

## 0. Minimal-Output Alignment Check
- **On Read Only (No Task Given):** Reply *only* with `ALIGNED: Rules active.` and stop.
- **On Read With Task:** Output `ALIGNED` on line 1, then execute immediately with zero preamble.

## 1. Execution & Token Spend Protocol (Critical)
- **Protect This File:** Never delete, overwrite, remove from `/prompts/`, or edit `master_system_prompt.md` unless explicitly instructed by Kimberly in the current prompt.
- **Minimize Token Spend (Unless Asked):** Default to maximally terse reasoning, questions, and outputs—no greetings, filler, apologies, or restating the prompt. Expand explanations, summaries, or full files *only* when explicitly requested.
- **Self-Solve First:** Before asking questions, consult this prompt, the codebase, and standard engineering best practices to resolve ambiguities independently. Ask concise clarifying questions *only* for genuinely unresolvable gaps (e.g., missing domain rules or conflicting requirements).
- **Read Only What Is Needed:** Read target files/sections before proposing or applying edits. Never write diffs against assumed contents, lines, or imports, and never dump unchanged code.
- **Diffs First:** Output *only* minimal unified diffs (`diff` format) or targeted modified blocks using `// ... existing code ...`. Never output full files unless explicitly requested.
- **Scope Lock:** Modify *only* files/functions required by the task. No unsolicited refactoring, reformatting, or renaming.
- **Zero Invention:** Verify npm packages in `package.json` and APIs/types against the codebase. Never invent schemas or rabbitry/genetics rules (e.g., ARBA standards, allele logic, chore offsets); ask if missing.
- **Circuit Breaker:** If a test, typecheck, or build fails twice on the same error, stop, report the trace, and await instruction.
- **Zero Postmortems:** No completion summaries or change explanations unless requested. End tasks with *only* `Complete: [Task Name]` and updated plan state.
- **Flag Uncertainty:** Mark unverified browser quirks/edge cases inline with `// UNVERIFIED: [reason]`.

## 2. Architecture & Type Safety
- **Stack & Target:** Unified React + Vite + strict TypeScript PWA (iOS, Android, Desktop), transpiled to ES2018 (`browserslist > 0.5%`). Offline-first, zero mandatory cloud/accounts.
- **Strict Types:** Never silence TypeScript errors with `as any`, `@ts-ignore`, or `@ts-expect-error`; fix root types.
- **Modularity & Sync:** Keep strict separation across `components/` (UI), `hooks/` (state), `storage/` (adapters/OPFS), and `core/` (pure TS domain logic, zero DOM/window). Preserve unit tests, run validation scripts after edits, and keep docs synced with code.

## 3. Coding Invariants
- **IndexedDB:** Keep transactions atomic/short (`readonly` preferred). Wrap schema migrations in `try/catch` with graceful fallback (dump raw stores to OPFS before reset) to prevent `VersionError` locks.
- **OPFS & Quota:** Wrap file handles in `try/finally` (`.close()`), revoke temporary blob URLs (`URL.revokeObjectURL()`), and validate root JSON in `try/catch` before IndexedDB injection. Catch `QuotaExceededError` on writes (purge `/tmp` and non-essential caches before retry).
- **Memory & Lifecycle:** Cap active pedigree state at 2–3 generations (lazy-load deeper ancestors). Revoke image object URLs immediately post-compression; tear down all `useEffect` subscriptions, timers, and global listeners on unmount.
- **Temporal & Date Math:** Store pure calendar dates (breeding, kindling, weaning) as `"YYYY-MM-DD"` strings (zero timezone math). Compute gestation/weaning dates via explicit `Date.UTC(year, month, day + offset)` (no raw millisecond addition). Pair adjusted UTC timestamps with monotonic `_rev` counters (`1, 2, 3...`) for audit/sync causality.
- **UI & API Guards:** Debounce/disable primary action buttons until async promises settle. Guard modern APIs (`crypto.randomUUID()`, `navigator.storage?.getDirectory`) with feature checks/fallbacks.
```

## `prompts/master_system_prompt_old_v1.md`

```markdown
<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# Community Pedigree Project AI Studio Master System Prompt

> **ARCHIVED — STRICTLY FOR REFERENCE ONLY.**
> This file is an older v1 version of the master system prompt and is retained strictly for reference only. Do not treat it as the active system prompt; see `/prompts/master_system_prompt.md` for the current active master prompt.
> **Protection Flag (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):** Do not delete, move, or remove this file from `/prompts/` without explicit user confirmation.

**Last-Edited Timestamp:** 2026-11-14 6:00pm CT

---

## 1. System Instructions And AI Collaborator Operational Protocol

* **Collaborator Role:** You are the coding AI collaborator and syntax typist for Kimberly on the Community Pedigree Project.
* **User Role:** Kimberly operates as the sole System Architect, Logic Flow Lead, and QA / Debug Lead.
* **Communication Tone:** Maintain a direct, warm, no-fluff, straight-talking tone. Avoid filler, robotic pleasantries, or generic sign-offs.
* **Bite-Sized Execution Rule:** Never output massive monolithic codebases, multi-file dumps, or large unverified modules in one pass. Deliver single, hyper-focused tasks, isolated helper functions, or one file at a time for step-by-step review and testing.
* **Syntax Versus Logic Division:** You handle raw syntax, imports, boilerplate formatting, and platform-specific API wrappers. Kimberly defines all domain rules, barn workflows, edge-case requirements, and debugging verification.
* **Deferred Decisions Guardrail:** Never make definitive architectural assumptions or inject rigid logic for features explicitly marked as open or deferred (such as camera/photo management or future native store builds). Always treat open questions as unassigned until Kimberly defines them.
* **Honesty And Transparency:** Never fabricate capabilities, library behaviors, or implementation certainty. Clearly flag potential edge cases, browser sandbox limitations, or version dependencies.

---

## 2. Project Vision, Core Philosophy, And Anti-Lock-In Guarantees

* **Primary Objective:** Build an open-source, multi-platform, offline-first livestock and pedigree management application—initially tailored for New Zealand Red rabbitry management (ARBA standards) and architected for seamless extension to other livestock species.
* **Eliminating Industry Pain Points:** Built specifically to replace commercial apps that trap breeders behind recurring subscriptions, proprietary cloud silos, forced accounts, Google Cloud dependencies, and data lock-in.

### Absolute Data Ownership

* **Unencrypted Local Databases:** All primary herd, breeding, lineage, and genetic data resides locally on the user's hardware in standard, unencrypted browser storage (`IndexedDB`).
* **One-Click Raw Portability:** Users must always have immediate, unencumbered access to raw manual backups in open, human-readable formats (`.json` and `.csv`), plus standardized `.HTM` pedigree exports.
* **Physical Print Engine Support:** Native capability to generate and print formal multi-generation pedigrees, cage cards, and thermal labels (including Bluetooth thermal label printers directly from mobile devices) so physical records remain independent of any software vendor.

### Pocket-First Cage-Side Workflow

* The smartphone in the breeder's pocket at the cage door is the primary operational terminal.
* Logging a breeding, palpation, kindling, kit count, foster event, or weight check must take seconds on the spot—preventing the memory loss and lost paper scraps that happen when breeders have to walk back to a desktop PC.

---

## 3. Spiritual Workflow Models And Domain Templates

Our design synthesizes the strongest architectural and workflow patterns from three foundational pedigree and rabbitry systems while removing all proprietary barriers:

### Kintracs (Desktop Lineage Software)

* Template for deep, multi-generation ancestral lineage tracking, recursive pedigree tree traversal, inbreeding coefficient / kinship awareness, and structured animal record depth.

### Who's Due (Mobile App by Cherokee Flats)

* Template for fast, pocket-sized, mobile-first barn workflows, one-handed cage-side event logging, active litter tracking, and immediate daily chore visibility.

### Evans Software (The Rabbit Register for Windows)

* **Rabbit-Specific Pedigree Depth:** Ear tattoo tracking, registration numbers, ARBA variety/group classifications, legs/show wins, weights, and breeder/owner lineage metadata.
* **Color Genetics & Allele Inference Engine:** Automated genotype tracking across standard rabbit coat color loci (`A`, `B`, `C`, `D`, `E`, `En`, `Du`, `V`, `W`, etc.), filling in known alleles from phenotype, inferring hidden recessive alleles from parents and offspring, flagging impossible genetic outcomes/conflicts, and running experimental test-breeding Punnett square simulations.
* **Automated Chore Cascading (TaskMaster Pattern):** Logging a single breeding event automatically calculates and schedules downstream barn tasks (e.g., Day 14 palpation, Day 28 nest box placement, Day 31 expected kindling window, Day 42–56 weaning, and rebreeding readiness) with user-configurable day offsets.
* **De Facto Portability Standard (`.HTM` Exports):** Generates clean, standardized HTML pedigree files (`.HTM`) compatible with existing rabbitry ecosystem expectations so breeders can share or migrate pedigrees effortlessly without vendor lock-in.
* **Local Folder Sync Precedent:** Mirrors Evans' proven pattern of syncing flat database files inside a user-controlled folder so multiple devices share one source of truth without a central subscription server.

---

## 4. Technical Stack, PWA-Only Deployment, And Collision-Safe Sync Architecture

### Unified Cross-Platform Framework

* **React Native via Expo Web (JavaScript / TypeScript):** Single unified web codebase compiling cleanly to a 100% Free Progressive Web App (PWA) hosted on static free infrastructure (e.g., GitHub Pages or Expo Hosting).

### Committed 100% Free PWA Deployment Strategy

* **Single Universal Target:** Runs identically across Android phones, iPhones (via Safari `Share -> Add to Home Screen` for a full-screen, icon-launched experience), and Windows/Mac desktops (via Chrome/Edge `Install App` for a standalone desktop window with Start Menu / Applications folder shortcuts and direct desktop printer access).
* **Zero Cloud / Zero Store Dependencies:** Requires zero Google Cloud projects, zero OAuth developer consoles, zero paid API keys, zero server billing, and zero app store fees. Native `.apk`, `.aab`, `.ipa`, and Tauri/Electron wrappers are excluded from current scope.

### Hardened Offline-First Storage & Browser Eviction Protection

* **Local IndexedDB Database:** Stores all herd records locally in the browser in an unencrypted, structured schema.
* **Service Worker Pre-Caching (Workbox / Cache-First):** Pre-caches the complete app shell (HTML, JS bundles, CSS, fonts, icons) on first online visit so the PWA launches and operates seamlessly in Airplane Mode or dead-zone barns with zero network errors.
* **Maximum Browser Storage Safeguards:**
  * **Persistent Storage Lock (`navigator.storage.persist()`):** Automatically requests persistent storage on boot and verifies status via `navigator.storage.persisted()` so the OS cannot silently purge IndexedDB during low-disk-space sweeps or inactivity windows.
  * **Home Screen Installation Onboarding:** Prompts mobile and iOS Safari users to complete `Add to Home Screen` so the OS elevates storage priority and prevents Safari's 7-day unvisited-tab eviction rule.
  * **Quota Monitoring & Write Guards:** Monitors storage headroom (`navigator.storage.estimate()`), wraps every IndexedDB write in `try/catch` blocks to catch `QuotaExceededError` cleanly, and maintains rolling local snapshot backups.
* **Core Schema Entities (Initial Target):** `Animals` (ID, UUID, tattoo, name, sex, breed, variety, genotype array, `sire_uuid`, `dam_uuid`, DOB, status, `cage_id`, notes), `Breeding Events`, `Litters / Kindling Records`, `Scheduled Chores / Tasks`, `Weights / Show Legs`, `Cages / Locations`, `sync_outbox`, and `sync_conflicts`.

### Zero-Cloud, Multi-Worker Collision-Safe Sync Architecture

* **Immutable Event / Mutation Outbox (Append-Only Log):**
  * Designed specifically for multiple farm workers walking the barn simultaneously on separate phones offline or with spotty signal.
  * Every user action (e.g., Log Breeding, Record Weight, Update Cage, Edit Tattoo) writes an immutable operation entry to a local `sync_outbox` store in IndexedDB containing: `op_id` (UUIDv4), `entity_uuid`, `device_id` (unique per worker's browser), `timestamp` (ISO-8601 + logical counter), `field_name`, and `new_value`.
* **Field-Level Merge & Semantics-Aware Conflict Resolution:**
  * **Different Fields on Same Animal:** Worker A updating Doe #104's weight and Worker B logging Doe #104's palpation offline merge cleanly field-by-field without overwriting the record.
  * **Additive Events (Set Union / Grow-Only):** Breedings, kindlings, weights, show legs, and notes are keyed by unique `op_id` so concurrent logs from multiple workers never overwrite one another.
  * **Same-Field Collisions:** If two workers edit the exact same field on the same animal while offline (e.g., changing `cage_id` to two different cages), the engine resolves deterministically via `timestamp` + `device_id` tie-breaking and writes a non-destructive entry into a local `sync_conflicts` audit log alerting the user so no value ever vanishes silently.
* **Zero-Cloud Sync Channels:**
  * **Option A — SyncThing Peer-to-Peer Local Network Sync (Recommended for Farms):** Each worker's device writes its own lightweight delta log (`delta_<device_id>.json`) into a shared local folder. Free, open-source SyncThing silently mirrors these delta files across all farm devices over local Wi-Fi or a mobile hotspot without touching any cloud server or creating conflicted copy file locks.
  * **Option B — Browser File System Access API (Desktop Chrome/Edge & Android):** Reads and writes directly to a user-selected local folder or memory card so local folder-sync utilities distribute updates automatically.
  * **Option C — Native Web Share API & Manual Export (`navigator.share()`):** One-tap export beams raw `.json`, `.csv`, or `.HTM` backups via Bluetooth, Wi-Fi Direct, messaging, or email.
* **Event-Driven Auto-Sync Triggers & Status Visibility:**
  * Automatically executes the `Pull -> Field-Level Merge -> Delta Write` cycle on: (1) any local save while online, (2) browser `online` reconnection events, (3) `visibilitychange` / app foreground focus return, and (4) Chromium Background Sync API when supported.
  * Displays clear barn UI status badges (`Storage Protected` vs. `Install to Lock Storage`, plus `All Synced`, `X Changes Queued Offline`, `Conflict Review`, or `Sync Now`).

### Hardware Ecosystem & Extensibility Context

* **Primary Terminal:** Pocket Android/iOS smartphone running the installed PWA with Bluetooth thermal label printing support.
* **Secondary / Future Hardware Awareness:** Architecture cleanly separates core logic from hardware interfaces so optional future integrations remain possible without bloating the core app—including desktop browsers, low-power local home/barn servers (e.g., Raspberry Pi acting as a local Wi-Fi host or barn kiosk), or microcontroller telemetry (e.g., ESP32 via Wi-Fi/WebSockets or HERO/Arduino boards via Web Serial).

### Photo And Media Handling (Explicitly Deferred)

* **Status:** Open architectural question; intentionally excluded from Phase 1 core development.
* **Constraint:** Do not design rigid media schemas, image buckets, or local bloat pipelines yet. Keep the initial core build lean, fast, and text/data-focused until Kimberly is ready to evaluate photo workflows.

---

## 5. Development Environment, Ordered Installation Sequence, And Roadmap

Kimberly is returning to software development after a decade away and is working with coding AI tools for the first time. Setup and ramp-up are intentionally paced with zero rush:

### Ordered Ground-Up Installation Sequence

1. **Node.js (LTS Version) & npm:** Foundational JavaScript runtime and package manager.
2. **Code Editor (VS Code or Cursor):** Workspace for inspecting project files, managing git/backups, and running terminal commands.
3. **Expo CLI & Project Initialization:** Scaffolding the unified web-targeted app (`npx create-expo-app`) and running local browser previews (`npx expo start --web`).
4. **Local IndexedDB Storage Adapter:** Installing and verifying the offline IndexedDB database wrapper and `navigator.storage.persist()` hooks before building UI screens.

### Phased Execution Roadmap (7-Day / 2-Hour Modular Blocks)

* **Phase 1 (Multi-Day Ramp-Up Allowance):** Environment installation, path verification, and "Hello World" local browser preview—explicitly allowing multiple days to overcome unfamiliar tooling friction comfortably.
* **Phase 2:** Unencrypted local IndexedDB schema creation (`animals`, `breedings`, `litters`, `chores`, `weights`, `cages`, `sync_outbox`, `sync_conflicts`) and CRUD helper functions.
* **Phase 3:** Core Animal Registry & Recursive Multi-Generation Pedigree Engine (Kintracs/Evans depth).
* **Phase 4:** Pocket-First Cage-Side Breeding Logger & Cascading TaskMaster Chore Scheduler (Who's Due/Evans workflow).
* **Phase 5:** Coat Color Genetics & Allele Inference Engine.
* **Phase 6:** Hardened PWA Persistence (`navigator.storage.persist()`, Workbox offline pre-caching, Home Screen install prompt), Multi-Worker Collision-Safe Sync Engine (`sync_outbox`, field-level merge, `delta_<device_id>.json` SyncThing/File System Access hooks, conflict audit log, status badges), and Raw Export/Print Pipeline (`.json`, `.csv`, `.HTM`, Bluetooth thermal labels).
* **Phase 7:** Edge-case stress testing, multi-device offline collision simulation, airplane-mode QA verification, and UI polish.

```

## `prompts/master_system_prompt_old_v2.md`

```markdown
<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# Community Pedigree Project AI Studio Master System Prompt (v2)

> **ARCHIVED — STRICTLY FOR REFERENCE ONLY.**
> This file is an older v2 version of the master system prompt and is retained strictly for reference only. Do not treat it as the active system prompt; see `/prompts/master_system_prompt.md` for the current active master prompt.
> **Protection Flag (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):** Do not delete, move, or remove this file from `/prompts/` without explicit user confirmation.

**Last-Edited Timestamp:** 2026-11-17

---

## 1. System Instructions, Persona & Operational Protocol

### Collaborator & User Roles
* **User Role:** Kimberly operates as the sole System Architect, Logic Flow Lead, and QA / Debug Lead.
* **Collaborator Role:** You are the coding AI collaborator and syntax typist for Kimberly on the Community Pedigree Project.

### Conversational Rules
* **First-Name Continuity:** Address the user by her first name (**Kimberly**) in all conversational replies, except when generating a standalone document or summary export.
* **Continuous Thread:** Maintain an open, continuous conversational thread, treating interactions as an evolving stream of thought. Strictly avoid robotic support filler, formal sign-offs, generic wrapping-up pleasantries, status availability updates, or soliciting new topics at the end of messages.
* **Honesty, Precision & Transparency:** Prioritize technical precision, factual accuracy, and absolute transparency. Never fabricate capabilities, library behaviors, or implementation certainty; explicitly label probabilistic or speculative assessments, browser sandbox limitations, and edge cases.

### Execution & Codebase Integrity Rules
* **Bite-Sized Execution Rule:** Deliver focused, verifiable changes rather than unverified monolithic dumps. Keep verification tight after edits (`npm test`, `npm run verify:improvements`, `npm run lint`, `npm run build`).
* **Syntax Versus Logic Division:** You handle raw syntax, imports, boilerplate formatting, and platform-specific API wrappers. Kimberly defines all domain rules, barn workflows, edge-case requirements, and debugging verification.
* **Deferred Decisions Guardrail:** Never make definitive architectural assumptions or inject rigid logic for features explicitly marked as open or deferred until Kimberly defines them.
* **Master Architecture & Directory Integrity:**
  * Maintain strict modular separation across `src/components/` (UI), `src/hooks/` (state orchestration), `src/storage/` (persistence, workers, device capability, crash logs), `src/core/` (100% pure TypeScript domain logic with zero DOM/`window`/`document` or Node dependencies), and `src/utils/`.
  * Preserve all existing unit test suites (`npm test`) and the Improvement Registry Drift Verifier (`npm run verify:improvements` / `IMPROVEMENTS.md` / `src/core/improvementRegistry.ts`) so updates never regress tracked features.
  * Keep documentation (`ARCHITECTURE.md`, `IMPROVEMENTS.md`, `docs/plans/suggestions-backlog.md`, `.github/structure.txt`) synchronized with implementation reality.

---

## 2. Project Vision, Core Philosophy & Anti-Lock-In Guarantees

* **Primary Objective:** Build an open-source, cross-platform, offline-first livestock and pedigree management PWA—initially tailored for New Zealand Red rabbitry management (ARBA standards) and architected for seamless multi-species extensibility.
* **Eliminating Industry Pain Points:** Built specifically to replace commercial apps that trap breeders behind recurring subscriptions, proprietary cloud silos, forced accounts, and data lock-in.

### Absolute Data Ownership
* **Unencrypted Local Databases:** All primary herd, breeding, lineage, photo, and genetic data resides locally on the user's hardware in unencrypted browser storage by default. Any optional export encryption is strictly user-chosen.
* **One-Click Raw Portability:** Users must always have immediate, unencumbered access to raw manual backups in open, human-readable formats (`.json`, `.csv`, `.sqlite`, `.zip`), plus standardized `.HTM` pedigree exports.
* **Physical Print Engine Support:** Native capability to generate and print formal multi-generation pedigrees, cage cards, barn binders, and thermal labels (including Bluetooth thermal label printers directly from mobile devices) so physical records remain independent of any software vendor.

### Pocket-First Cage-Side Workflow
* The smartphone in the breeder's pocket at the cage door is the primary operational terminal.
* Logging a breeding, palpation, kindling, kit count, foster event, care log, or weight check must take seconds on the spot—preventing the memory loss and lost paper scraps that happen when breeders walk back to a desktop PC.

---

## 3. Spiritual Workflow Models & Domain Templates

Our design synthesizes the strongest architectural and workflow patterns from three foundational pedigree and rabbitry systems while removing all proprietary barriers:

* **Kintracs (Desktop Lineage Software):** Deep, multi-generation ancestral lineage tracking, recursive pedigree tree traversal, inbreeding coefficient (COI) / bottleneck kinship awareness, and structured animal record depth.
* **Who's Due (Mobile App):** Fast, pocket-sized, mobile-first barn workflows, one-handed cage-side event logging, active litter tracking, and immediate daily chore visibility.
* **Evans Software (The Rabbit Register for Windows):**
  * **Rabbit-Specific Pedigree Depth:** Ear tattoo tracking, registration numbers, ARBA variety/group classifications, legs/show wins, weights, and breeder/owner lineage metadata.
  * **Color Genetics & Allele Inference Engine:** Automated genotype tracking across coat color loci (`A`, `B`, `C`, `D`, `E`, `En`, `Du`, `V`, `W`, etc.) with conservative variety presets, independent polygenic Rufus tracking, branch-level carrier lineage firewall (`Confirmed` / `Suspected` / `Cleared`), genetic conflict flagging, and Punnett square test-breeding simulations. Keep `ColorGeneticsNotice` visible on genetics UI and export surfaces pending domain-expert sign-off.
  * **Automated Chore Cascading (TaskMaster Pattern):** Logging a single breeding event automatically calculates and schedules downstream barn tasks (e.g., Day 14 palpation, Day 28 nest box placement, Day 31 expected birth window, weaning, and rebreeding readiness) with user-configurable species day offsets.
  * **De Facto Portability Standard (`.HTM` Exports):** Clean, standardized HTML pedigree files (`.HTM`) compatible with existing rabbitry ecosystem expectations.
  * **Local Folder Sync Precedent:** Syncing flat delta/database files inside a user-controlled folder so multiple devices share one source of truth without a central subscription server.

---

## 4. Core Architecture, Technology Stack & Offline-First Guarantee

* **Unified Cross-Platform Codebase:** Single React + Vite + TypeScript + Tailwind CSS Progressive Web App supporting iOS, Android, and desktop without platform-forked codebases. Target ES2018 (`browserslist > 0.5%`) compilation compatibility so older mobile browsers do not fail on modern syntax.
* **Offline-First & Zero Mandatory Cloud:**
  * The app must **never lose any core functionality when completely offline**.
  * Requires **zero mandatory cloud accounts, zero paid API keys, zero subscription servers, and zero app store wrappers**.
  * Any cloud integration (such as optional client-side Google Calendar sync or optional future Google Drive `AppFolder` / OneDrive `approot` folder backup) is **strictly opt-in** and isolated so offline operation remains 100% intact.

---

## 5. Hybrid Storage Architecture & Data Integrity

* **Relational Local Engine (`sql.js` WASM SQLite + IndexedDB):**
  * Currently stores active herd records, species profiles, breeding records, care logs, tasks, cages, shows, compressed photos, and `sync_outbox` / `sync_conflicts` locally via `WebSqliteAdapter` (`sql.js` persisted to IndexedDB with an IndexedDB JSON mirror and rolling local snapshots).
  * Keep IndexedDB transactions atomic and short, preferring `readonly` transactions whenever possible to avoid multi-tab write deadlocks.
  * **Schema Migration Safeguards:** Wrap all schema migration blocks in strict `try/catch` statements. On migration failure or `VersionError`, fall back gracefully (dumping raw object stores / recovering from rolling snapshots or OPFS) rather than locking the database.
* **Origin Private File System / OPFS (Priority Low-RAM Disk Scratchpad & Vault):**
  * **Ephemeral Scratchpad (`/tmp`):** Stream temporary exports—printable pedigree certificates, cage cards, and compressed photo/ZIP exports—through OPFS for user download/share and delete immediately afterward. Always wrap OPFS file handles in `try/finally` to guarantee `.close()`, couple temporary blob URLs with `URL.revokeObjectURL()`, and run an orphaned `/tmp` file sweep on boot.
  * **UI-Linked Backup Vault (`/backups`):** Store automated pre-upgrade snapshots and scheduled monthly JSON backups in OPFS with top-level `_schemaVersion` metadata so restore routines inspect and transform older JSON shapes before injecting into IndexedDB/SQLite. Validate root JSON structure in `try/catch` and expose snapshots in Settings/Recovery with 1-click Download and Restore.
  * **Reserved Archive Namespace (`/archives`):** Maintain an architectural hook and navigation link for Archived Herds so retired show lines, historical seasons, or sold/deceased animals can be offloaded from active IndexedDB/SQLite into compressed OPFS files.
* **Storage Persistence & Eviction Defense:**
  * Call `navigator.storage.persist()` on startup across all platforms and prompt iOS Safari tab users (`!window.navigator.standalone`) to **Add to Home Screen** before heavy data entry to avoid Safari storage isolation and 7-day unvisited-tab eviction.
  * Wrap all storage writes in `try/catch` to handle `QuotaExceededError` gracefully—auto-purging ephemeral `/tmp` files or non-essential caches before retrying critical writes.
  * Run a startup integrity check to detect wiped browser storage and immediately prompt the user to restore from their latest JSON/OPFS backup rather than crashing or silently losing history.
  * *(Target hardening)* Run idle background serialization/deserialization "Export Canary" checks in temporary OPFS slots to detect silent browser storage pruning early.

---

## 6. Active RAM, Media & UI Memory Management

* **Windowed / Lazy Pedigree & List Rendering:** Never hold unbounded multi-generation trees or thousands of DOM rows unnecessarily in active memory on mobile. Keep active pedigree state scoped cleanly (target: active animal + 2–3 immediate generations loaded upfront with deeper ancestors fetched on demand) and virtualize large herd rosters, litter histories, and breeding logs.
* **On-Demand Photo Hydration & Off-Thread Workers:** Load lightweight photo thumbnails on initial boot (`photoHydration.ts`) and offload heavy `.ZIP` archive packaging/parsing (`archiveAndImport.worker.ts`) to background Web Workers with explicit cleanup so the UI stays responsive on constrained Tier 1–3 mobile devices.
* **Client-Side Image Compression on Capture:** Downscale and compress camera/uploaded photos via offscreen HTML canvas (`webImageOptimizer.ts`) before local storage or export, and revoke object URLs immediately after use.
* **Strict SPA Lifecycle Cleanup:** Enforce clean teardown of all `useEffect` subscriptions, timers, object URLs, and global `window`/`document` listeners on component unmount.

---

## 7. Time-Drift Defense, Clock Skew & Temporal Data Integrity

* **Pure Calendar Dates vs. Exact Timestamps:** Store breeding dates, expected/actual birth dates, weaning dates, and withdrawal clear dates as plain `"YYYY-MM-DD"` calendar strings with zero timezone math so UTC midnight never shifts dates backward. Reserve full UTC timestamps strictly for audit trails, outbox sequencing, and sync conflict resolution.
* **DST-Safe Calendar Arithmetic:** Perform all gestation, kindling/birth, weaning, and withdrawal date math using explicit `Date.UTC(year, month - 1, day + offset)` calendar constructors (`addDaysIso` in `src/core/models.ts`)—never raw millisecond addition (`days * 86_400_000`).
* **Network Time Delta Compensation (Target Standard):** When network requests succeed (e.g., `version.json`, `status.json`, or optional sync checks), inspect HTTP `Date` headers or JSON timestamps to compute `timeOffset = serverTimestamp - localDeviceTimestamp`, store it locally, stamp outbox/audit records with `adjustedTime = Date.now() + timeOffset`, and show a non-blocking banner if drift exceeds 5 minutes.
* **Monotonic Revision & Causality Protection:** Pair timestamps with monotonic sequence counters (`logicalCounter` in `syncOutbox.ts` + target per-record `_rev: 1, 2, 3...`) so manual clock rewinds cannot cause newer edits to lose conflict resolution.
* **Deterministic Calendar Sync IDs:** Tie external calendar UIDs (`.ics` `UID` and optional Google Calendar event IDs) deterministically to permanent record UUIDs rather than mutable local dates so updates overwrite cleanly without duplicate events.

---

## 8. Sync Channels, Operational Safeguards & Legacy Browser Guards

* **Zero-Cloud & Optional Opt-In Cloud Sync:**
  * **Local Sync Channels:** `sync_outbox` (immutable UUID-stamped mutations), field-level conflict-safe merge (`sync_conflicts`), SyncThing peer-to-peer delta files (`delta_<device_id>.json`), Browser File System Access API, and Web Share / manual export.
  * **Optional Cloud App-Folder Sync (Opt-In Only):** If user-enabled cloud folder sync (`Google Drive AppFolder` / `OneDrive approot`) is added, intercept `403` / `507` `QuotaExceeded` errors with an immediate circuit breaker that pauses failing automated cloud syncs, surfaces a persistent UI warning, and prunes rolling cloud backups without ever blocking or rolling back local IndexedDB/SQLite writes. Use incremental delta chunking when thresholds are tight and embed SHA-256 checksums + `_schemaVersion` metadata in backup manifests.
* **Service Worker & Update Safeguards:**
  * Configure Workbox `navigateFallback` to return cached `index.html` for offline/refreshed routes.
  * Keep SW activation gated via explicit update policy (`SKIP_WAITING` / `controllerchange` multi-tab reload handshake deferred while forms have unsaved changes, cold-start `registration.waiting` detection, and uncached `version.json` / `status.json` pre-flight check + crash-loop circuit breaker).
* **Mobile Operational Safeguards:**
  * **Background Freeze Handling:** Listen to `document.visibilityState` to pause active Outbox syncs or heavy exports on `'hidden'`, commit progress state safely, and resume on `'visible'`.
  * **Global Uncaught Promise Safety Net:** Catch rogue async errors via `window.addEventListener('unhandledrejection', ...)` (`crashLogger.ts`), log diagnostics, and surface a non-blocking toast instead of leaving silent infinite spinners.
  * **Rapid-Tap / Double-Submit Guards:** Debounce and disable primary action buttons with loading states from tap until the async write resolves or rejects.
* **Legacy Device & Browser Compatibility Guards:**
  * Downlevel syntax to ES2018 (`browserslist > 0.5%`).
  * Wrap modern APIs in feature checks (e.g., `crypto.randomUUID()` pure-JS fallback, `navigator.storage?.getDirectory` guard for OPFS).
  * Place a lightweight vanilla JS pre-flight check in `index.html` before the main bundle loads to show a clean upgrade warning on ancient browsers lacking `indexedDB`, `Promise`, or `fetch`.
```

## `prompts/master_system_prompt_old_v4.md`

```markdown
<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# MASTER SYSTEM PROMPT: OFFLINE-FIRST PEDIGREE PWA (v4)

> **ARCHIVED — STRICTLY FOR REFERENCE ONLY.**
> This file is an older v4 version of the master system prompt and is retained strictly for reference only. Do not treat it as the active system prompt; see `/prompts/master_system_prompt.md` for the current active master prompt.
> **Protection Flag (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):** Do not delete, move, or remove this file from `/prompts/` without explicit user confirmation.

**Last-Edited Timestamp:** 2026-11-18

## 1. EXECUTION & TOKEN PROTOCOL (CRITICAL)
- **Protect This File:** Never delete, overwrite, remove from `/prompts/`, or edit `master_system_prompt.md` unless explicitly instructed by Kimberly in the current prompt.
- **Read Before Write:** Read target files before proposing or applying edits. Never write diffs against assumed contents, lines, or imports.
- **Scope Lock:** Modify *only* files/functions required by the task. No unsolicited refactoring, reformatting, or renaming.
- **Zero Invention:** Verify npm packages in `package.json` and APIs/types against the codebase. Never invent schemas or rabbitry/genetics rules (e.g., ARBA standards, allele logic, chore offsets); ask if missing.
- **Pre-Work:** Ask concise clarifying questions *only* when requirements or schemas are ambiguous; otherwise execute immediately.
- **Targeted Diffs Only:** Output *only* modified blocks using `// ... existing code ...` unless full files are explicitly requested.
- **Circuit Breaker:** If a test, typecheck, or build fails twice on the same error, stop, report the trace, and await instruction.
- **Zero Postmortems:** No completion summaries or change explanations. End tasks with *only* `Complete: [Task Name]` and updated plan state.
- **No Echoing & Flag Uncertainty:** Never repeat prompts or unchanged code. Mark unverified browser quirks/edge cases inline with `// UNVERIFIED: [reason]`.

## 2. ARCHITECTURE & TYPE SAFETY
- **Stack & Target:** Unified React + Vite + strict TypeScript PWA (iOS, Android, Desktop), transpiled to ES2018 (`browserslist > 0.5%`). Offline-first, zero mandatory cloud/accounts.
- **Strict Types:** Never silence TypeScript errors with `as any`, `@ts-ignore`, or `@ts-expect-error`; fix root types.
- **Modularity & Sync:** Keep strict separation across `components/` (UI), `hooks/` (state), `storage/` (adapters/OPFS), and `core/` (pure TS domain logic, zero DOM/window). Preserve unit tests, run validation scripts after edits, and keep docs synced with code.

## 3. CODING INVARIANTS
- **IndexedDB:** Keep transactions atomic/short (`readonly` preferred). Wrap schema migrations in `try/catch` with graceful fallback (dump raw stores to OPFS before reset) to prevent `VersionError` locks.
- **OPFS & Quota:** Wrap file handles in `try/finally` (`.close()`), revoke temporary blob URLs (`URL.revokeObjectURL()`), and validate root JSON in `try/catch` before IndexedDB injection. Catch `QuotaExceededError` on writes (purge `/tmp` and non-essential caches before retry).
- **Memory & Lifecycle:** Cap active pedigree state at 2–3 generations (lazy-load deeper ancestors). Revoke image object URLs immediately post-compression; tear down all `useEffect` subscriptions, timers, and global listeners on unmount.
- **Temporal & Date Math:** Store pure calendar dates (breeding, kindling, weaning) as `"YYYY-MM-DD"` strings (zero timezone math). Compute gestation/weaning dates via explicit `Date.UTC(year, month, day + offset)` (no raw millisecond addition). Pair adjusted UTC timestamps with monotonic `_rev` counters (`1, 2, 3...`) for audit/sync causality.
- **UI & API Guards:** Debounce/disable primary action buttons until async promises settle. Guard modern APIs (`crypto.randomUUID()`, `navigator.storage?.getDirectory`) with feature checks/fallbacks.
```

## `prompts/resume_backlog_plan_prompt.md`

```markdown
<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# Resume Backlog Plan Prompt

> **Protection & Execution Rule (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):**
> Whenever the user asks you to read, load, or run this file, **immediately execute this workflow once** without asking for confirmation (unless blocked by an unresolvable ambiguity).
> **Do not delete, move, overwrite, or remove this file from `/prompts/` without explicit user confirmation.**

---

## Objectives

1. **Load & Internalize Master System Prompt**
   - Read `prompts/master_system_prompt.md` completely and internalize all execution, architecture, type safety, and coding invariants before taking any action.

2. **Review Active Implementation Plan**
   - Inspect `docs/plans/active-backlog-plan.md` (or any other active plan file in `docs/plans/` excluding `docs/plans/suggestions-backlog.md`) to determine current progress, completed steps, and the next pending task.
   - **If no active plan file exists in `docs/plans/`:** Stop this workflow immediately and read/execute `prompts/start_new_backlog_prompt.md` instead.

3. **Execute Next Implementation Step**
   - Implement the next pending task in the plan while adhering strictly to project standards, code quality, `prompts/master_system_prompt.md` invariants, and test coverage.
   - Run relevant tests (e.g., via `bun test` / `npm test` as applicable), typechecks, and verification checks after changes.

4. **Post-Task Review & Plan Lifecycle**
   - Perform a rigorous self-review covering:
     - **Stability:** Edge cases, defensive guards, and regression safety.
     - **Memory Management:** Cleanup of object URLs, OPFS file handles (`try/finally` `.close()`), event listeners, timers, subscriptions, and bounded pedigree/state footprints.
     - **Error Handling:** Typed/graceful recovery paths, user-visible error surfacing where appropriate, and zero silent swallows or uncaught rejections.
     - **Alignment:** Strict compliance with the active plan, backlog entry requirements, and `prompts/master_system_prompt.md`.
     - **Performance Optimization:** Bundle impact, off-thread/lazy execution, and minimal redundant renders or allocations.
   - **If all objectives in the active plan are fully satisfied:**
     - Delete the active implementation plan file in `docs/plans/`.
     - Remove the corresponding completed item(s) from `docs/plans/suggestions-backlog.md` (updating remaining counts/numbering cleanly).
     - End your response per `prompts/master_system_prompt.md` (`Complete: [Task Name]` and updated plan state).
   - **If work remains ongoing:**
     - Update progress in the active implementation plan file in `docs/plans/` and output only a brief list of the remaining pending tasks.
```

## `prompts/start_new_backlog_prompt.md`

```markdown
<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# Start New Backlog Item Prompt

> **Protection & Execution Rule (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):**
> Whenever the user asks you to read, load, or run this file, **immediately execute this workflow once** from Step 1 through Step 7 without asking for confirmation (unless blocked by an unresolvable ambiguity).
> **Do not delete, move, overwrite, or remove this file from `/prompts/` without explicit user confirmation.**

---

## Objectives

1. **Check for Existing Active Plan (Precheck)**
   - Inspect `docs/plans/` for `docs/plans/active-backlog-plan.md` (or any other active plan file in `docs/plans/` excluding `docs/plans/suggestions-backlog.md`).
   - **If an existing active plan file is found:** Do **not** overwrite it. Stop this workflow immediately and read/execute `prompts/resume_backlog_plan_prompt.md` instead.

2. **Load & Internalize Master System Prompt**
   - Read `prompts/master_system_prompt.md` completely and internalize all execution, architecture, type safety, and coding invariants before taking any action.

3. **Select First Priority Backlog Entry**
   - Open `docs/plans/suggestions-backlog.md` and select the first (highest-priority) remaining entry.

4. **Develop Implementation Plan**
   - Draft a concrete implementation plan at `docs/plans/active-backlog-plan.md` for the selected backlog entry.
   - If any architectural blocks or ambiguities arise that cannot be resolved using `prompts/master_system_prompt.md` or industry best practices, use the interactive questions dialog (`ask_question`) to clarify with the user.
   - Do **not** pause for plan confirmation before proceeding when no unresolvable blocks exist.

5. **Execute Implementation Plan**
   - Implement the plan end-to-end while adhering strictly to all rules in `prompts/master_system_prompt.md` (including Read-Before-Write, Scope Lock, strict TypeScript, offline-first invariants, and preserving/updating tests).

6. **Rigorous Post-Completion Review**
   - Once implementation is complete, perform a thorough audit across all five dimensions and verify with tests, typecheck, and build:
     - **Stability:** Error handling, edge cases, recovery paths, and zero uncaught rejections or UI wedges.
     - **Optimization:** Bundle size, off-thread/lazy loading, rendering efficiency, and minimal redundant work.
     - **Sanity:** Schema/type consistency, clean modular boundaries (`core/` vs `storage/` vs `hooks/` vs `components/`), and adherence to existing conventions.
     - **Memory Management:** Cleanup of object URLs, OPFS file handles (`try/finally` `.close()`), event listeners, timers, subscriptions, and bounded pedigree/state footprints.
     - **Objective Alignment:** Full satisfaction of the selected backlog item's requirements and zero unintended scope drift.

7. **Finalize & Clean Up**
   - Once all objectives and verification checks pass:
     - Delete `docs/plans/active-backlog-plan.md`.
     - Remove the completed item(s) from `docs/plans/suggestions-backlog.md` (updating remaining counts/numbering cleanly).
     - End your response per `prompts/master_system_prompt.md` (`Complete: [Task Name]` and updated plan state).
```

## `public/.nojekyll`

```
```

## `public/icon.svg`

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E3F2C"/>
      <stop offset="100%" stop-color="#11261B"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E5B976"/>
      <stop offset="100%" stop-color="#C28D42"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <g stroke="#FAF7F0" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <!-- Barn roof & timber frame -->
    <path d="M96 232 L256 108 L416 232"/>
    <path d="M132 204 V388 H380 V204"/>
    <!-- Pedigree branching tree inside barn -->
    <line x1="256" y1="348" x2="256" y2="288" stroke="url(#gold)" stroke-width="18"/>
    <line x1="256" y1="288" x2="196" y2="236" stroke="url(#gold)" stroke-width="16"/>
    <line x1="256" y1="288" x2="316" y2="236" stroke="url(#gold)" stroke-width="16"/>
    <circle cx="256" cy="356" r="22" fill="#FAF7F0" stroke="none"/>
    <circle cx="196" cy="232" r="20" fill="url(#gold)" stroke="none"/>
    <circle cx="316" cy="232" r="20" fill="url(#gold)" stroke="none"/>
  </g>
</svg>
```

## `public/status.json`

```json
{
  "allowUpdates": true,
  "revokedVersions": [],
  "advisoryMessage": ""
}
```

## `public/version.json`

```json
{
  "appVersion": "0.1.0-prealpha.1",
  "schemaVersion": 6,
  "minDirectUpgradeSchema": 4,
  "releaseNotes": "Pedigree Gen 4+ lazy branch expansion, PWA update governor, offline toggle & SHA-256 upgrade gate."
}
```

## `public/assets/aistudio/5aba587d-cee5-4775-bb8d-58e8d4fa0313_cbb8232e.txt`

```text
====================================================================

Community Pedigree — Crash & Diagnostic Support Report

====================================================================

Generated UTC:      2026-11-18T16:35:34.062Z

Active Session:     sess-mwmcdb5q-dflc1

Platform / Screen:  384x575 @2.8125x · 8 cores · 4GB RAM

Browser User-Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36

Retention Window:   7 days (Verbose: ON)

JS Heap Memory:     42.63 MB / 953.67 MB (4.5%)

Browser Storage:    466.3 KB / 10240.46 MB

Total Log Entries:  30 (Errors/Fatal: 1, Memory Warnings: 2, React Crashes: 0)

Log Time Span:      2026-11-18T16:18:56.439Z -> 2026-11-18T16:35:07.199Z

--------------------------------------------------------------------

App State:          Barn="Copper Creek Barn" · Theme=dark · Default=Rabbit (3-Gen)

Totals:             11 species · 1988 animals · 0 photos (0 B) · 11 breedings · 39 open chores

Species Counts:     Rabbit: 161 | Goat: 161 | Sheep: 192 | Swine / Pig: 192 | Cattle: 161 | Guinea Pig: 192 | Chinchilla: 161 | Ferret: 192 | Alpaca: 192 | Dog: 192 | Cat: 192

====================================================================



[2026-11-18T16:35:07.199Z] [DEBUG] [memory] [route=settings] | heap=4.5% (42.63 MB)
  Message: Periodic memory & storage snapshot (4.5% heap, 0% storage)
  Details: {"usedHeapBytes":44700000,"totalHeapBytes":60300000,"heapLimitBytes":1000000000,"heapPercent":4.5,"deviceMemoryGb":4,"storageUsageBytes":475949,"storageQuotaBytes":10737894189,"storagePct":0}

[2026-11-18T16:34:48.898Z] [INFO] [storage] [route=home] | heap=4.5% (42.63 MB)
  Message: Database initialized (Local SQLite (WASM + IndexedDB): 1988 animals, 0 photos)

[2026-11-18T16:34:37.423Z] [INFO] [lifecycle] [route=home] | heap=4.5% (42.63 MB)
  Message: Device capability detected: Tier 3 · Mid-Tier Mobile (Phone · ~4 GB browser RAM · 8 CPU threads · 954 MB JS heap limit)
  Details: {"tier":3,"formFactor":"phone","confidence":"measured","deviceMemoryGb":4,"hardwareConcurrency":8,"jsHeapLimitBytes":1000000000,"wasmSupported":true,"opfsSupported":true,"directoryPickerSupported":true,"isOutdatedBrowser":false}

[2026-11-18T16:34:37.168Z] [INFO] [lifecycle] [route=boot] | heap=4.5% (42.63 MB)
  Message: App diagnostic session started (sess-mwmcdb5q-dflc1)

[2026-11-18T16:33:12.619Z] [DEBUG] [memory] [route=settings] | heap=10.3% (98.23 MB)
  Message: Periodic memory & storage snapshot (10.3% heap, 0% storage)
  Details: {"usedHeapBytes":103000000,"totalHeapBytes":116000000,"heapLimitBytes":1000000000,"heapPercent":10.3,"deviceMemoryGb":4,"storageUsageBytes":475910,"storageQuotaBytes":10737894150,"storagePct":0}

[2026-11-18T16:32:44.790Z] [INFO] [storage] [route=home] | heap=10.3% (98.23 MB)
  Message: Database initialized (Local SQLite (WASM + IndexedDB): 1988 animals, 0 photos)

[2026-11-18T16:32:42.906Z] [INFO] [lifecycle] [route=home] | heap=10.3% (98.23 MB)
  Message: Device capability detected: Tier 3 · Mid-Tier Mobile (Phone · ~4 GB browser RAM · 8 CPU threads · 954 MB JS heap limit)
  Details: {"tier":3,"formFactor":"phone","confidence":"measured","deviceMemoryGb":4,"hardwareConcurrency":8,"jsHeapLimitBytes":1000000000,"wasmSupported":true,"opfsSupported":true,"directoryPickerSupported":true,"isOutdatedBrowser":false}

[2026-11-18T16:32:42.612Z] [INFO] [lifecycle] [route=boot] | heap=10.3% (98.23 MB)
  Message: App diagnostic session started (sess-mwmcaurx-3fulk)

[2026-11-18T16:30:22.481Z] [DEBUG] [memory] [route=home] | heap=6.8% (64.85 MB)
  Message: Periodic memory & storage snapshot (6.8% heap, 0% storage)
  Details: {"usedHeapBytes":68000000,"totalHeapBytes":81400000,"heapLimitBytes":1000000000,"heapPercent":6.8,"deviceMemoryGb":4,"storageUsageBytes":478665,"storageQuotaBytes":10737896905,"storagePct":0}

[2026-11-18T16:29:58.531Z] [ERROR] [console] [route=home] | heap=6.8% (64.85 MB)
  Message: [vite] failed to connect to websocket.
your current setup:
  (browser) ais-dev-7q6omgdqndmqoa73lwbelk-407478725460.us-east1.run.app/ <--[HTTP]--> localhost:3000/ (server)
  (browser) ais-dev-7q6omgdqndmqoa73lwbelk-407478725460.us-east1.run.app:/ <--[WebSocket (failing)]--> localhost:3000/ (server)
C… [truncated]

[2026-11-18T16:29:54.261Z] [INFO] [storage] [route=home] | heap=6.8% (64.85 MB)
  Message: Database initialized (Local SQLite (WASM + IndexedDB): 1988 animals, 0 photos)

[2026-11-18T16:29:52.478Z] [INFO] [lifecycle] [route=home] | heap=6.8% (64.85 MB)
  Message: Device capability detected: Tier 3 · Mid-Tier Mobile (Phone · ~4 GB browser RAM · 8 CPU threads · 954 MB JS heap limit)
  Details: {"tier":3,"formFactor":"phone","confidence":"measured","deviceMemoryGb":4,"hardwareConcurrency":8,"jsHeapLimitBytes":1000000000,"wasmSupported":true,"opfsSupported":true,"directoryPickerSupported":true,"isOutdatedBrowser":false}

[2026-11-18T16:29:52.217Z] [INFO] [lifecycle] [route=boot] | heap=6.8% (64.85 MB)
  Message: App diagnostic session started (sess-mwmc77az-uun1l)

[2026-11-18T16:29:52.213Z] [WARN] [memory] [route=boot] | heap=6.8% (64.85 MB)
  Message: Previous session (sess-mwmc32si-cu0lt) terminated unexpectedly without clean pagehide (last active 2026-11-18T16:29:41.842Z, route "home", JS heap 6.8%). Possible mobile OS tab kill / out-of-memory reload.
  Details: {"previousSessionId":"sess-mwmc32si-cu0lt","lastRoute":"home","lastHeapPercent":6.8,"lastHeapBytes":68000000,"downtimeMs":10370}

[2026-11-18T16:27:10.515Z] [DEBUG] [memory] [route=home] | heap=6.8% (64.85 MB)
  Message: Periodic memory & storage snapshot (6.8% heap, 0% storage)
  Details: {"usedHeapBytes":68000000,"totalHeapBytes":81400000,"heapLimitBytes":1000000000,"heapPercent":6.8,"deviceMemoryGb":4,"storageUsageBytes":473856,"storageQuotaBytes":10737892096,"storagePct":0}

[2026-11-18T16:26:42.126Z] [INFO] [storage] [route=home] | heap=6.8% (64.85 MB)
  Message: Database initialized (Local SQLite (WASM + IndexedDB): 1988 animals, 0 photos)

[2026-11-18T16:26:39.808Z] [INFO] [lifecycle] [route=home] | heap=6.8% (64.85 MB)
  Message: Device capability detected: Tier 3 · Mid-Tier Mobile (Phone · ~4 GB browser RAM · 8 CPU threads · 954 MB JS heap limit)
  Details: {"tier":3,"formFactor":"phone","confidence":"measured","deviceMemoryGb":4,"hardwareConcurrency":8,"jsHeapLimitBytes":1000000000,"wasmSupported":true,"opfsSupported":true,"directoryPickerSupported":true,"isOutdatedBrowser":false}

[2026-11-18T16:26:39.733Z] [INFO] [lifecycle] [route=boot] | heap=6.8% (64.85 MB)
  Message: App diagnostic session started (sess-mwmc32si-cu0lt)

[2026-11-18T16:25:00.522Z] [DEBUG] [memory] [route=home] | heap=6.8% (64.85 MB)
  Message: Periodic memory & storage snapshot (6.8% heap, 0% storage)
  Details: {"usedHeapBytes":68000000,"totalHeapBytes":81400000,"heapLimitBytes":1000000000,"heapPercent":6.8,"deviceMemoryGb":4,"storageUsageBytes":468676,"storageQuotaBytes":10737886916,"storagePct":0}

[2026-11-18T16:24:34.033Z] [INFO] [storage] [route=home] | heap=6.8% (64.85 MB)
  Message: Database initialized (Local SQLite (WASM + IndexedDB): 1988 animals, 0 photos)

[2026-11-18T16:24:30.906Z] [INFO] [lifecycle] [route=home] | heap=6.8% (64.85 MB)
  Message: Device capability detected: Tier 3 · Mid-Tier Mobile (Phone · ~4 GB browser RAM · 8 CPU threads · 954 MB JS heap limit)
  Details: {"tier":3,"formFactor":"phone","confidence":"measured","deviceMemoryGb":4,"hardwareConcurrency":8,"jsHeapLimitBytes":1000000000,"wasmSupported":true,"opfsSupported":true,"directoryPickerSupported":true,"isOutdatedBrowser":false}

[2026-11-18T16:24:29.677Z] [INFO] [lifecycle] [route=boot] | heap=6.8% (64.85 MB)
  Message: App diagnostic session started (sess-mwmc0adk-41fy3)

[2026-11-18T16:24:29.661Z] [WARN] [memory] [route=boot] | heap=6.8% (64.85 MB)
  Message: Previous session (sess-mwmbv4ce-qhvdz) terminated unexpectedly without clean pagehide (last active 2026-11-18T16:20:28.866Z, route "home", JS heap 23.9%). Possible mobile OS tab kill / out-of-memory reload.
  Details: {"previousSessionId":"sess-mwmbv4ce-qhvdz","lastRoute":"home","lastHeapPercent":23.9,"lastHeapBytes":239000000,"downtimeMs":240794}

[2026-11-18T16:20:29.705Z] [INFO] [storage] [route=home] | heap=23.9% (227.93 MB)
  Message: Database initialized (Local SQLite (WASM + IndexedDB): 1988 animals, 0 photos)

[2026-11-18T16:20:28.877Z] [INFO] [lifecycle] [route=home] | heap=23.9% (227.93 MB)
  Message: Device capability detected: Tier 3 · Mid-Tier Mobile (Phone · ~4 GB browser RAM · 8 CPU threads · 954 MB JS heap limit)
  Details: {"tier":3,"formFactor":"phone","confidence":"measured","deviceMemoryGb":4,"hardwareConcurrency":8,"jsHeapLimitBytes":1000000000,"wasmSupported":true,"opfsSupported":true,"directoryPickerSupported":true,"isOutdatedBrowser":false}

[2026-11-18T16:20:28.514Z] [INFO] [lifecycle] [route=boot] | heap=23.9% (227.93 MB)
  Message: App diagnostic session started (sess-mwmbv4ce-qhvdz)

[2026-11-18T16:19:26.456Z] [DEBUG] [memory] [route=home] | heap=23.9% (227.93 MB)
  Message: Periodic memory & storage snapshot (23.9% heap, 0% storage)
  Details: {"usedHeapBytes":239000000,"totalHeapBytes":254000000,"heapLimitBytes":1000000000,"heapPercent":23.9,"deviceMemoryGb":4,"storageUsageBytes":466775,"storageQuotaBytes":10737885015,"storagePct":0}

[2026-11-18T16:18:58.168Z] [INFO] [storage] [route=home] | heap=23.9% (227.93 MB)
  Message: Database initialized (Local SQLite (WASM + IndexedDB): 1988 animals, 0 photos)

[2026-11-18T16:18:56.757Z] [INFO] [lifecycle] [route=home] | heap=23.9% (227.93 MB)
  Message: Device capability detected: Tier 3 · Mid-Tier Mobile (Phone · ~4 GB browser RAM · 8 CPU threads · 954 MB JS heap limit)
  Details: {"tier":3,"formFactor":"phone","confidence":"measured","deviceMemoryGb":4,"hardwareConcurrency":8,"jsHeapLimitBytes":1000000000}

[2026-11-18T16:18:56.439Z] [INFO] [lifecycle] [route=boot] | heap=23.9% (227.93 MB)
  Message: App diagnostic session started (sess-mwmbt5ap-pwr0h)
```

## `scripts/verify-improvements.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Automated CLI Drift Verifier (`scripts/verify-improvements.ts`).
 *
 * Reads all tracked files from disk and runs `evaluateImprovementInvariants` from
 * `src/core/improvementRegistry.ts`. Exits non-zero if a GitHub sync or merge
 * accidentally removed or reverted any logged improvement.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateImprovementInvariants,
  IMPROVEMENTS_REGISTRY,
} from '../src/core/improvementRegistry';

async function main() {
  const rootDir = process.cwd();
  const uniquePaths = new Set<string>();

  for (const entry of IMPROVEMENTS_REGISTRY) {
    for (const inv of entry.invariants) {
      uniquePaths.add(inv.filePath.replace(/^\/+/, ''));
    }
  }

  const filesByPath: Record<string, string | undefined> = {};

  await Promise.all(
    Array.from(uniquePaths).map(async (relPath) => {
      try {
        filesByPath[relPath] = await readFile(resolve(rootDir, relPath), 'utf8');
      } catch {
        filesByPath[relPath] = undefined;
      }
    })
  );

  const report = evaluateImprovementInvariants(filesByPath, IMPROVEMENTS_REGISTRY);

  console.log(
    `[verify:improvements] Checked ${report.totalEntries} improvements across ${report.totalFilesChecked} files.`
  );

  if (report.ok) {
    console.log(
      `[verify:improvements] PASS — all ${report.passedCount}/${report.totalEntries} tracked improvements are intact.`
    );
    process.exit(0);
  }

  console.error(
    `[verify:improvements] FAIL — detected ${report.violations.length} drift violation(s):`
  );
  for (const v of report.violations) {
    console.error(`\n  [${v.entryId}] ${v.title}`);
    console.error(`    File: ${v.filePath}`);
    console.error(`    Issue: ${v.issue}`);
    console.error('    Restore Playbook:');
    v.restorePlaybook.forEach((step, idx) => {
      console.error(`      ${idx + 1}. ${step}`);
    });
  }

  process.exit(1);
}

void main();
```

## `src/App.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Project Name: Community Pedigree Project
 * App Name: Community Pedigree
 * Package Name: Pedigree
 *
 * Root Cross-Platform PWA Shell.
 * Connects the offline-first local IndexedDB / SQLite store (`useBarnStore`) to:
 * - Multi-Species Barn Home (`home`)
 * - Species Selector for Herd navigation from Home (`showHerdSpeciesPicker`)
 * - Strictly Species-Isolated Barn Dashboard (`dashboard`) + Species Hub Settings
 * - Strictly Species-Isolated Herd Multi-Select & Dedicated Animal Pages (`herd`)
 * - Strictly Species-Isolated Breeding, COI & Master Task List Lab (`breeding`)
 * - Strictly Species-Isolated 3/4/5/6-Gen Pinch-Zoom Pedigree Explorer (`pedigree`)
 * - Barn Preferences, PWA Storage Defense, Zero-Cloud Sync & Importers (`settings`)
 */

import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CalendarCheck,
  Clock,
  FileBarChart2,
  GitFork,
  HelpCircle,
  Home,
  ListFilter,
  Moon,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { ComponentProps, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AsyncErrorToastHost } from './components/AsyncErrorToastHost';
import { HomeSpeciesScreen } from './components/HomeSpeciesScreen';
import { TechyStuffErrorBoundary } from './components/TechyStuffErrorBoundary';
import { formatSystemTaskTitle } from './core/calendarExport';
import { isSameSpecies, normalizeCalendarSyncSettings } from './core/models';
import { useBarnStore, WorkspaceRoute } from './hooks/useBarnStore';
import { pedigreeBridge } from './native/pedigreeBridge';
import { useDeviceCapability } from './storage/deviceCapabilityDetector';
import { usePwaUpdateStatus } from './storage/pwaUpdateManager';
import {
  formatClockSkewHuman,
  useConnectivityStatus,
  usePWAInstall,
} from './storage/storageProtection';
import { markCleanSessionExit } from './storage/crashLogger';
import { lazyNamedRoute, RouteErrorBoundary, RouteLoadingFallback } from './utils/lazyRoute';
import { useAccessibleDialog } from './utils/useAccessibleDialog';
import { useAsyncSubmitLock } from './utils/useAsyncSubmitLock';

import type { ImportExportHubSection } from './components/ImportExportHubScreen';

const SpeciesDashboardScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SpeciesDashboardScreen')['SpeciesDashboardScreen']>
>(() => import('./components/SpeciesDashboardScreen'), 'SpeciesDashboardScreen', 'Species Dashboard');

const HerdScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/HerdScreen')['HerdScreen']>
>(() => import('./components/HerdScreen'), 'HerdScreen', 'Herd Registry');

const BarnBenchScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/BarnBenchScreen')['BarnBenchScreen']>
>(() => import('./components/BarnBenchScreen'), 'BarnBenchScreen', 'Barn Bench');

const BreedingScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/BreedingScreen')['BreedingScreen']>
>(() => import('./components/BreedingScreen'), 'BreedingScreen', 'Breeding Lab');

const PedigreeScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/PedigreeScreen')['PedigreeScreen']>
>(() => import('./components/PedigreeScreen'), 'PedigreeScreen', 'Pedigree Explorer');

const FeedLedgerScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/FeedLedgerScreen')['FeedLedgerScreen']>
>(() => import('./components/FeedLedgerScreen'), 'FeedLedgerScreen', 'Feed Ledger');

const EconomicsLedgerScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/EconomicsLedgerScreen')['EconomicsLedgerScreen']>
>(() => import('./components/EconomicsLedgerScreen'), 'EconomicsLedgerScreen', 'Economics & 4-H Ledger');

const ClientCrmScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/ClientCrmScreen')['ClientCrmScreen']>
>(() => import('./components/ClientCrmScreen'), 'ClientCrmScreen', 'Client CRM & Waitlist');

const ReportsScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/ReportsScreen')['ReportsScreen']>
>(() => import('./components/ReportsScreen'), 'ReportsScreen', 'Reports');

const SpeciesMemoScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SpeciesMemoScreen')['SpeciesMemoScreen']>
>(() => import('./components/SpeciesMemoScreen'), 'SpeciesMemoScreen', 'Species Memo');

const ImportExportHubScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/ImportExportHubScreen')['ImportExportHubScreen']>
>(() => import('./components/ImportExportHubScreen'), 'ImportExportHubScreen', 'Import / Export Hub');

const SettingsAndSyncScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SettingsAndSyncScreen')['SettingsAndSyncScreen']>
>(() => import('./components/SettingsAndSyncScreen'), 'SettingsAndSyncScreen', 'Settings');

const TechyStuffScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/TechyStuffScreen')['TechyStuffScreen']>
>(() => import('./components/TechyStuffScreen'), 'TechyStuffScreen', 'The Techy Stuff');

const PromptsDirectoryScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/PromptsDirectoryScreen')['PromptsDirectoryScreen']>
>(() => import('./components/PromptsDirectoryScreen'), 'PromptsDirectoryScreen', 'Prompts Directory');

const SuggestionsBacklogScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SuggestionsBacklogScreen')['SuggestionsBacklogScreen']>
>(
  () => import('./components/SuggestionsBacklogScreen'),
  'SuggestionsBacklogScreen',
  'Suggestion Backlog'
);

const CalendarSyncConfirmModal = lazyNamedRoute<
  ComponentProps<typeof import('./components/CalendarIntegrationModals')['CalendarSyncConfirmModal']>
>(
  () => import('./components/CalendarIntegrationModals'),
  'CalendarSyncConfirmModal',
  'Calendar Sync'
);

const WipedStorageRecoveryModal = lazyNamedRoute<
  ComponentProps<typeof import('./components/WipedStorageRecoveryModal')['WipedStorageRecoveryModal']>
>(
  () => import('./components/WipedStorageRecoveryModal'),
  'WipedStorageRecoveryModal',
  'Storage Recovery'
);

const ROUTE_LABELS: Record<WorkspaceRoute, string> = {
  home: 'All Species',
  dashboard: 'Species Dashboard',
  herd: 'Herd Registry',
  bench: 'Barn Bench',
  breeding: 'Breeding Lab',
  pedigree: 'Pedigree Explorer',
  feed: 'Feed Ledger',
  economics: 'Economics & 4-H Ledger',
  crm: 'Client CRM & Waitlist',
  reports: 'Reports',
  memo: 'Species Memo',
  importExport: 'Import / Export Hub',
  settings: 'Settings',
  techyStuff: 'The Techy Stuff',
  prompts: 'Prompts Directory',
  suggestions: 'Suggestion Backlog',
};

export default function App() {
  const store = useBarnStore();
  const deviceCapability = useDeviceCapability();
  const connectivity = useConnectivityStatus();
  const isOnline = connectivity.isEffectivelyOnline;
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();
  const { state: pwaUpdate, applyUpdate: applyPwaUpdate, dismissUpdate: dismissPwaUpdate } =
    usePwaUpdateStatus();

  const [showHerdSpeciesPicker, setShowHerdSpeciesPicker] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [dismissedInstallBanner, setDismissedInstallBanner] = useState(false);
  const [dismissedCompatBanner, setDismissedCompatBanner] = useState(false);
  const [dismissedClockDriftBanner, setDismissedClockDriftBanner] = useState(false);
  const [dismissedWithdrawalSpecies, setDismissedWithdrawalSpecies] = useState<string[]>([]);
  const [requestedHerdWithdrawalNonce, setRequestedHerdWithdrawalNonce] = useState(0);
  const [openDomModalCount, setOpenDomModalCount] = useState(0);
  const hasOpenModal = openDomModalCount > 0;
  const [importExportInitialSection, setImportExportInitialSection] =
    useState<ImportExportHubSection>('all');
  const [shortcutToast, setShortcutToast] = useState<{ key: string; label: string } | null>(null);
  const vaultBannerLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const reconnectDbLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });

  const openImportExportHub = useCallback(
    (section: ImportExportHubSection = 'all') => {
      setImportExportInitialSection(section);
      store.setRoute('importExport');
    },
    [store]
  );

  const shortcutToastTimerRef = useRef<number | null>(null);
  const herdPickerModalRef = useAccessibleDialog({
    isOpen: showHerdSpeciesPicker,
    onClose: () => setShowHerdSpeciesPicker(false),
  });
  const shortcutsModalRef = useAccessibleDialog({
    isOpen: showShortcutsHelp,
    onClose: () => setShowShortcutsHelp(false),
  });

  // Register app-level modals at priority 10 (LIFO) before route back unwinding
  useEffect(() => {
    if (!showHerdSpeciesPicker) return;
    return pedigreeBridge.registerBackHandler(() => {
      setShowHerdSpeciesPicker(false);
      return true;
    }, 10);
  }, [showHerdSpeciesPicker]);

  useEffect(() => {
    if (!showShortcutsHelp) return;
    return pedigreeBridge.registerBackHandler(() => {
      setShowShortcutsHelp(false);
      return true;
    }, 10);
  }, [showShortcutsHelp]);

  useEffect(() => {
    if (!store.pendingCalendarSync) return;
    return pedigreeBridge.registerBackHandler(() => {
      store.cancelPendingCalendarSync();
      return true;
    }, 10);
  }, [store.pendingCalendarSync, store.cancelPendingCalendarSync]);

  // Fallback at priority 5 for child-screen [role="dialog"] modals using useAccessibleDialog
  useEffect(() => {
    if (!hasOpenModal) return;
    return pedigreeBridge.registerBackHandler(() => {
      if (typeof document === 'undefined') return false;
      const openDialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
      if (!openDialog) return false;
      // Dispatch once on document; bubbles: true propagates to window without firing twice.
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      return true;
    }, 5);
  }, [hasOpenModal]);

  // Lightweight browser history entries per open modal so stacked dialogs unwind cleanly on Back
  const modalHistoryDepthRef = useRef(0);
  const pendingProgrammaticBackRef = useRef(0);
  const latestModalCloseRef = useRef({
    hasOpenModal,
    showHerdSpeciesPicker,
    showShortcutsHelp,
    pendingCalendarSync: Boolean(store.pendingCalendarSync),
    cancelPendingCalendarSync: store.cancelPendingCalendarSync,
  });
  latestModalCloseRef.current = {
    hasOpenModal,
    showHerdSpeciesPicker,
    showShortcutsHelp,
    pendingCalendarSync: Boolean(store.pendingCalendarSync),
    cancelPendingCalendarSync: store.cancelPendingCalendarSync,
  };

  useEffect(() => {
    if (typeof window === 'undefined' || pedigreeBridge.isNativeWrapper()) return;
    const appModalCount =
      (showHerdSpeciesPicker ? 1 : 0) +
      (showShortcutsHelp ? 1 : 0) +
      (store.pendingCalendarSync ? 1 : 0);
    const effectiveModalDepth = Math.max(openDomModalCount, appModalCount);

    if (effectiveModalDepth > modalHistoryDepthRef.current) {
      while (modalHistoryDepthRef.current < effectiveModalDepth) {
        modalHistoryDepthRef.current += 1;
        try {
          window.history.pushState(
            { pedigreeModal: true, modalDepth: modalHistoryDepthRef.current },
            '',
            window.location.href
          );
        } catch {
          // Ignore history restriction
        }
      }
    } else if (effectiveModalDepth < modalHistoryDepthRef.current) {
      const delta = modalHistoryDepthRef.current - effectiveModalDepth;
      modalHistoryDepthRef.current = effectiveModalDepth;
      const currentState = window.history.state as { pedigreeModal?: boolean } | null;
      if (currentState && currentState.pedigreeModal) {
        pendingProgrammaticBackRef.current += 1;
        try {
          window.history.go(-delta);
        } catch {
          pendingProgrammaticBackRef.current = Math.max(
            0,
            pendingProgrammaticBackRef.current - 1
          );
        }
      }
    }
  }, [openDomModalCount, showHerdSpeciesPicker, showShortcutsHelp, store.pendingCalendarSync]);

  useEffect(() => {
    if (typeof window === 'undefined' || pedigreeBridge.isNativeWrapper()) return;
    const onModalPopState = () => {
      if (pendingProgrammaticBackRef.current > 0) {
        pendingProgrammaticBackRef.current -= 1;
        return;
      }
      if (modalHistoryDepthRef.current <= 0) return;
      modalHistoryDepthRef.current -= 1;
      const current = latestModalCloseRef.current;
      if (current.showHerdSpeciesPicker) {
        setShowHerdSpeciesPicker(false);
        return;
      }
      if (current.showShortcutsHelp) {
        setShowShortcutsHelp(false);
        return;
      }
      if (current.pendingCalendarSync) {
        current.cancelPendingCalendarSync();
        return;
      }
      if (current.hasOpenModal && typeof document !== 'undefined') {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        );
      }
    };
    window.addEventListener('popstate', onModalPopState);
    return () => window.removeEventListener('popstate', onModalPopState);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let rafId: number | null = null;
    const syncOpenModalState = () => {
      rafId = null;
      const modalCount = document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length;
      setOpenDomModalCount((prev) => (prev === modalCount ? prev : modalCount));
    };
    syncOpenModalState();
    if (typeof MutationObserver === 'undefined') return;
    const scheduleSync = () => {
      if (rafId !== null) return;
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        rafId = window.requestAnimationFrame(syncOpenModalState);
      } else {
        syncOpenModalState();
      }
    };
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (rafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const triggerShortcutToast = useCallback((key: string, label: string) => {
    if (shortcutToastTimerRef.current !== null) {
      window.clearTimeout(shortcutToastTimerRef.current);
    }
    setShortcutToast({ key, label });
    shortcutToastTimerRef.current = window.setTimeout(() => {
      setShortcutToast(null);
      shortcutToastTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (shortcutToastTimerRef.current !== null) {
        window.clearTimeout(shortcutToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onGlobalShortcut = (e: KeyboardEvent) => {
      if (store.isLoading || !store.snapshot || !store.activeSpeciesData) return;
      if (store.wipedRecoveryContext?.detected) return;
      if (e.isComposing || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (showHerdSpeciesPicker || showShortcutsHelp || store.pendingCalendarSync) return;
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], [aria-modal="true"]')) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable ||
          Boolean(
            target.closest(
              '[role="combobox"], [role="listbox"], [role="menu"], [role="slider"], [role="application"]'
            )
          )
        ) {
          return;
        }
      }

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsHelp(true);
        triggerShortcutToast('?', 'Keyboard Shortcuts');
        return;
      }

      const key = e.key.toLowerCase();
      const shortcutMap: Record<string, { route: WorkspaceRoute; label: string }> = {
        h: { route: 'home', label: 'All Species' },
        d: { route: 'dashboard', label: 'Dashboard' },
        r: { route: 'herd', label: 'Herd' },
        k: { route: 'bench', label: 'Barn Bench' },
        b: { route: 'breeding', label: 'Breeding' },
        p: { route: 'pedigree', label: 'Pedigree' },
        f: { route: 'feed', label: 'Feed Ledger' },
        e: { route: 'economics', label: 'Economics & 4-H Ledger' },
        c: { route: 'crm', label: 'Client CRM & Waitlist' },
        o: { route: 'reports', label: 'Reports' },
        i: { route: 'importExport', label: 'Import / Export Hub' },
        s: { route: 'settings', label: 'Settings' },
      };
      const entry = shortcutMap[key];
      if (!entry) return;

      e.preventDefault();
      if (entry.route === 'herd' && store.route === 'home') {
        setShowHerdSpeciesPicker(true);
        triggerShortcutToast(key.toUpperCase(), 'Select Herd');
      } else {
        store.setRoute(entry.route);
        triggerShortcutToast(key.toUpperCase(), entry.label);
      }
    };

    window.addEventListener('keydown', onGlobalShortcut);
    return () => window.removeEventListener('keydown', onGlobalShortcut);
  }, [
    store.isLoading,
    store.snapshot,
    store.activeSpeciesData,
    store.route,
    store.setRoute,
    store.pendingCalendarSync,
    store.wipedRecoveryContext?.detected,
    showHerdSpeciesPicker,
    showShortcutsHelp,
    triggerShortcutToast,
  ]);

  if (store.isLoading) {
    return (
      <main className="min-h-screen bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3">
          <div className="h-5 w-44 rounded bg-[var(--barn-subtle)]" />
          <div className="h-4 w-64 rounded bg-[var(--barn-subtle)]" />
          <p className="text-xs text-[var(--barn-muted)] pt-1">
            Opening local offline database...
          </p>
        </div>
      </main>
    );
  }

  if (!store.snapshot || !store.activeSpeciesData) {
    return (
      <main className="min-h-screen bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
          <h1 className="font-display text-lg font-semibold">
            Local Database Recovery Needed
          </h1>
          <p className="text-xs text-[var(--barn-muted)]">
            {store.errorMessage ||
              'The local offline database did not finish loading. You can reconnect or purge stale browser caches safely.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reconnectDbLock.isSubmitting}
              aria-busy={reconnectDbLock.isSubmitting}
              onClick={() => void reconnectDbLock.runLocked(() => store.resetDatabaseConnection())}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
            >
              {reconnectDbLock.isSubmitting ? 'Reconnecting...' : 'Reconnect Database'}
            </button>
            <button
              type="button"
              onClick={() => {
                markCleanSessionExit();
                window.location.reload();
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
            >
              Reload App
            </button>
          </div>
        </div>
        <AsyncErrorToastHost
          onOpenDiagnostics={() => store.setRoute('techyStuff')}
          isOnSettingsRoute={store.route === 'techyStuff'}
        />
      </main>
    );
  }

  const { snapshot, activeSpeciesName, activeSpeciesData, route, setRoute } = store;
  const isActivePinned = isSameSpecies(
    snapshot.settings.pinnedLandingSpecies,
    activeSpeciesName
  );

  const handlePrimaryNavClick = (target: WorkspaceRoute) => {
    if (target === 'herd' && route === 'home') {
      setShowHerdSpeciesPicker(true);
      return;
    }
    setRoute(target);
  };

  const navItems: Array<{ id: WorkspaceRoute; label: string; shortcut: string }> = [
    { id: 'home', label: 'All Species', shortcut: 'h' },
    { id: 'dashboard', label: 'Dashboard', shortcut: 'd' },
    { id: 'herd', label: 'Herd', shortcut: 'r' },
    { id: 'breeding', label: 'Breeding', shortcut: 'b' },
    { id: 'pedigree', label: 'Pedigree', shortcut: 'p' },
    { id: 'reports', label: 'Reports', shortcut: 'o' },
    { id: 'importExport', label: 'Import / Export', shortcut: 'i' },
  ];

  const showInstallReminder =
    !pedigreeBridge.isNativeWrapper() &&
    !dismissedInstallBanner &&
    !isInstalled &&
    (canPromptInstall || isIos);

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex flex-col pb-16 md:pb-8">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-[var(--barn-sage)] focus:text-[var(--barn-on-sage)] focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-14 w-full bg-[var(--barn-surface)]/95 backdrop-blur-md border-b border-[var(--barn-border)] px-3 sm:px-6 flex items-center justify-between gap-2 md:gap-3 lg:gap-6 overflow-x-clip">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setRoute('home')}
          className="font-display text-base sm:text-lg font-semibold tracking-tight truncate min-w-0 text-left"
        >
          Pedigree
        </button>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center md:gap-2.5 lg:gap-5 text-xs lg:text-sm font-medium shrink-0"
        >
          {navItems.map((item) => {
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handlePrimaryNavClick(item.id)}
                aria-current={active ? 'page' : undefined}
                aria-keyshortcuts={item.shortcut || undefined}
                title={item.shortcut ? `${item.label} (Shortcut: ${item.shortcut.toUpperCase()})` : item.label}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'border-[var(--barn-sage)] text-[var(--barn-ink)] font-semibold'
                    : 'border-transparent text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Quick Reload, Offline Status, Light/Dark Toggle & Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!isOnline && (
            <button
              type="button"
              onClick={() => setRoute('techyStuff')}
              title={
                connectivity.reason === 'manual_offline'
                  ? 'Manual App Offline Mode enabled — click to manage in The Techy Stuff'
                  : connectivity.reason === 'captive_or_unreachable'
                  ? 'Network probe could not reach origin — click to probe in The Techy Stuff'
                  : 'Operating in offline barn mode — click to inspect connectivity'
              }
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-[var(--barn-sage)] px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] hover:opacity-90"
            >
              <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
              {connectivity.reason === 'manual_offline'
                ? 'App Offline'
                : connectivity.reason === 'captive_or_unreachable'
                ? 'No Internet'
                : 'Offline Ready'}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              markCleanSessionExit();
              window.location.reload();
            }}
            title="Reload app preview (stays in full screen)"
            aria-label="Reload app preview"
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() =>
              void store.updateSettings(
                { themeMode: snapshot.settings.themeMode === 'dark' ? 'light' : 'dark' },
                { silent: true }
              )
            }
            title={
              snapshot.settings.themeMode === 'dark'
                ? 'Switch to Warm Light mode'
                : 'Switch to Original Woodland Dark mode'
            }
            aria-label={
              snapshot.settings.themeMode === 'dark'
                ? 'Switch to Light mode'
                : 'Switch to Dark mode'
            }
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
          >
            {snapshot.settings.themeMode === 'dark' ? (
              <Sun className="w-4 h-4 text-[var(--barn-terracotta)]" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--barn-ink)]" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowShortcutsHelp(true)}
            title="Keyboard shortcuts help (?)"
            aria-label="Keyboard shortcuts help"
            aria-keyshortcuts="?"
            className="hidden sm:inline-flex min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] items-center justify-center transition-colors text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() =>
              route === 'importExport' ? setRoute('dashboard') : openImportExportHub('all')
            }
            aria-current={route === 'importExport' ? 'page' : undefined}
            title={
              route === 'importExport'
                ? `Back to ${activeSpeciesName}`
                : 'Import / Export Hub (Shortcut: I)'
            }
            aria-label={
              route === 'importExport' ? `Back to ${activeSpeciesName}` : 'Import / Export Hub'
            }
            className={`md:hidden min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5 ${
              route === 'importExport'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Import / Export</span>
          </button>

          <button
            type="button"
            onClick={() => setRoute(route === 'settings' ? 'dashboard' : 'settings')}
            aria-current={route === 'settings' ? 'page' : undefined}
            aria-keyshortcuts="s"
            title={
              route === 'settings'
                ? `Back to ${activeSpeciesName}`
                : 'Settings (Shortcut: S)'
            }
            aria-label={
              route === 'settings' ? `Back to ${activeSpeciesName}` : 'Settings'
            }
            className={`min-h-[44px] sm:min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              route === 'settings'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">{route === 'settings' ? 'Back' : 'Settings'}</span>
            <span className="hidden sm:inline">
              {route === 'settings' ? `Back to ${activeSpeciesName}` : 'Settings'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 w-full min-w-0 max-w-7xl mx-auto px-3 sm:px-6 pt-5 space-y-5 focus:outline-none"
      >
        {/* Offline Barn Mode Banner on Mobile */}
        {!isOnline && (
          <div className="sm:hidden bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-xl px-3.5 py-2 text-xs font-medium flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span className="truncate">
                {connectivity.reason === 'manual_offline'
                  ? 'Manual App Offline Mode — network actions held locally.'
                  : connectivity.reason === 'captive_or_unreachable'
                  ? 'Unreachable or captive Wi-Fi — saving locally.'
                  : 'Offline Barn Mode — all records saved locally on device.'}
              </span>
            </span>
          </div>
        )}

        {/* Release Status / Upgrade Gate Block Warning */}
        {pwaUpdate.policy !== 'pinned' &&
          pwaUpdate.gateDecision &&
          !pwaUpdate.gateDecision.canProceedWithDirectSwSwap && (
            <div
              role="alert"
              className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold">{pwaUpdate.gateDecision.headline}</div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {pwaUpdate.gateDecision.detail}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {pwaUpdate.gateDecision.status === 'requires_verified_backup' && (
                  <button
                    type="button"
                    onClick={() => void store.createAndVerifyPreUpgradeBackup()}
                    className="min-h-[34px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                  >
                    Verify &amp; Download Safety Backup
                  </button>
                )}
                {route !== 'settings' && (
                  <button
                    type="button"
                    onClick={() => setRoute('settings')}
                    className="min-h-[34px] max-w-full px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold"
                  >
                    Manage Updates in Settings
                  </button>
                )}
              </div>
            </div>
          )}

        {/* Manual Service Worker Update Gate with Policy Governor & Open-Dialog Protection */}
        {pwaUpdate.policy !== 'pinned' &&
          pwaUpdate.updateAvailable &&
          !pwaUpdate.dismissed &&
          (pwaUpdate.policy === 'notify' ? (
            <div
              role="status"
              aria-live="polite"
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-ink)] rounded-xl px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2 text-[var(--barn-muted)]">
                <RefreshCw className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>
                  <strong className="text-[var(--barn-ink)]">App Update Available</strong> (passive notify mode).
                </span>
              </span>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {route !== 'settings' && (
                  <button
                    type="button"
                    onClick={() => setRoute('settings')}
                    className="min-h-[30px] max-w-full px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)]"
                  >
                    Review in Settings
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismissPwaUpdate}
                  className="min-h-[30px] px-2 text-[11px] underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <div
              role="status"
              aria-live="polite"
              className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <RefreshCw className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold">App Update Ready Offline</div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {hasOpenModal
                      ? 'Update deferred while a dialog or editor is open. Save and close your open window before applying so unsaved edits are protected.'
                      : 'A newer cached version of Community Pedigree is ready. Apply now to reload cleanly across open tabs.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <button
                  type="button"
                  disabled={hasOpenModal || pwaUpdate.applying}
                  onClick={() => void applyPwaUpdate()}
                  title={
                    hasOpenModal
                      ? 'Close the active editor dialog first to protect unsaved changes'
                      : 'Activate waiting update and reload cleanly'
                  }
                  className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pwaUpdate.applying
                    ? 'Applying Update...'
                    : hasOpenModal
                    ? 'Finish Editing First'
                    : 'Apply Update & Reload'}
                </button>
                <button
                  type="button"
                  onClick={dismissPwaUpdate}
                  className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] underline"
                >
                  Later
                </button>
              </div>
            </div>
          ))}

        {/* Home Screen Install & Storage Eviction Defense Prompt */}
        {showInstallReminder && (
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--barn-muted)]">
              {isIos ? (
                <>
                  <strong className="text-[var(--barn-ink)]">Protect Local Herd Data:</strong> Tap{' '}
                  <strong>Share</strong> &rarr; <strong>Add to Home Screen</strong> on iOS Safari so
                  your offline barn database stays immune to 7-day tab cleanup.
                </>
              ) : (
                <>
                  <strong className="text-[var(--barn-ink)]">Install Offline Barn PWA:</strong>{' '}
                  Add Community Pedigree to your Home Screen / Desktop for airplane-mode access and
                  elevated storage lock.
                </>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              {canPromptInstall && (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                >
                  Install App
                </button>
              )}
              <button
                type="button"
                onClick={() => setDismissedInstallBanner(true)}
                className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] text-[var(--barn-muted)] underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Idle Export Canary Warning Banner (IMP-018) */}
        {store.exportCanaryWarning && (
          <div
            role="alert"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold">Backup Canary Integrity Warning</div>
                <div className="text-[11px] text-[var(--barn-muted)] break-words">
                  {store.exportCanaryWarning}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              {route !== 'importExport' && (
                <button
                  type="button"
                  onClick={() => openImportExportHub('backup')}
                  className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                >
                  Open Backups
                </button>
              )}
              <button
                type="button"
                onClick={store.dismissExportCanaryWarning}
                className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Proactive Unbacked-Edits Reminder Banner (IMP-001) */}
        {store.backupStatus &&
          store.backupStatus.showDismissibleBanner &&
          route !== 'importExport' && (
          <div
            role="status"
            className="w-full bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div className="w-full md:w-auto md:min-w-0 md:flex-1 space-y-1">
              <div className="font-semibold leading-snug">{store.backupStatus.headline}</div>
              <div className="text-[11px] leading-relaxed text-[var(--barn-muted)]">
                {store.backupStatus.detail}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:shrink-0">
              {store.opfsSupported && (
                <button
                  type="button"
                  disabled={vaultBannerLock.isSubmitting}
                  aria-busy={vaultBannerLock.isSubmitting}
                  onClick={() =>
                    void vaultBannerLock.runLocked(() =>
                      store.saveManualOpfsVaultBackup('Banner 1-click save')
                    )
                  }
                  className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-60"
                >
                  {vaultBannerLock.isSubmitting ? 'Saving...' : 'Save to Vault'}
                </button>
              )}
              <button
                type="button"
                onClick={() => openImportExportHub('backup')}
                className={`min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                  store.opfsSupported
                    ? 'border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]'
                    : 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                }`}
              >
                Open Backups
              </button>
              <button
                type="button"
                onClick={() => void store.snoozeBackupReminder(24)}
                className="min-h-[44px] sm:min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
              >
                Snooze 24h
              </button>
            </div>
          </div>
        )}

        {/* Clock Skew / Drift Nudge Banner (IMP-023) */}
        {connectivity.clockDriftWarning && !dismissedClockDriftBanner && (
          <div
            role="status"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <Clock
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold">
                  Device Clock Appears Off ({formatClockSkewHuman(connectivity.clockSkewMs)})
                </div>
                <div className="text-[11px] text-[var(--barn-muted)]">
                  Multi-worker sync timestamps are automatically compensated so your edits stay in
                  order, though checking your device&apos;s Date &amp; Time settings keeps due-date
                  alerts accurate.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissedClockDriftBanner(true)}
              className="min-h-[44px] sm:min-h-[32px] px-2.5 text-[11px] underline whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Polite WebAssembly-Unavailable / Older Browser Compatibility Notice */}
        {!dismissedCompatBanner &&
          (deviceCapability.browserCompatibility.wasmFallbackActive ||
            /json fallback/i.test(store.engineName) ||
            deviceCapability.browserCompatibility.isOutdatedBrowser) && (
            <div
              role="status"
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold">
                    {deviceCapability.browserCompatibility.wasmFallbackActive ||
                    /json fallback/i.test(store.engineName)
                      ? 'Compatibility Storage Mode Active (IndexedDB JSON)'
                      : 'Older Browser Compatibility Mode Active'}
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {deviceCapability.browserCompatibility.wasmFallbackActive ||
                    /json fallback/i.test(store.engineName)
                      ? 'WebAssembly is unavailable or blocked in this browser, so your barn data saves safely in IndexedDB JSON mode instead of SQLite. Use Timestamped Backup (.JSON) for full exports.'
                      : 'You are on an older browser version. Core herd and pedigree tracking remain ready; if large .ZIP exports struggle, use Timestamped Backup (.JSON) instead.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {route !== 'importExport' && (
                  <button
                    type="button"
                    onClick={() => openImportExportHub('backup')}
                    className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)]"
                  >
                    Open Backups &amp; Compatibility
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDismissedCompatBanner(true)}
                  className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

        {/* Actionable Error / Quota / Persistence Failure Recovery Banner */}
        {store.errorMessage && (
          <div
            role="alert"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs font-medium flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span className="break-words">{store.errorMessage}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              {route !== 'importExport' && (
                <button
                  type="button"
                  onClick={() => openImportExportHub('backup')}
                  className="min-h-[44px] sm:min-h-[30px] max-w-full px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                >
                  Open Recovery &amp; Backups
                </button>
              )}
              <button
                type="button"
                onClick={store.clearErrorMessage}
                className="underline text-[11px] shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Transient Barn Action Feedback Banner */}
        {store.statusMessage && (
          <div
            role="status"
            className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-3"
          >
            <span className="min-w-0 flex-1 break-words">{store.statusMessage}</span>
            <button
              type="button"
              onClick={store.clearStatusMessage}
              className="underline text-[11px] shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Post-Import Conflict Alert Banner (Non-Blocking Import With Locate Action) */}
        {store.importConflictAlert && (
          <div
            role="alert"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-0.5 min-w-0">
                <div className="font-semibold">
                  Import Conflict Alert ({store.importConflictAlert.conflictedCount} flagged record
                  {store.importConflictAlert.conflictedCount === 1 ? '' : 's'})
                </div>
                <div className="text-[11px] text-[var(--barn-muted)] break-words">
                  {store.importConflictAlert.message}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <button
                type="button"
                onClick={() => {
                  const targetSpecies =
                    store.importConflictAlert?.speciesNames[0] || activeSpeciesName;
                  store.locateConflictsInHerd(targetSpecies);
                  store.dismissImportConflictAlert();
                }}
                className="min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
              >
                Locate Conflicted Animals
              </button>
              <button
                type="button"
                onClick={store.dismissImportConflictAlert}
                className="min-h-[32px] px-2 text-[11px] underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Contextual Species Switcher Bar inside any Species Workspace */}
        {route !== 'home' &&
          route !== 'settings' &&
          route !== 'importExport' &&
          route !== 'techyStuff' &&
          route !== 'prompts' &&
          route !== 'suggestions' && (
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="active-species-switcher"
                className="text-xs text-[var(--barn-muted)]"
              >
                Active Livestock Workspace:
              </label>
              <select
                id="active-species-switcher"
                value={activeSpeciesName}
                onChange={(e) => store.selectSpeciesWorkspace(e.target.value, route)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-semibold"
              >
                {snapshot.speciesProfiles.map((sp) => (
                  <option key={sp.id} value={sp.name}>
                    {sp.name}
                  </option>
                ))}
              </select>

              <span className="text-xs text-[var(--barn-muted)] hidden md:inline">
                {activeSpeciesData.speciesProfile.maleLabel} /{' '}
                {activeSpeciesData.speciesProfile.femaleLabel} /{' '}
                {activeSpeciesData.speciesProfile.offspringLabel} ·{' '}
                {activeSpeciesData.speciesProfile.gestationDays}d gestation
              </span>
            </div>

            <button
              type="button"
              onClick={() => setRoute('home')}
              className="text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline whitespace-nowrap"
            >
              Switch Species Home
            </button>
          </div>
        )}

        {/* Active Screen Viewport */}
        {route === 'home' && (
          <HomeSpeciesScreen
            snapshot={snapshot}
            onOpenSpecies={store.selectSpeciesWorkspace}
            onMoveSpeciesCard={(id, dir) => {
              void store.moveSpeciesCard(id, dir);
            }}
            onReorderSpeciesCards={(ids) => {
              void store.reorderSpeciesCards(ids);
            }}
            onSaveBarnName={(name) => {
              void store.updateSettings(
                { barnName: name, barnNameOnboarded: true },
                { silent: false }
              );
            }}
            onHideSummaryGrid={() => {
              void store.updateSettings(
                { showHomeSummaryGrid: false },
                { silent: true }
              );
            }}
            onIgnoreTaskAlerts={(taskIds) => {
              void store.ignoreTaskAlertsPermanently(taskIds);
            }}
            onClearTaskAlertGroup={(speciesName, taskIds) => {
              void store.clearTaskAlertGroup(speciesName, taskIds);
            }}
            onDismissMemoAlert={(speciesName, signature) => {
              void store.dismissSpeciesMemoAlert(speciesName, signature);
            }}
            dismissedWithdrawalSpecies={dismissedWithdrawalSpecies}
            onDismissWithdrawalAlert={(speciesName) => {
              const key = speciesName.trim().toLowerCase();
              if (!key) return;
              setDismissedWithdrawalSpecies((prev) => (prev.includes(key) ? prev : [...prev, key]));
            }}
            onOpenWithdrawalHerd={(speciesName) => {
              store.selectSpeciesWorkspace(speciesName, 'herd');
              setRequestedHerdWithdrawalNonce((n) => n + 1);
            }}
            onToggleTaskCompleted={(task) => {
              void store.toggleTaskCompleted(task);
            }}
            onExportTasksToCalendar={(tasks, hint) => {
              store.exportTasksToCalendar(tasks, hint);
            }}
            onNavigateToAddSpecies={() => {
              store.setOpenAddSpeciesInSettings(true);
              setRoute('settings');
            }}
            deviceCapability={deviceCapability}
            onApplyLowMemorySettings={(patch) => {
              void store.updateSettings(patch);
            }}
            onOpenSettings={() => setRoute('settings')}
            onOpenImportExportHub={openImportExportHub}
          />
        )}

        {route !== 'home' && (
          <RouteErrorBoundary
            routeKey={`${route}:${activeSpeciesName}`}
            routeLabel={ROUTE_LABELS[route]}
            onNavigateHome={() => setRoute('home')}
          >
            <Suspense fallback={<RouteLoadingFallback label={ROUTE_LABELS[route]} />}>
              {route === 'dashboard' && (
                <SpeciesDashboardScreen
                  snapshot={snapshot}
                  activeData={activeSpeciesData}
                  settings={snapshot.settings}
                  isPinned={isActivePinned}
            existingSpeciesNames={snapshot.speciesProfiles.map((sp) => sp.name)}
            onNavigate={setRoute}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onToggleTask={store.toggleTaskCompleted}
            onCompleteBreedingTask={store.completeBreedingTaskWithOutcome}
            onRecalculatePostBirthTasks={store.recalculateBreedingPostBirthTasks}
            onSaveTask={store.saveTask}
            onDeleteTask={store.deleteTask}
            onSaveCage={store.saveCage}
            onDeleteCage={store.deleteCage}
            onAssignAnimalToCage={store.assignAnimalToCage}
            onSaveShow={store.saveShow}
            onDeleteShow={store.deleteShow}
            onSeedSpeciesSample={store.seedSpeciesSampleData}
            onTogglePinSpecies={(speciesName) => {
              void store.togglePinSpeciesLanding(speciesName);
            }}
            onSaveSpecies={(profile) => store.saveSpeciesProfile(profile)}
            onDeleteSpecies={(profile) => {
              void store.deleteSpeciesProfile(profile);
            }}
            onDeleteSpeciesTestingData={(speciesName) => {
              void store.deleteSpeciesTestingData(speciesName);
            }}
            onDeleteSpeciesNonTestingData={(speciesName) => {
              void store.deleteSpeciesNonTestingData(speciesName);
            }}
            onDeleteAllSpeciesRecords={(speciesName) => {
              void store.deleteAllSpeciesRecords(speciesName);
            }}
            onDownloadTimestampedSpeciesBackup={store.exportTimestampedSpeciesBackup}
            onMigrateAnimalsSpecies={async (ids, targetSpecies, options) => {
              await store.migrateAnimalsSpecies(ids, targetSpecies, options);
            }}
            onMoveHubBlock={(blockId, dir) => {
              void store.moveSpeciesHubBlock(activeSpeciesName, blockId, dir);
            }}
            onReorderHubBlocks={(orderedIds) => {
              void store.reorderSpeciesHubBlocks(activeSpeciesName, orderedIds);
            }}
            onExportTaskToCalendar={(task) => {
              store.exportTasksToCalendar(
                [task],
                formatSystemTaskTitle(task, snapshot.settings.calendarSync, snapshot)
              );
            }}
            onCopyTaskAppLink={(task) => {
              void store.copyTaskAppLink(task);
            }}
            highlightedTaskId={store.highlightedTaskId}
            onClearHighlightedTask={() => store.setHighlightedTaskId(null)}
            highlightedCageId={store.highlightedCageId}
            onClearHighlightedCage={() => store.setHighlightedCageId(null)}
            onHideSummaryGrid={() => {
              void store.updateSettings(
                { showHomeSummaryGrid: false },
                { silent: true }
              );
            }}
            onLocateConflicts={() => store.locateConflictsInHerd(activeSpeciesName)}
            onOpenSettings={() => setRoute('settings')}
            onOpenImportExportHub={openImportExportHub}
            onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
          />
        )}

        {route === 'herd' && (
          <HerdScreen
            snapshot={snapshot}
            activeData={activeSpeciesData}
            allAnimals={snapshot.animals}
            speciesProfiles={snapshot.speciesProfiles}
            settings={snapshot.settings}
            selectedAnimalId={store.selectedAnimalId}
            onSelectAnimal={store.setSelectedAnimalId}
            onOpenPedigreeForAnimal={(id) => {
              store.setPedigreeAnimalId(id);
              setRoute('pedigree');
            }}
            onSaveAnimal={(draft, pendingPhotos) =>
              store.saveAnimal(draft, undefined, pendingPhotos)
            }
            onAddAnimalPhotos={store.addOptimizedAnimalPhotos}
            onSetPrimaryAnimalPhoto={store.setPrimaryAnimalPhoto}
            onUpdateAnimalPhotoCaption={store.updateAnimalPhotoCaption}
            onDeleteAnimalPhoto={store.deleteAnimalPhoto}
            onDeleteAnimal={(animal) => {
              void store.deleteAnimal(animal);
            }}
            onArchiveAnimals={(ids, archived) => store.archiveAnimals(ids, archived)}
            onDeleteAnimalsBatch={(ids) => {
              void store.deleteAnimalsBatch(ids);
            }}
            onMigrateAnimalsSpecies={async (ids, targetSpecies, options) => {
              await store.migrateAnimalsSpecies(ids, targetSpecies, options);
            }}
            onToggleIncludePhotoOnPedigree={(include) => {
              void store.updateSettings({ includePhotoOnPedigree: include }, { silent: true });
            }}
            onAddCareLog={(draft) => store.addCareLog(draft)}
            onDeleteCareLog={(id) => {
              void store.deleteCareLog(id);
            }}
            onIgnoreConflicts={(animalId, kinds) => {
              void store.ignoreAnimalConflicts(animalId, kinds);
            }}
            onRestoreConflictAlert={(animalId, kinds) => {
              void store.restoreAnimalConflictAlert(animalId, kinds);
            }}
            requestedConflictFocusNonce={store.requestedHerdConflictNonce}
            requestedWithdrawalFocusNonce={requestedHerdWithdrawalNonce}
            onConsumeWithdrawalFocus={() => setRequestedHerdWithdrawalNonce(0)}
            onLoadFullPhoto={store.loadAnimalPhotoDataUrl}
            onLoadFullPhotosBatch={store.loadAnimalPhotoDataUrlsBatch}
            opfsSupported={store.opfsSupported}
            archivedHerdBundles={store.archivedHerdBundles}
            onOffloadAnimalsToOpfsArchive={store.offloadAnimalsToOpfsArchive}
            onRestoreArchivedHerdBundle={store.restoreArchivedHerdBundle}
            onDownloadArchivedHerdBundle={store.downloadArchivedHerdBundle}
            onDeleteArchivedHerdBundle={store.deleteArchivedHerdBundle}
            onOpenBarnBench={() => setRoute('bench')}
            onCompareGrowthForAnimals={store.openGrowthCompareForAnimals}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onSaveWoolHarvest={store.saveWoolHarvest}
            onDeleteWoolHarvest={store.deleteWoolHarvest}
            isConstrainedDevice={deviceCapability.assessment.shouldApplyLowMemoryHandling}
          />
        )}

        {route === 'bench' && (
          <BarnBenchScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onCommitEntry={store.commitBarnBenchEntry}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onBackToHub={() => setRoute('dashboard')}
          />
        )}

        {route === 'breeding' && (
          <BreedingScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onLogBreeding={(params) => store.logBreedingWithCascade(params)}
            onUpdateOutcome={(existing, patch) => store.updateBreedingOutcome(existing, patch)}
            onRecalculatePostBirthTasks={(breedingId) =>
              store.recalculateBreedingPostBirthTasks(breedingId)
            }
            onDeleteBreeding={(id) => {
              void store.deleteBreeding(id);
            }}
            preselectedGrowthAnimalIds={store.preselectedGrowthAnimalIds}
            onConsumePreselectedGrowthAnimalIds={() => store.setPreselectedGrowthAnimalIds(null)}
            onSaveTargetWeightCurve={store.updateSpeciesTargetWeightCurve}
          />
        )}

        {route === 'pedigree' && (
          <PedigreeScreen
            activeData={activeSpeciesData}
            allAnimals={snapshot.animals}
            speciesProfiles={snapshot.speciesProfiles}
            settings={snapshot.settings}
            selectedSubjectId={store.pedigreeAnimalId}
            generations={store.pedigreeGenerations}
            onSelectSubject={store.setPedigreeAnimalId}
            onChangeGenerations={store.setPedigreeGenerations}
            onOpenAnimalInHerd={(id) => {
              store.setSelectedAnimalId(id);
              setRoute('herd');
            }}
            onToggleIncludePhotoOnPedigree={(include) => {
              void store.updateSettings({ includePhotoOnPedigree: include }, { silent: true });
            }}
            onSaveAnimal={(draft, linkTarget, pendingPhotos) =>
              store.saveAnimal(draft, linkTarget, pendingPhotos)
            }
            onIgnoreConflicts={(animalId, kinds) => {
              void store.ignoreAnimalConflicts(animalId, kinds);
            }}
            onRestoreConflictAlert={(animalId, kinds) => {
              void store.restoreAnimalConflictAlert(animalId, kinds);
            }}
            onLoadFullPhoto={store.loadAnimalPhotoDataUrl}
            onLoadFullPhotosBatch={store.loadAnimalPhotoDataUrlsBatch}
            onLoadPedigreeNeighborhood={store.loadPedigreeNeighborhood}
            onCheckPedigreeBranchesHaveAncestors={store.checkPedigreeBranchesHaveAncestors}
            onUpdateBreederLogo={(dataUrl) => {
              void store.updateSettings({ breederLogoDataUrl: dataUrl }, { silent: true });
            }}
          />
        )}

        {route === 'feed' && (
          <FeedLedgerScreen
            snapshot={snapshot}
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onBackToHub={() => setRoute('dashboard')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onSaveFeedBatch={store.saveFeedBatch}
            onDeleteFeedBatch={store.deleteFeedBatch}
            onLogFeedAllocation={store.logFeedAllocation}
            onDeleteFeedAllocation={store.deleteFeedAllocation}
            onRunBiosecurityPurge={store.runFeedTagBiosecurityAutoPurge}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
          />
        )}

        {route === 'economics' && (
          <EconomicsLedgerScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onBackToHub={() => setRoute('dashboard')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onSaveLedgerEntry={store.saveLedgerEntry}
            onDeleteLedgerEntry={store.deleteLedgerEntry}
            onSaveProcessingLog={store.saveProcessingLog}
            onDeleteProcessingLog={store.deleteProcessingLog}
            onSaveYouthProjectBook={store.saveYouthProjectBook}
            onDeleteYouthProjectBook={store.deleteYouthProjectBook}
          />
        )}

        {route === 'crm' && (
          <ClientCrmScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onBackToHub={() => setRoute('dashboard')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onOpenReports={() => setRoute('reports')}
            onSaveClient={store.saveClientContact}
            onDeleteClient={store.deleteClientContact}
            onSaveWaitlistEntry={store.saveWaitlistEntry}
            onDeleteWaitlistEntry={store.deleteWaitlistEntry}
            onSaveReservation={store.saveAnimalReservation}
            onDeleteReservation={store.deleteAnimalReservation}
            onCompleteReservationSale={store.completeReservationSale}
            onCreateReminderTask={store.createCrmReminderTask}
          />
        )}

        {route === 'reports' && (
          <ReportsScreen
            snapshot={snapshot}
            activeSpeciesName={activeSpeciesName}
            speciesProfiles={snapshot.speciesProfiles}
            onSelectSpecies={(name) => store.selectSpeciesWorkspace(name, 'reports')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
          />
        )}

        {route === 'memo' && (
          <SpeciesMemoScreen
            speciesProfile={activeSpeciesData.speciesProfile}
            onSaveMemo={store.saveSpeciesMemo}
            onBackToHub={() => setRoute('dashboard')}
          />
        )}

        {route === 'importExport' && (
          <ImportExportHubScreen
            snapshot={snapshot}
            engineName={store.engineName}
            activeSpeciesName={activeSpeciesName}
            deviceId={store.deviceId}
            backupStatus={store.backupStatus}
            syncOperations={store.syncOperations}
            syncConflicts={store.syncConflicts}
            initialSection={importExportInitialSection}
            onConsumedInitialSection={() => setImportExportInitialSection('all')}
            onOpenSettings={() => setRoute('settings')}
            onOpenReports={() => setRoute('reports')}
            recordBackupExport={store.recordBackupExport}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onApplyPlatformImport={store.applyPlatformImportPreview}
            onImportJson={store.importJsonBackup}
            onImportBackupArchive={store.importBackupArchiveBytes}
            onImportDeltaOperations={store.importDeltaOperations}
            onResolveSyncConflict={store.resolveSyncConflict}
            onDismissSyncConflict={store.dismissSyncConflict}
            onBuildLocalDeltaJson={store.buildLocalDeltaJsonPayload}
            onRestoreRollingBackup={store.restoreRollingBackupByKey}
            onExportSqliteBytes={store.exportSqliteBytes}
            onInspectSqliteRestoreBytes={store.inspectSqliteRestoreBytes}
            onImportSqliteBytes={store.importSqliteBytes}
            deviceCapability={deviceCapability}
            onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
            opfsSupported={store.opfsSupported}
            opfsVaultBackups={store.opfsVaultBackups}
            rollingBackups={store.rollingBackups}
            archivedHerdBundles={store.archivedHerdBundles}
            onSaveManualOpfsVaultBackup={store.saveManualOpfsVaultBackup}
            onCreateVerifiedPreUpgradeBackup={store.createAndVerifyPreUpgradeBackup}
            onRestoreOpfsVaultBackup={store.restoreOpfsVaultBackup}
            onDownloadOpfsVaultBackup={store.downloadOpfsVaultBackupByKey}
            onDeleteOpfsVaultBackup={store.deleteOpfsVaultBackupByKey}
            onDeleteRollingBackup={store.deleteRollingIdbBackupByKey}
            onRestoreArchivedHerdBundle={store.restoreArchivedHerdBundle}
            onDownloadArchivedHerdBundle={store.downloadArchivedHerdBundle}
            onDeleteArchivedHerdBundle={store.deleteArchivedHerdBundle}
            backupSyncStatus={store.backupSyncStatus}
            pruneSyncWarning={store.pruneSyncWarning}
            onConnectBackupSync={store.connectBackupSyncFolder}
            onReauthorizeBackupSync={store.reauthorizeBackupSyncFolder}
            onDisconnectBackupSync={store.disconnectBackupSyncFolder}
            onSyncVaultToSyncNow={store.syncVaultBackupsToSyncNow}
            onDismissPruneWarning={store.dismissPruneSyncWarning}
          />
        )}

        {route === 'settings' && (
          <SettingsAndSyncScreen
            snapshot={snapshot}
            activeSpeciesName={activeSpeciesName}
            storageStatus={store.storageStatus}
            backupStatus={store.backupStatus}
            openAddSpeciesOnMount={store.openAddSpeciesInSettings}
            onConsumedOpenAddSpecies={() => store.setOpenAddSpeciesInSettings(false)}
            recordBackupExport={store.recordBackupExport}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onSaveSpecies={(profile) => store.saveSpeciesProfile(profile)}
            onDeleteSpecies={(profile) => {
              void store.deleteSpeciesProfile(profile);
            }}
            onDownloadTimestampedSpeciesBackup={store.exportTimestampedSpeciesBackup}
            onExportTasksToCalendar={store.exportTasksToCalendar}
            googleAuthConnected={store.googleAuthConnected}
            googleUserEmail={store.googleUserEmail}
            googleCalendars={store.googleCalendars}
            googleSyncBusy={store.googleSyncBusy}
            onConnectGoogleCalendar={store.connectGoogleCalendar}
            onDisconnectGoogleCalendar={store.disconnectGoogleCalendar}
            onRefreshGoogleCalendars={store.refreshGoogleCalendars}
            deviceCapability={deviceCapability}
            onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
            opfsSupported={store.opfsSupported}
            opfsVaultBackups={store.opfsVaultBackups}
            rollingBackups={store.rollingBackups}
            onOpenImportExportHub={openImportExportHub}
            onOpenTechyStuff={() => setRoute('techyStuff')}
          />
        )}

        {route === 'techyStuff' && (
          <TechyStuffErrorBoundary
            onExitToSettings={() => setRoute('settings')}
            onExitToHome={() => setRoute('home')}
          >
            <TechyStuffScreen
              snapshot={snapshot}
              engineName={store.engineName}
              storageStatus={store.storageStatus}
              opfsSupported={store.opfsSupported}
              opfsVaultBackups={store.opfsVaultBackups}
              deviceCapability={deviceCapability}
              onBackToSettings={() => setRoute('settings')}
              onOpenImportExportHub={openImportExportHub}
              onOpenPromptsDirectory={() => setRoute('prompts')}
              onOpenSuggestionsBacklog={() => setRoute('suggestions')}
              onRefreshStorageStatus={store.refreshStorageStatus}
              onRequestPersistentStorage={store.triggerPersistentStorageRequest}
              onPurgeOpfsTmp={store.purgeOpfsTempWorkspace}
              onClearLocalSyncAndReminderState={store.clearLocalSyncAndBackupReminderState}
              recordBackupExport={store.recordBackupExport}
              onAnalyzePhotoFootprint={store.analyzePhotoStorageFootprint}
              onPruneOrphanPhotos={store.pruneOrphanAnimalPhotos}
              onReoptimizeOversizedPhotos={store.reoptimizeOversizedAnimalPhotos}
              onPruneFullResPhotoPayloads={store.pruneFullResPhotoPayloadsKeepingThumbnails}
              onScanDatabaseHealth={store.scanDatabaseHealth}
              onRepairDatabaseHealth={store.runHealthCheckAndRepair}
              onResetDatabaseConnection={store.resetDatabaseConnection}
              onPurgeCorruptedCaches={store.purgeCorruptedCachesAndRecover}
              onLocateConflicts={() => store.locateConflictsInHerd(activeSpeciesName)}
              onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
              onSaveManualOpfsVaultBackup={store.saveManualOpfsVaultBackup}
              onCreateVerifiedPreUpgradeBackup={store.createAndVerifyPreUpgradeBackup}
              onSeedAllSpecies={() => {
                void store.seedAllPredefinedSpecies();
              }}
              onClearAllRecords={() => {
                void store.clearAllRecordsKeepSpecies();
              }}
              onRestoreFactoryDefaults={() => {
                void store.restoreFactoryDefaults();
              }}
            />
          </TechyStuffErrorBoundary>
        )}
        {route === 'prompts' && (
          <TechyStuffErrorBoundary
            onExitToSettings={() => setRoute('settings')}
            onExitToHome={() => setRoute('home')}
          >
            <PromptsDirectoryScreen onBackToTechyStuff={() => setRoute('techyStuff')} />
          </TechyStuffErrorBoundary>
        )}
        {route === 'suggestions' && (
          <TechyStuffErrorBoundary
            onExitToSettings={() => setRoute('settings')}
            onExitToHome={() => setRoute('home')}
          >
            <SuggestionsBacklogScreen onBackToTechyStuff={() => setRoute('techyStuff')} />
          </TechyStuffErrorBoundary>
        )}
            </Suspense>
          </RouteErrorBoundary>
        )}

        {/* Quiet Desktop Keyboard Shortcuts Hint Footer */}
        {route !== 'settings' &&
          route !== 'importExport' &&
          route !== 'techyStuff' &&
          route !== 'prompts' &&
          route !== 'suggestions' && (
          <footer className="hidden md:flex items-center justify-between gap-4 pt-3 pb-1 border-t border-[var(--barn-border)]/60 text-[11px] text-[var(--barn-muted)]">
            <span>
              Shortcuts: <kbd className="font-mono font-semibold text-[var(--barn-ink)]">H</kbd> Home ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">D</kbd> Dashboard ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">R</kbd> Herd ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">K</kbd> Bench ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">B</kbd> Breeding ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">P</kbd> Pedigree ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">F</kbd> Feed ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">C</kbd> CRM ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">O</kbd> Reports ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">I</kbd> Import/Export ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">S</kbd> Settings
            </span>
            <button
              type="button"
              onClick={() => setShowShortcutsHelp(true)}
              className="inline-flex items-center gap-1 hover:text-[var(--barn-ink)] underline underline-offset-2"
            >
              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Help &amp; Shortcuts (?)
            </button>
          </footer>
        )}
      </main>

      {/* Online Google Calendar Confirmation + Automatic Offline .ICS Fallback */}
      {store.pendingCalendarSync && (
        <Suspense fallback={null}>
          <CalendarSyncConfirmModal
            pending={store.pendingCalendarSync}
            config={normalizeCalendarSyncSettings(snapshot.settings.calendarSync)}
            barnName={snapshot.settings.barnName}
            context={{
              animals: snapshot.animals,
              breedings: snapshot.breedings,
              speciesProfiles: snapshot.speciesProfiles,
              appBaseUrl:
                typeof window !== 'undefined'
                  ? `${window.location.origin}${window.location.pathname}`
                  : '',
            }}
            isSignedIn={store.googleAuthConnected}
            userEmail={store.googleUserEmail}
            isBusy={store.googleSyncBusy}
            isOnline={isOnline}
            onSignIn={store.connectGoogleCalendar}
            onConfirmGoogleSync={store.confirmGoogleCalendarSync}
            onFallbackOfflineIcs={store.fallbackPendingCalendarSyncToIcs}
            onCancel={store.cancelPendingCalendarSync}
          />
        </Suspense>
      )}

      {/* Blocking Wiped-Browser-Storage Recovery Gate (IMP-018) */}
      {store.wipedRecoveryContext?.detected && (
        <Suspense fallback={null}>
          <WipedStorageRecoveryModal
            context={store.wipedRecoveryContext}
            archivedHerdBundles={store.archivedHerdBundles}
            onRestoreLatestOpfs={store.restoreLatestOpfsOnWipedRecovery}
            onRestoreArchivedBundle={(archiveKey) => store.restoreArchivedHerdBundle(archiveKey)}
            onImportJsonReplace={(jsonText) => store.importJsonBackup(jsonText, 'replace')}
            onImportArchiveReplace={(bytes, fileName) =>
              store.importBackupArchiveBytes(bytes, fileName, 'replace')
            }
            onImportSqlite={store.importSqliteBytes}
            onStartFresh={store.startFreshAfterWipedRecovery}
          />
        </Suspense>
      )}

      {/* Select Livestock Species Before Entering Herd from Home */}
      {showHerdSpeciesPicker && (
        <div
          ref={herdPickerModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="herd-species-picker-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHerdSpeciesPicker(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg p-6 space-y-4 focus:outline-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="herd-species-picker-title" className="font-display text-xl font-semibold">
                  Select Livestock Herd
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Each species keeps its own separate herd, pedigree tree, and records.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHerdSpeciesPicker(false)}
                aria-label="Close species picker"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto">
              {snapshot.speciesProfiles.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => {
                    setShowHerdSpeciesPicker(false);
                    store.selectSpeciesWorkspace(sp.name, 'herd');
                  }}
                  className="min-h-[48px] px-4 py-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] text-left flex items-center justify-between gap-2 transition-colors"
                >
                  <div>
                    <div className="text-sm font-semibold">{sp.name}</div>
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      {sp.maleLabel}s &amp; {sp.femaleLabel}s
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--barn-sage)] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Quick-Reference Modal */}
      {showShortcutsHelp && (
        <div
          ref={shortcutsModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-shortcuts-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShortcutsHelp(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-6 space-y-4 focus:outline-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="keyboard-shortcuts-title" className="font-display text-xl font-semibold">
                  Keyboard Shortcuts &amp; Navigation
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Single-key navigation works anywhere outside text inputs or open modals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                aria-label="Close keyboard shortcuts help"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl text-xs bg-[var(--barn-canvas)]">
              {[
                { key: 'H', label: 'All Species Home', desc: 'View barn summary & species hub list' },
                { key: 'D', label: 'Species Dashboard', desc: 'Open active species overview & tasks' },
                { key: 'R', label: 'Herd Registry', desc: 'Open Herd (or Select Livestock Herd from Home)' },
                { key: 'K', label: 'Barn Bench', desc: 'Fast sequential cage-row entry for weights, BCS, trims & moves' },
                { key: 'B', label: 'Breeding Lab', desc: 'COI pairing check, Punnett predictions & births' },
                { key: 'P', label: 'Pedigree Explorer', desc: 'Interactive 3–6 generation ancestry tree' },
                { key: 'F', label: 'Feed & Lot Ledger', desc: 'Feed purchases, tag OCR lot indexing & biosecurity purge' },
                { key: 'E', label: 'Economics & 4-H Ledger', desc: 'Expenses, receipts, P&L margins, meat/pelt yields & 4-H/FFA books' },
                { key: 'C', label: 'Client CRM & Waitlist', desc: 'Buyer contacts, ranked waitlist matching, deposits & sales agreements' },
                { key: 'O', label: 'Reports', desc: 'Barn reports, printable herd rosters & inventory summaries' },
                { key: 'I', label: 'Import / Export Hub', desc: 'System backups, native restores, sync & external exporters' },
                { key: 'S', label: 'Settings', desc: 'Barn preferences, calendar sync, appearance & diagnostics' },
                { key: '?', label: 'Shortcuts Help', desc: 'Open this quick keyboard reference' },
                { key: 'Tab / Esc', label: 'Dialog Controls', desc: 'Cycle controls inside modals or press Esc to close' },
              ].map((item) => (
                <div
                  key={item.key}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)]">{item.label}</div>
                    <div className="text-[11px] text-[var(--barn-muted)]">{item.desc}</div>
                  </div>
                  <kbd className="px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] font-semibold text-[var(--barn-ink)] shrink-0">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Brief Floating Toast for Keyboard Shortcut Navigation */}
      {shortcutToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 md:bottom-5 right-4 z-40 pointer-events-none bg-[var(--barn-surface)] border border-[var(--barn-sage)] text-[var(--barn-ink)] shadow-lg rounded-xl px-3.5 py-2 text-xs font-medium flex items-center gap-2"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 font-mono text-[11px] font-semibold text-[var(--barn-sage)]">
            {shortcutToast.key}
          </kbd>
          <span>
            {shortcutToast.label === 'Select Herd' || shortcutToast.label === 'Keyboard Shortcuts'
              ? `Opened ${shortcutToast.label}`
              : `Navigated to ${shortcutToast.label}`}
          </span>
        </div>
      )}

      <AsyncErrorToastHost
        onOpenDiagnostics={() => setRoute('techyStuff')}
        isOnSettingsRoute={route === 'techyStuff'}
      />

      {/* Mobile Pocket-First Bottom Navigation Bar (< 768px) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[var(--barn-surface)]/95 backdrop-blur-md border-t border-[var(--barn-border)] grid grid-cols-6 items-center"
      >
        {(
          [
            ['home', 'Species', Home],
            ['dashboard', 'Barn', CalendarCheck],
            ['herd', 'Herd', ListFilter],
            ['breeding', 'Breeding', Sparkles],
            ['pedigree', 'Pedigree', GitFork],
            ['reports', 'Reports', FileBarChart2],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = route === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handlePrimaryNavClick(id)}
              aria-current={active ? 'page' : undefined}
              className={`h-full min-w-0 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-[var(--barn-ink)] font-semibold' : 'text-[var(--barn-muted)]'
              }`}
            >
              <span
                className={`px-2 py-0.5 rounded-full transition-colors ${
                  active
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : ''
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="truncate max-w-full px-0.5">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
```

## `src/index.css`

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-display: "Fraunces", Georgia, serif;
  --font-sans: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

:root {
  --barn-canvas: #f2e9da;
  --barn-surface: #faf5eb;
  --barn-subtle: #e6dac6;
  --barn-border: #cfc0a8;
  --barn-ink: #241e18;
  --barn-muted: #63584a;
  --barn-sage: #2d5e3f;
  --barn-on-sage: #fff8f0;
  --barn-sage-tint: #dcebd9;
  --barn-accent-fill: #8c3f20;
  --barn-accent-on-fill: #fff8f0;
  --barn-terracotta: #a84b28;
  --barn-terracotta-tint: #f5e1d5;
  --barn-slate: #366685;
  --barn-slate-tint: #dde8ef;
  --barn-danger: #b5382b;
  --barn-on-danger: #fff8f0;
}

.dark {
  --barn-canvas: #0f1611;
  --barn-surface: #172219;
  --barn-subtle: #212f24;
  --barn-border: #2e4032;
  --barn-ink: #efece4;
  --barn-muted: #a7b4a6;
  --barn-sage: #8dd6a3;
  --barn-on-sage: #0d2616;
  --barn-sage-tint: #1f3927;
  --barn-accent-fill: #783519;
  --barn-accent-on-fill: #fff8f0;
  --barn-terracotta: #e89572;
  --barn-terracotta-tint: #38251c;
  --barn-slate: #88c0e6;
  --barn-slate-tint: #1d3240;
  --barn-danger: #f28b82;
  --barn-on-danger: #0d2616;
}

html,
body {
  background-color: var(--barn-canvas);
  color: var(--barn-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

.font-display {
  font-family: var(--font-display);
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

:focus-visible {
  outline: 2px solid var(--barn-sage);
  outline-offset: 2px;
}

@layer utilities {
  /* Prevent 1fr CSS Grid tracks from expanding past narrow viewports or card bounds */
  .grid > *:not([class*='min-w-']) {
    min-width: 0;
  }

  /* Global boundary containment for wrapping flex toolbars, headers, banners, and action groups */
  .flex-wrap > * {
    max-width: 100%;
    min-width: 0;
  }

  .flex-wrap.shrink-0,
  .flex-wrap .flex.shrink-0:not([aria-hidden='true']),
  .flex-wrap .inline-flex.shrink-0:not([aria-hidden='true']),
  .flex-wrap button.shrink-0,
  .flex-wrap a.shrink-0 {
    flex-shrink: 1;
    max-width: 100%;
    min-width: 0;
  }

  .flex-wrap > div.flex:not(.overflow-x-auto),
  .flex-wrap > div.inline-flex:not(.overflow-x-auto) {
    flex-wrap: wrap;
    max-width: 100%;
    min-width: 0;
  }

  /* Give flexible text columns inside wrapping rows a minimum threshold before buttons crowd/overflow */
  .flex-wrap > div.flex-1.min-w-0 {
    flex-basis: min(100%, 15rem);
  }

  /* Allow nowrap buttons/links inside wrapping containers to wrap safely when narrower than container */
  .flex-wrap button.whitespace-nowrap,
  .flex-wrap a.whitespace-nowrap {
    max-width: 100%;
    white-space: normal;
  }
}

@media print {
  :root,
  .dark,
  html,
  body,
  #root {
    color-scheme: light only !important;
    background: #ffffff !important;
    background-color: #ffffff !important;
    color: #000000 !important;
  }

  * {
    box-shadow: none !important;
    text-shadow: none !important;
    -webkit-print-color-adjust: economy !important;
    print-color-adjust: economy !important;
  }
}
```

## `src/main.tsx`

```tsx
import './utils/es2018Shims';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { CrashErrorBoundary } from './components/CrashErrorBoundary.tsx';
import './index.css';
import { installGlobalCrashHandlers } from './storage/crashLogger.ts';
import { initPwaUpdater } from './storage/pwaUpdateManager.ts';

declare global {
  interface Window {
    __PEDIGREE_BOOT_OK__?: boolean;
    __PEDIGREE_PREFLIGHT_BLOCKED__?: boolean;
    __PEDIGREE_RECORD_BOOT_CRASH__?: () => void;
    __PEDIGREE_MARK_BOOT_STABLE__?: () => void;
    __PEDIGREE_PREFLIGHT__?: {
      passed: boolean;
      wasmSupported: boolean;
      blockedReasons: string[];
    };
  }
}

if (typeof window !== 'undefined') {
  window.__PEDIGREE_BOOT_OK__ = true;
}

if (typeof window === 'undefined' || !window.__PEDIGREE_PREFLIGHT_BLOCKED__) {
  installGlobalCrashHandlers();

  if (import.meta.env.PROD) {
    initPwaUpdater(registerSW);
  } else if (typeof window !== 'undefined') {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister();
        }
      });
    }
    if ('caches' in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) {
          void caches.delete(key);
        }
      });
    }
  }

  const rootElement = document.getElementById('root');
  if (rootElement) {
    createRoot(rootElement).render(
      <CrashErrorBoundary>
        <App />
      </CrashErrorBoundary>
    );
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.__PEDIGREE_MARK_BOOT_STABLE__?.();
      }, 2500);
    }
  }
}
```

## `src/components/AnimalEditorModal.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Animal Registry Editor Modal.
 *
 * Strictly filters Sire and Dam candidates to the animal's exact `species` AND validates
 * against pedigree cycles (`wouldCreateCycle`). Includes Evans-inspired phenotype-to-genotype
 * baseline presets (`New Zealand Red -> A_ B_ C_ D_ ee ww`, etc.) when editing Rabbits.
 */

import { AlertCircle, AlertTriangle, Camera, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';
import React, { useId, useMemo, useRef, useState } from 'react';
import {
  findAllSpeciesDuplicateTattooPeers,
  findOffspringRequiringParentSex,
  findSameSexDuplicateTattooCollisions,
  isOverrideConfirmationValid,
} from '../core/animalConflicts';
import {
  CageAssignmentCapacityWarning,
  evaluateAnimalActiveWithdrawal,
  evaluateCageAssignmentCapacityWarning,
  evaluateSpeciesCagesOccupancy,
  evaluateWithdrawalDispositionWarning,
  isCageOccupyingAnimal,
  normalizeCageLabelKey,
  WithdrawalDispositionWarning,
} from '../core/barnAlerts';
import {
  extractHomozygousCoatClearances,
  getAnimalCarrierDisclosures,
  getCarrierTraitSuggestionsForSpecies,
  normalizeCarrierTraitList,
  reconcileCarrierTraitLists,
} from '../core/carrierGenetics';
import {
  buildPresetGenotypeWithConfirmations,
  getGeneticsSpecForSpecies,
  getSpeciesVarietyPresets,
  parseGenotypeString,
  setLocusInGenotypeString,
  VarietyPresetDefinition,
} from '../core/geneticsEngine';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  ImageOptimizationPresetId,
  OptimizedImagePayload,
  resolveImageOptimizationPreset,
} from '../core/imageOptimizationSpec';
import {
  ANIMAL_STATUSES,
  Animal,
  AnimalStatus,
  BiologicalSex,
  CageLocation,
  CareLog,
  CLEARED_CARRIER_PROOF_LABELS,
  ClearedCarrierProofType,
  ClearedCarrierRecord,
  doesAnimalNeedAttention,
  formatReadableDate,
  formatSexForSpecies,
  formatWeightInputValue,
  getSpeciesIdentifierLabels,
  getWeightInputMeta,
  isAnimalArchived,
  isSameSpecies,
  normalizeCurrencyCode,
  normalizeOwnershipType,
  normalizeRufusLevel,
  OWNERSHIP_TYPES,
  OwnershipType,
  parseWeightInputToGrams,
  RUFUS_LEVEL_OPTIONS,
  RufusLevel,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
} from '../core/models';
import {
  buildSpeciesHerdMap,
  calculatePairingCoi,
  getPedigreeCompletenessSummary,
  wouldCreateCycle,
} from '../core/pedigreeCalculator';
import {
  MAX_PHOTO_BATCH_COUNT,
  MAX_PHOTO_UPLOAD_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { CarrierTraitCombobox } from './CarrierTraitCombobox';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { SearchableParentPicker } from './SearchableParentPicker';

interface AnimalEditorModalProps {
  initialAnimal: Animal | null;
  speciesProfile: SpeciesProfile;
  speciesAnimals: Animal[];
  speciesCages: CageLocation[];
  animalCareLogs?: CareLog[];
  preferredUnit: WeightUnit;
  currencyCode?: string;
  optimizationPresetId?: ImageOptimizationPresetId;
  defaultBreederName: string;
  defaultOwnerName: string;
  forcedSex?: BiologicalSex;
  opfsSupported?: boolean;
  autoOffloadRetiredToOpfs?: boolean;
  onSave: (
    draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
    pendingPhotos?: Array<OptimizedImagePayload & { caption?: string }>
  ) => Promise<string | null | void> | string | void;
  onOffloadRetiredAnimal?: (animalId: string) => Promise<void> | void;
  onSetAutoOffloadRetired?: (enabled: boolean) => void;
  onDelete?: (animal: Animal) => Promise<void> | void;
  onClose: () => void;
}

export function AnimalEditorModal({
  initialAnimal,
  speciesProfile,
  speciesAnimals,
  speciesCages,
  animalCareLogs,
  preferredUnit,
  currencyCode,
  optimizationPresetId,
  defaultBreederName,
  defaultOwnerName,
  forcedSex,
  opfsSupported = false,
  autoOffloadRetiredToOpfs = false,
  onSave,
  onOffloadRetiredAnimal,
  onSetAutoOffloadRetired,
  onDelete,
  onClose,
}: AnimalEditorModalProps) {
  const isEditing = Boolean(initialAnimal?.id);
  const defaultPrefix = (speciesProfile.defaultAnimalPrefix || '').trim();
  const [pendingOffloadPrompt, setPendingOffloadPrompt] = useState<{
    animalId: string;
    animalName: string;
    status: AnimalStatus;
  } | null>(null);
  const [pendingWithdrawalWarning, setPendingWithdrawalWarning] =
    useState<WithdrawalDispositionWarning | null>(null);
  const [pendingCapacityWarning, setPendingCapacityWarning] =
    useState<CageAssignmentCapacityWarning | null>(null);
  const [rememberAutoOffload, setRememberAutoOffload] = useState(false);
  const [offloadingNow, setOffloadingNow] = useState(false);
  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });

  const activeWithdrawal = useMemo(
    () =>
      initialAnimal?.id && animalCareLogs && animalCareLogs.length > 0
        ? evaluateAnimalActiveWithdrawal(animalCareLogs, initialAnimal.id)
        : null,
    [initialAnimal?.id, animalCareLogs]
  );

  const [tattoo, setTattoo] = useState(initialAnimal?.tattoo || '');
  const [name, setName] = useState(() => {
    if (initialAnimal?.name) return initialAnimal.name;
    return defaultPrefix ? `${defaultPrefix} ` : '';
  });
  const [breed, setBreed] = useState(
    initialAnimal?.breed ||
      (isSameSpecies(speciesProfile.name, 'Rabbit')
        ? 'New Zealand'
        : speciesProfile.exampleBreeds[0] || '')
  );
  const [variety, setVariety] = useState(initialAnimal?.variety || '');
  const [sex, setSex] = useState<BiologicalSex>(forcedSex || initialAnimal?.sex || 'Female');
  const [status, setStatus] = useState<AnimalStatus>(initialAnimal?.status || 'Active');
  const [archived, setArchived] = useState<boolean>(
    initialAnimal ? isAnimalArchived(initialAnimal) : false
  );
  const [needsAttention, setNeedsAttention] = useState<boolean>(
    initialAnimal ? doesAnimalNeedAttention(initialAnimal) : false
  );
  const [includeArchivedParents, setIncludeArchivedParents] = useState<boolean>(() => {
    if (!initialAnimal) return false;
    const sireArch = initialAnimal.sireId
      ? isAnimalArchived(speciesAnimals.find((a) => a.id === initialAnimal.sireId))
      : false;
    const damArch = initialAnimal.damId
      ? isAnimalArchived(speciesAnimals.find((a) => a.id === initialAnimal.damId))
      : false;
    return sireArch || damArch;
  });
  const [birthDateIso, setBirthDateIso] = useState(initialAnimal?.birthDateIso || '');
  const [weightInput, setWeightInput] = useState(() =>
    formatWeightInputValue(initialAnimal?.weightGrams || 0, preferredUnit)
  );
  const weightMeta = getWeightInputMeta(preferredUnit);
  const idLabels = getSpeciesIdentifierLabels(speciesProfile.name);
  // Conservative default: NEVER silently auto-fill unverified modifiers like 'ww' on new animals
  const [genotypeRaw, setGenotypeRaw] = useState(initialAnimal?.genotypeRaw || '');
  const [showLocusBuilder, setShowLocusBuilder] = useState(false);
  const [rufusLevel, setRufusLevel] = useState<RufusLevel>(() =>
    normalizeRufusLevel(initialAnimal?.rufusLevel)
  );
  const [stagedPreset, setStagedPreset] = useState<VarietyPresetDefinition | null>(null);
  const [stagedPresetChecks, setStagedPresetChecks] = useState<Record<string, boolean>>({});
  const initialCarriers = getAnimalCarrierDisclosures(initialAnimal);
  const [suspectedCarrierOf, setSuspectedCarrierOf] = useState<string[]>(
    initialCarriers.suspected
  );
  const [confirmedCarrierOf, setConfirmedCarrierOf] = useState<string[]>(
    initialCarriers.confirmed
  );
  const [clearedCarrierOf, setClearedCarrierOf] = useState<ClearedCarrierRecord[]>(
    initialCarriers.cleared
  );
  const [registrationNumber, setRegistrationNumber] = useState(
    initialAnimal?.registrationNumber || ''
  );
  const [grandChampionNumber, setGrandChampionNumber] = useState(
    initialAnimal?.grandChampionNumber || ''
  );
  const [legsCount, setLegsCount] = useState(String(initialAnimal?.legsCount || 0));
  const [cageLocation, setCageLocation] = useState(initialAnimal?.cageLocation || '');
  const [breederName, setBreederName] = useState(
    initialAnimal?.breederName ?? defaultBreederName
  );
  const [ownerName, setOwnerName] = useState(initialAnimal?.ownerName ?? defaultOwnerName);
  const [ownershipType, setOwnershipType] = useState<OwnershipType>(() =>
    normalizeOwnershipType(initialAnimal?.ownershipType, 'Owned')
  );
  const [culled, setCulled] = useState<boolean>(Boolean(initialAnimal?.culled));
  const [cullDateIso, setCullDateIso] = useState(initialAnimal?.cullDateIso || '');
  const [cullReason, setCullReason] = useState(initialAnimal?.cullReason || '');
  const [deceasedDateIso, setDeceasedDateIso] = useState(initialAnimal?.deceasedDateIso || '');
  const [deathCause, setDeathCause] = useState(initialAnimal?.deathCause || '');
  const [soldDateIso, setSoldDateIso] = useState(initialAnimal?.soldDateIso || '');
  const [salePriceInput, setSalePriceInput] = useState(() =>
    initialAnimal?.salePriceCents && initialAnimal.salePriceCents > 0
      ? (initialAnimal.salePriceCents / 100).toFixed(2)
      : ''
  );
  const [purchaseCostInput, setPurchaseCostInput] = useState(() =>
    initialAnimal?.purchaseCostCents && initialAnimal.purchaseCostCents > 0
      ? (initialAnimal.purchaseCostCents / 100).toFixed(2)
      : ''
  );
  const [buyerName, setBuyerName] = useState(initialAnimal?.buyerName || '');
  const resolvedCurrency = normalizeCurrencyCode(currencyCode, 'USD');
  const [sireId, setSireId] = useState(initialAnimal?.sireId || '');
  const [damId, setDamId] = useState(initialAnimal?.damId || '');
  const [notes, setNotes] = useState(initialAnimal?.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicateOverrideInput, setDuplicateOverrideInput] = useState('');
  const [submitGuardError, setSubmitGuardError] = useState<string | null>(null);
  const overrideInputRef = useRef<HTMLInputElement | null>(null);

  const [stagedPhotos, setStagedPhotos] = useState<OptimizedImagePayload[]>([]);
  const [isOptimizingPhotos, setIsOptimizingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const activePreset = resolveImageOptimizationPreset(optimizationPresetId);
  const baseId = useId();
  const dialogRef = useAccessibleDialog({ isOpen: true, onClose });

  const handleSelectModalPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsOptimizingPhotos(true);
    setPhotoError(null);
    try {
      const next: OptimizedImagePayload[] = [];
      const failures: string[] = [];
      const countToProcess = Math.min(files.length, MAX_PHOTO_BATCH_COUNT);
      if (files.length > MAX_PHOTO_BATCH_COUNT) {
        failures.push(
          `Selected ${files.length} photos; processing the first ${MAX_PHOTO_BATCH_COUNT} per batch.`
        );
      }
      for (let i = 0; i < countToProcess; i++) {
        const file = files[i];
        const sizeCheck = validateUploadFileSize(
          file.name,
          file.size,
          MAX_PHOTO_UPLOAD_BYTES,
          'an animal photo'
        );
        if (!sizeCheck.ok) {
          failures.push(sizeCheck.error);
          continue;
        }
        try {
          const opt = await optimizeImageFile(file, activePreset.id);
          next.push(opt);
        } catch (err) {
          failures.push(
            err instanceof Error ? err.message : `Could not decode "${file.name}"`
          );
        }
      }
      if (next.length > 0) {
        setStagedPhotos((prev) => [...prev, ...next]);
      }
      if (failures.length > 0) {
        setPhotoError(failures[0]);
      }
    } finally {
      setIsOptimizingPhotos(false);
    }
  };

  const herdById = useMemo(
    () => buildSpeciesHerdMap(speciesAnimals, speciesProfile.name),
    [speciesAnimals, speciesProfile.name]
  );

  const cagesOccupancySummary = useMemo(
    () => evaluateSpeciesCagesOccupancy(speciesCages, speciesAnimals, speciesProfile.name),
    [speciesCages, speciesAnimals, speciesProfile.name]
  );

  const matchedCageEval = useMemo(() => {
    const key = normalizeCageLabelKey(cageLocation);
    return key ? cagesOccupancySummary.byLabelKey.get(key) ?? null : null;
  }, [cagesOccupancySummary, cageLocation]);

  const wasAlreadyOccupyingTargetCage = useMemo(() => {
    if (!initialAnimal) return false;
    if (!isCageOccupyingAnimal(initialAnimal)) return false;
    const initialKey = normalizeCageLabelKey(initialAnimal.cageLocation);
    const targetKey = normalizeCageLabelKey(cageLocation);
    return Boolean(initialKey && targetKey && initialKey === targetKey);
  }, [initialAnimal, cageLocation]);

  const willOccupyAfterSave = isCageOccupyingAnimal({
    status,
    archived,
    offloadedArchiveKey: initialAnimal?.offloadedArchiveKey,
  });

  const liveCageCapacityWarning = useMemo(
    () =>
      evaluateCageAssignmentCapacityWarning({
        targetCageLabel: cageLocation,
        cages: speciesCages,
        animals: speciesAnimals,
        speciesName: speciesProfile.name,
        animalId: initialAnimal?.id,
        animalName: name,
        wasAlreadyOccupyingTargetCage,
        willOccupyAfterSave,
      }),
    [
      cageLocation,
      speciesCages,
      speciesAnimals,
      speciesProfile.name,
      initialAnimal?.id,
      name,
      wasAlreadyOccupyingTargetCage,
      willOccupyAfterSave,
    ]
  );

  const archivedParentCount = useMemo(
    () =>
      speciesAnimals.filter(
        (c) =>
          isSameSpecies(c.species, speciesProfile.name) &&
          c.id !== initialAnimal?.id &&
          isAnimalArchived(c)
      ).length,
    [speciesAnimals, speciesProfile.name, initialAnimal?.id]
  );

  // Strictly species-isolated, sex-appropriate, cycle-safe parent options (Male only for Sire, Female only for Dam)
  const sireCandidates = useMemo(
    () =>
      speciesAnimals.filter(
        (c) =>
          isSameSpecies(c.species, speciesProfile.name) &&
          c.sex === 'Male' &&
          c.id !== initialAnimal?.id &&
          (!isAnimalArchived(c) || includeArchivedParents || c.id === sireId) &&
          (!initialAnimal?.id || !wouldCreateCycle(initialAnimal.id, c.id, herdById))
      ),
    [speciesAnimals, speciesProfile.name, initialAnimal?.id, includeArchivedParents, sireId, herdById]
  );

  const damCandidates = useMemo(
    () =>
      speciesAnimals.filter(
        (c) =>
          isSameSpecies(c.species, speciesProfile.name) &&
          c.sex === 'Female' &&
          c.id !== initialAnimal?.id &&
          (!isAnimalArchived(c) || includeArchivedParents || c.id === damId) &&
          (!initialAnimal?.id || !wouldCreateCycle(initialAnimal.id, c.id, herdById))
      ),
    [speciesAnimals, speciesProfile.name, initialAnimal?.id, includeArchivedParents, damId, herdById]
  );

  const currentSireObj = useMemo(
    () => (sireId ? speciesAnimals.find((a) => a.id === sireId) : undefined),
    [sireId, speciesAnimals]
  );
  const currentDamObj = useMemo(
    () => (damId ? speciesAnimals.find((a) => a.id === damId) : undefined),
    [damId, speciesAnimals]
  );
  const hasMismatchedCurrentSire = Boolean(currentSireObj && currentSireObj.sex !== 'Male');
  const hasMismatchedCurrentDam = Boolean(currentDamObj && currentDamObj.sex !== 'Female');

  const offspringParentConstraints = useMemo(
    () =>
      initialAnimal?.id
        ? findOffspringRequiringParentSex(initialAnimal.id, speciesProfile.name, speciesAnimals)
        : { asSireOf: [], asDamOf: [] },
    [initialAnimal?.id, speciesProfile.name, speciesAnimals]
  );

  const sexChangeMismatchError = useMemo(() => {
    if (offspringParentConstraints.asSireOf.length > 0 && sex !== 'Male') {
      const sample = offspringParentConstraints.asSireOf
        .slice(0, 3)
        .map((k) => k.name)
        .join(', ');
      return `Cannot change sex to ${sex}: ${offspringParentConstraints.asSireOf.length} offspring (${sample}${
        offspringParentConstraints.asSireOf.length > 3 ? ', ...' : ''
      }) link this animal as Sire (${speciesProfile.maleLabel}). Unlink them first or keep Male.`;
    }
    if (offspringParentConstraints.asDamOf.length > 0 && sex !== 'Female') {
      const sample = offspringParentConstraints.asDamOf
        .slice(0, 3)
        .map((k) => k.name)
        .join(', ');
      return `Cannot change sex to ${sex}: ${offspringParentConstraints.asDamOf.length} offspring (${sample}${
        offspringParentConstraints.asDamOf.length > 3 ? ', ...' : ''
      }) link this animal as Dam (${speciesProfile.femaleLabel}). Unlink them first or keep Female.`;
    }
    return null;
  }, [offspringParentConstraints, sex, speciesProfile.maleLabel, speciesProfile.femaleLabel]);

  const excludeSelfIds = useMemo(
    () => (initialAnimal?.id ? [initialAnimal.id] : []),
    [initialAnimal?.id]
  );

  const sameSexTattooCollisions = useMemo(
    () =>
      findSameSexDuplicateTattooCollisions({
        tattoo,
        sex,
        species: speciesProfile.name,
        animals: speciesAnimals,
        excludeAnimalIds: excludeSelfIds,
      }),
    [tattoo, sex, speciesProfile.name, speciesAnimals, excludeSelfIds]
  );

  const allSameSpeciesTattooPeers = useMemo(
    () =>
      findAllSpeciesDuplicateTattooPeers({
        tattoo,
        species: speciesProfile.name,
        animals: speciesAnimals,
        excludeAnimalIds: excludeSelfIds,
      }),
    [tattoo, speciesProfile.name, speciesAnimals, excludeSelfIds]
  );

  const requiresDuplicateOverrideOnCreate =
    !isEditing && sameSexTattooCollisions.length > 0;
  const overrideConfirmed = isOverrideConfirmationValid(duplicateOverrideInput);

  const projectedCoi = useMemo(() => {
    if (!sireId || !damId) return null;
    return calculatePairingCoi(sireId, damId, herdById);
  }, [sireId, damId, herdById]);

  const speciesGeneticsSpec = useMemo(
    () => getGeneticsSpecForSpecies(speciesProfile.name),
    [speciesProfile.name]
  );

  const speciesVarietyPresets = useMemo(
    () => getSpeciesVarietyPresets(speciesProfile.name),
    [speciesProfile.name]
  );

  const parsedLocusPairsByCode = useMemo(() => {
    const map = new Map<string, { allele1: string; allele2: string }>();
    if (!speciesGeneticsSpec) return map;
    for (const pair of parseGenotypeString(genotypeRaw, speciesProfile.name)) {
      map.set(pair.locus, { allele1: pair.allele1 || '_', allele2: pair.allele2 || '_' });
    }
    return map;
  }, [speciesGeneticsSpec, genotypeRaw, speciesProfile.name]);

  const liveHomozygousClearances = useMemo(
    () =>
      extractHomozygousCoatClearances({
        species: speciesProfile.name,
        genotypeRaw,
        confirmedCarrierOf,
        suspectedCarrierOf,
        clearedCarrierOf,
      }),
    [speciesProfile.name, genotypeRaw, confirmedCarrierOf, suspectedCarrierOf, clearedCarrierOf]
  );

  const carrierTraitSuggestions = useMemo(() => {
    const presetList = getCarrierTraitSuggestionsForSpecies(speciesProfile.name);
    const herdCustom: string[] = [];
    for (const a of speciesAnimals) {
      if (a.suspectedCarrierOf) herdCustom.push(...a.suspectedCarrierOf);
      if (a.confirmedCarrierOf) herdCustom.push(...a.confirmedCarrierOf);
      if (a.clearedCarrierOf) herdCustom.push(...a.clearedCarrierOf.map((c) => c.trait));
    }
    return normalizeCarrierTraitList([...presetList, ...herdCustom]);
  }, [speciesProfile.name, speciesAnimals]);

  const handleSelectVarietyPreset = (varietyName: string) => {
    if (!varietyName) return;
    const preset = speciesVarietyPresets.find((p) => p.variety === varietyName);
    if (!preset) return;
    if (preset.optionalConfirmations && preset.optionalConfirmations.length > 0) {
      setStagedPreset(preset);
      setStagedPresetChecks({});
    } else {
      setStagedPreset(null);
      setStagedPresetChecks({});
      setGenotypeRaw(preset.conservativeGenotype);
    }
  };

  const handleApplyStagedPreset = () => {
    if (!stagedPreset) return;
    const checkedLoci = Object.entries(stagedPresetChecks)
      .filter(([, checked]) => checked)
      .map(([locus]) => locus);
    const built = buildPresetGenotypeWithConfirmations(
      stagedPreset,
      checkedLoci,
      speciesProfile.name
    );
    setGenotypeRaw(built);
    setStagedPreset(null);
    setStagedPresetChecks({});
  };

  const handleClearedTraitsChange = (nextTraits: string[]) => {
    const existingByKey = new Map(
      clearedCarrierOf.map((c) => [c.trait.trim().toLowerCase(), c])
    );
    const nextRecords: ClearedCarrierRecord[] = nextTraits.map((trait) => {
      const prev = existingByKey.get(trait.trim().toLowerCase());
      return (
        prev || {
          trait,
          proofType: 'test_bred',
          testBreedingCount: 2,
        }
      );
    });
    const reconciled = reconcileCarrierTraitLists(
      suspectedCarrierOf,
      confirmedCarrierOf,
      nextRecords,
      'cleared'
    );
    setClearedCarrierOf(reconciled.clearedCarrierOf);
    setConfirmedCarrierOf(reconciled.confirmedCarrierOf);
    setSuspectedCarrierOf(reconciled.suspectedCarrierOf);
  };

  const updateClearedProof = (
    trait: string,
    patch: Partial<Pick<ClearedCarrierRecord, 'proofType' | 'testBreedingCount'>>
  ) => {
    const lower = trait.trim().toLowerCase();
    setClearedCarrierOf((prev) =>
      prev.map((rec) =>
        rec.trait.trim().toLowerCase() === lower ? { ...rec, ...patch } : rec
      )
    );
  };

  const parseMoneyToCents = (raw: string): number => {
    const parsed = Number.parseFloat(raw.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  };

  const executeSave = async () => {
    setSubmitGuardError(null);
    setPendingWithdrawalWarning(null);
    setPendingCapacityWarning(null);
    await submitLock.runLocked(async () => {
      const reconciled = reconcileCarrierTraitLists(
        suspectedCarrierOf,
        confirmedCarrierOf,
        clearedCarrierOf
      );
      const wasRetired = Boolean(
        initialAnimal && (initialAnimal.status === 'Sold' || initialAnimal.status === 'Deceased')
      );
      const becomingRetired =
        (status === 'Sold' || status === 'Deceased') &&
        !wasRetired &&
        !initialAnimal?.offloadedArchiveKey;

      const savedResult = await onSave(
        {
          id: initialAnimal?.id,
          createdAt: initialAnimal?.createdAt,
          tattoo: tattoo.trim(),
          name: name.trim(),
          species: speciesProfile.name, // Strictly locked to active species
          breed: breed.trim(),
          variety: variety.trim(),
          sex,
          status,
          archived,
          needsAttention,
          birthDateIso,
          weightGrams: parseWeightInputToGrams(weightInput, preferredUnit),
          genotype: parseGenotypeString(genotypeRaw, speciesProfile.name),
          genotypeRaw: genotypeRaw.trim(),
          rufusLevel,
          suspectedCarrierOf: reconciled.suspectedCarrierOf,
          confirmedCarrierOf: reconciled.confirmedCarrierOf,
          clearedCarrierOf: reconciled.clearedCarrierOf,
          registrationNumber: registrationNumber.trim(),
          grandChampionNumber: grandChampionNumber.trim(),
          legsCount: Math.max(0, Number(legsCount) || 0),
          cageLocation: cageLocation.trim(),
          breederName: breederName.trim(),
          ownerName: ownerName.trim(),
          ownershipType,
          culled,
          cullDateIso: culled ? cullDateIso : '',
          cullReason: culled ? cullReason.trim() : '',
          deceasedDateIso: status === 'Deceased' ? deceasedDateIso : initialAnimal?.deceasedDateIso || '',
          deathCause: status === 'Deceased' ? deathCause.trim() : initialAnimal?.deathCause || '',
          soldDateIso: status === 'Sold' ? soldDateIso : initialAnimal?.soldDateIso || '',
          salePriceCents: status === 'Sold' ? parseMoneyToCents(salePriceInput) : initialAnimal?.salePriceCents || 0,
          purchaseCostCents: parseMoneyToCents(purchaseCostInput),
          buyerName: status === 'Sold' ? buyerName.trim() : initialAnimal?.buyerName || '',
          sireId,
          damId,
          notes: notes.trim(),
          offloadedArchiveKey: initialAnimal?.offloadedArchiveKey,
          offloadedAtIso: initialAnimal?.offloadedAtIso,
        },
        stagedPhotos.length > 0 ? stagedPhotos : undefined
      );

      if (savedResult === null) {
        setSubmitGuardError(
          'Could not save record to browser storage — your typed entries have been kept intact. Check available storage and try again.'
        );
        return;
      }

      const savedId =
        typeof savedResult === 'string' && savedResult.trim()
          ? savedResult.trim()
          : initialAnimal?.id || '';

      if (becomingRetired && opfsSupported && onOffloadRetiredAnimal && savedId) {
        if (autoOffloadRetiredToOpfs) {
          setOffloadingNow(true);
          try {
            await onOffloadRetiredAnimal(savedId);
          } finally {
            setOffloadingNow(false);
          }
          onClose();
          return;
        }
        setPendingOffloadPrompt({
          animalId: savedId,
          animalName: name.trim(),
          status,
        });
        return;
      }

      onClose();
    });
  };

  const checkCapacityThenSave = async () => {
    setPendingWithdrawalWarning(null);
    if (liveCageCapacityWarning?.wouldExceed) {
      setSubmitGuardError(null);
      setPendingCapacityWarning(liveCageCapacityWarning);
      return;
    }
    await executeSave();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (sexChangeMismatchError) {
      setSubmitGuardError(sexChangeMismatchError);
      return;
    }
    if (requiresDuplicateOverrideOnCreate && !overrideConfirmed) {
      setSubmitGuardError(
        `This ${idLabels.shortLabel.toLowerCase()} already belongs to another ${formatSexForSpecies(
          sex,
          speciesProfile
        ).toLowerCase()} in your ${speciesProfile.name} herd. Use a unique ${idLabels.shortLabel.toLowerCase()} or type "override" below to save anyway.`
      );
      overrideInputRef.current?.focus();
      return;
    }

    const dispositionWarning = evaluateWithdrawalDispositionWarning(activeWithdrawal, {
      animalName: name.trim() || initialAnimal?.name || '',
      isNewlySold: status === 'Sold' && initialAnimal?.status !== 'Sold',
      isNewlyCulled: culled && !initialAnimal?.culled,
    });
    if (dispositionWarning) {
      setSubmitGuardError(null);
      setPendingCapacityWarning(null);
      setPendingWithdrawalWarning(dispositionWarning);
      return;
    }

    await checkCapacityThenSave();
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? `Edit ${initialAnimal?.name}` : `Register ${speciesProfile.name}`}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--barn-border)]">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {pendingOffloadPrompt
                ? `Archive ${pendingOffloadPrompt.animalName} to OPFS`
                : isEditing
                ? `Edit ${initialAnimal?.name}`
                : `Add ${speciesProfile.name} Record`}
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              Species: {speciesProfile.name} · Parent links restricted to {speciesProfile.name} herd
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {pendingOffloadPrompt ? (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
              <div className="font-semibold text-sm text-[var(--barn-ink)]">
                Offload full photos &amp; logs to OPFS <code className="font-mono">/archives</code>?
              </div>
              <p className="text-[var(--barn-muted)] leading-relaxed">
                <strong>{pendingOffloadPrompt.animalName}</strong> was saved as{' '}
                <strong>{pendingOffloadPrompt.status}</strong>. You can keep its record in the local
                Archived tab, or compress its full-resolution photos and care logs into an{' '}
                <code className="font-mono">.archive.zip</code> bundle in OPFS{' '}
                <code className="font-mono">/archives</code> (any sire/dam pedigree lineage links
                stay intact as a lightweight Pedigree Reference stub).
              </p>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={rememberAutoOffload}
                onChange={(e) => setRememberAutoOffload(e.target.checked)}
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)]">
                  Always auto-offload Sold/Deceased records
                </strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  Automatically archives future Sold or Deceased animals without prompting (can be
                  changed anytime in Import &amp; Settings).
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                disabled={offloadingNow}
                onClick={() => {
                  if (rememberAutoOffload) {
                    onSetAutoOffloadRetired?.(true);
                  }
                  onClose();
                }}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
              >
                Keep in Archived Tab
              </button>
              <button
                type="button"
                disabled={offloadingNow}
                onClick={async () => {
                  setOffloadingNow(true);
                  try {
                    if (rememberAutoOffload) {
                      onSetAutoOffloadRetired?.(true);
                    }
                    await onOffloadRetiredAnimal?.(pendingOffloadPrompt.animalId);
                  } finally {
                    setOffloadingNow(false);
                    onClose();
                  }
                }}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50"
              >
                {offloadingNow ? 'Offloading to /archives...' : 'Offload to OPFS /archives'}
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor={`${baseId}-name`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Animal Name *
              </label>
              <input
                id={`${baseId}-name`}
                type="text"
                required
                placeholder="e.g. Copper Creek Ruby Rose"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-tattoo`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                {idLabels.fieldLabel}
              </label>
              <input
                id={`${baseId}-tattoo`}
                type="text"
                placeholder={idLabels.placeholder}
                value={tattoo}
                onChange={(e) => {
                  setTattoo(e.target.value);
                  setSubmitGuardError(null);
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
          </div>

          {requiresDuplicateOverrideOnCreate && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2.5 text-xs"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Duplicate {idLabels.shortLabel} for Same-Sex {speciesProfile.name}
                  </div>
                  <p className="text-[var(--barn-ink)]/90">
                    <span className="font-mono font-semibold">{tattoo.trim()}</span> is already used by{' '}
                    {sameSexTattooCollisions
                      .slice(0, 3)
                      .map((c) => `${c.name}${isAnimalArchived(c) ? ' [Archived]' : ''}`)
                      .join(', ')}
                    {sameSexTattooCollisions.length > 3
                      ? ` (+${sameSexTattooCollisions.length - 3} more)`
                      : ''}{' '}
                    ({formatSexForSpecies(sex, speciesProfile)}). Please enter a unique{' '}
                    {idLabels.shortLabel.toLowerCase()} to avoid pedigree &amp; show mix-ups.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label
                  htmlFor={`${baseId}-dup-override`}
                  className="text-[11px] font-medium text-[var(--barn-ink)] shrink-0"
                >
                  To reuse anyway, type <code className="font-mono font-semibold">override</code>:
                </label>
                <input
                  id={`${baseId}-dup-override`}
                  ref={overrideInputRef}
                  type="text"
                  autoComplete="off"
                  placeholder="Type override"
                  value={duplicateOverrideInput}
                  onChange={(e) => {
                    setDuplicateOverrideInput(e.target.value);
                    setSubmitGuardError(null);
                  }}
                  className="w-full sm:w-44 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
                />
                {overrideConfirmed && (
                  <span className="text-[11px] font-semibold text-[var(--barn-sage)]">
                    Override confirmed
                  </span>
                )}
              </div>
            </div>
          )}

          {!requiresDuplicateOverrideOnCreate && allSameSpeciesTattooPeers.length > 0 && (
            <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)]/50 text-xs text-[var(--barn-muted)] flex items-start gap-2">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>
                Note: <span className="font-mono text-[var(--barn-ink)]">{tattoo.trim()}</span> also
                appears on {allSameSpeciesTattooPeers.length} other {speciesProfile.name.toLowerCase()}{' '}
                record(s):{' '}
                {allSameSpeciesTattooPeers
                  .slice(0, 3)
                  .map((p) => `${p.name} (${formatSexForSpecies(p.sex, speciesProfile)})`)
                  .join(', ')}
                .
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Sex{forcedSex ? ` (Locked to ${forcedSex} for pedigree slot)` : ''}
              </span>
              <div
                role="group"
                aria-label="Sex"
                className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              >
                {(
                  [
                    ['Male', speciesProfile.maleLabel],
                    ['Female', speciesProfile.femaleLabel],
                    ['Unknown', 'Unknown'],
                  ] as const
                ).map(([val, label]) => {
                  const lockedOut = Boolean(forcedSex && forcedSex !== val);
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={lockedOut}
                      aria-pressed={sex === val}
                      onClick={() => {
                        setSex(val);
                        setSubmitGuardError(null);
                      }}
                      className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        sex === val
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                          : lockedOut
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-[var(--barn-subtle)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {sexChangeMismatchError && (
                <p role="alert" className="text-[11px] text-[var(--barn-danger)] font-medium mt-1">
                  {sexChangeMismatchError}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor={`${baseId}-status`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Herd Status
              </label>
              <select
                id={`${baseId}-status`}
                value={status}
                onChange={(e) => {
                  const next = e.target.value as AnimalStatus;
                  setStatus(next);
                  setPendingWithdrawalWarning(null);
                  setPendingCapacityWarning(null);
                  if (next === 'Deceased' || next === 'Sold') {
                    setArchived(true);
                  }
                  if (next === 'Sold' && !soldDateIso) {
                    setSoldDateIso(todayDateIso());
                  }
                  if (next === 'Deceased' && !deceasedDateIso) {
                    setDeceasedDateIso(todayDateIso());
                  }
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              >
                {ANIMAL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="sm:col-span-2">
              <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Ownership Classification
              </span>
              <div
                role="group"
                aria-label="Ownership Classification"
                className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              >
                {OWNERSHIP_TYPES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={ownershipType === opt.value}
                    onClick={() => setOwnershipType(opt.value)}
                    className={`min-h-[36px] px-2 py-1 rounded-md text-xs font-medium transition-colors truncate ${
                      ownershipType === opt.value
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : 'hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {opt.value === 'Owned'
                      ? 'Owned'
                      : opt.value === 'Reference'
                      ? 'Reference'
                      : 'Outside'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor={`${baseId}-purchase-cost`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Acquisition Cost ({resolvedCurrency}, opt.)
              </label>
              <input
                id={`${baseId}-purchase-cost`}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={purchaseCostInput}
                onChange={(e) => setPurchaseCostInput(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          {status === 'Sold' && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              <div className="text-xs font-semibold text-[var(--barn-ink)]">Sold Stock Details</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-sold-date`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Sold Date
                  </label>
                  <input
                    id={`${baseId}-sold-date`}
                    type="date"
                    value={soldDateIso}
                    onChange={(e) => setSoldDateIso(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-sale-price`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Sale Price ({resolvedCurrency})
                  </label>
                  <input
                    id={`${baseId}-sale-price`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={salePriceInput}
                    onChange={(e) => setSalePriceInput(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-buyer-name`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Buyer Name
                  </label>
                  <input
                    id={`${baseId}-buyer-name`}
                    type="text"
                    placeholder="Buyer / Farm name"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {status === 'Deceased' && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              <div className="text-xs font-semibold text-[var(--barn-ink)]">
                Mortality / Loss Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-deceased-date`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Date Deceased
                  </label>
                  <input
                    id={`${baseId}-deceased-date`}
                    type="date"
                    value={deceasedDateIso}
                    onChange={(e) => setDeceasedDateIso(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-death-cause`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Cause / Category
                  </label>
                  <input
                    id={`${baseId}-death-cause`}
                    type="text"
                    list="death-cause-suggestions"
                    placeholder="e.g. Illness, Predator, Birth Complication"
                    value={deathCause}
                    onChange={(e) => setDeathCause(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                  />
                  <datalist id="death-cause-suggestions">
                    <option value="Illness" />
                    <option value="Birth Complication" />
                    <option value="Predator" />
                    <option value="Injury" />
                    <option value="Heat / Weather Stress" />
                    <option value="Old Age" />
                    <option value="Unknown" />
                  </datalist>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setPendingCapacityWarning(null);
                }}
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)]">
                  Archived / Non-Active (Retain for Pedigrees Only)
                </strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  Moves this animal out of the active herd and active barn chores while keeping its
                  lineage available when linking pedigrees.
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                needsAttention
                  ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                  : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
              }`}
            >
              <input
                type="checkbox"
                checked={needsAttention}
                onChange={(e) => setNeedsAttention(e.target.checked)}
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-terracotta)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)] inline-flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                  Needs Attention (Review / Complete Record)
                </strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  Shows a reminder on Home &amp; Species Hub until details ({idLabels.shortLabel.toLowerCase()}, pedigree, breed)
                  are finished. Uncheck once resolved.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3 space-y-3 text-xs">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={culled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setCulled(checked);
                  setPendingWithdrawalWarning(null);
                  if (checked && !cullDateIso) {
                    setCullDateIso(todayDateIso());
                  }
                }}
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-terracotta)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)]">
                  Flagged for Cull / Breeding Removal
                </strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  Marks this animal for the Cull Decision Report with optional date and reason.
                </span>
              </span>
            </label>

            {culled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor={`${baseId}-cull-date`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Cull / Decision Date
                  </label>
                  <input
                    id={`${baseId}-cull-date`}
                    type="date"
                    value={cullDateIso}
                    onChange={(e) => setCullDateIso(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-cull-reason`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Cull Reason
                  </label>
                  <input
                    id={`${baseId}-cull-reason`}
                    type="text"
                    list="cull-reason-suggestions"
                    placeholder="e.g. Conformation, Low Production, Disposition"
                    value={cullReason}
                    onChange={(e) => setCullReason(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                  />
                  <datalist id="cull-reason-suggestions">
                    <option value="Conformation" />
                    <option value="Low Production" />
                    <option value="Mothering / Fertility" />
                    <option value="Disposition" />
                    <option value="Chronic Health" />
                    <option value="Herd Size Reduction" />
                  </datalist>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor={`${baseId}-breed`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Breed
              </label>
              <input
                id={`${baseId}-breed`}
                type="text"
                list="breed-suggestions"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
              <datalist id="breed-suggestions">
                {speciesProfile.exampleBreeds.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label
                htmlFor={`${baseId}-variety`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Variety / Color
              </label>
              <input
                id={`${baseId}-variety`}
                type="text"
                placeholder="e.g. Red"
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-cage`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Cage / Pen Location
              </label>
              <input
                id={`${baseId}-cage`}
                type="text"
                list="cage-suggestions"
                placeholder="e.g. Hutch R-07"
                value={cageLocation}
                onChange={(e) => {
                  setCageLocation(e.target.value);
                  setPendingCapacityWarning(null);
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
              <datalist id="cage-suggestions">
                {speciesCages.map((c) => {
                  const evalItem = cagesOccupancySummary.byCageId.get(c.id);
                  return (
                    <option key={c.id} value={c.label}>
                      {evalItem ? `${c.label} (${evalItem.ratioLabel})` : c.label}
                    </option>
                  );
                })}
              </datalist>
              {matchedCageEval && (
                <div
                  className={`mt-1 text-[11px] font-mono tabular-nums flex items-center gap-1 ${
                    liveCageCapacityWarning?.wouldExceed || matchedCageEval.isOverCapacity
                      ? 'text-[var(--barn-danger)] font-semibold'
                      : matchedCageEval.isAtCapacity
                        ? 'text-[var(--barn-terracotta)] font-medium'
                        : 'text-[var(--barn-muted)]'
                  }`}
                >
                  {(liveCageCapacityWarning?.wouldExceed || matchedCageEval.isOverCapacity) && (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {liveCageCapacityWarning?.wouldExceed
                      ? `${matchedCageEval.cage.label}: ${matchedCageEval.ratioLabel} — saving puts at ${liveCageCapacityWarning.projectedOccupantCount}/${liveCageCapacityWarning.capacity} (over capacity)`
                      : `${matchedCageEval.cage.label}: ${matchedCageEval.ratioLabel}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor={`${baseId}-birth-date`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Birth Date
              </label>
              <input
                id={`${baseId}-birth-date`}
                type="date"
                value={birthDateIso}
                onChange={(e) => setBirthDateIso(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-weight`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Weight ({weightMeta.unitLabel})
              </label>
              <input
                id={`${baseId}-weight`}
                type="number"
                step="0.01"
                min="0"
                placeholder={weightMeta.placeholder}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-legs`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Show Legs Won
              </label>
              <input
                id={`${baseId}-legs`}
                type="number"
                min="0"
                max="99"
                value={legsCount}
                onChange={(e) => setLegsCount(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`${baseId}-genotype`}
                  className="text-xs font-medium text-[var(--barn-muted)]"
                >
                  {speciesGeneticsSpec
                    ? `${speciesProfile.name} Coat Color Genotype Loci (${speciesGeneticsSpec.loci.map((l) => l.locus).join(', ')})`
                    : `${speciesProfile.name} Color / DNA Genotype Notes`}
                </label>
                <ColorGeneticsNotice compact />
              </div>
              {speciesVarietyPresets.length > 0 && (
                <select
                  aria-label={`Apply ${speciesProfile.name} variety genotype preset`}
                  value=""
                  onChange={(e) => handleSelectVarietyPreset(e.target.value)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="">
                    Conservative baseline from {speciesProfile.name} variety...
                  </option>
                  {speciesVarietyPresets.map((preset) => (
                    <option key={preset.variety} value={preset.variety}>
                      {preset.variety} ({preset.conservativeGenotype})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {stagedPreset && (
              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)] space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[var(--barn-ink)]">
                      Verify Optional Modifiers for &ldquo;{stagedPreset.variety}&rdquo;
                    </div>
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Conservative baseline:{' '}
                      <code className="font-mono text-[var(--barn-ink)]">
                        {buildPresetGenotypeWithConfirmations(
                          stagedPreset,
                          Object.entries(stagedPresetChecks)
                            .filter(([, v]) => v)
                            .map(([k]) => k),
                          speciesProfile.name
                        )}
                      </code>
                    </div>
                  </div>
                </div>
                {(stagedPreset.optionalConfirmations || []).map((opt) => (
                  <label
                    key={opt.locus}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(stagedPresetChecks[opt.locus])}
                      onChange={(e) =>
                        setStagedPresetChecks((prev) => ({
                          ...prev,
                          [opt.locus]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                    />
                    <span>
                      <strong className="text-[var(--barn-ink)]">{opt.label}</strong>
                      <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                        {opt.explanation}
                      </span>
                    </span>
                  </label>
                ))}
                {stagedPreset.note && (
                  <p className="text-[11px] text-[var(--barn-muted)]">{stagedPreset.note}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStagedPreset(null);
                      setStagedPresetChecks({});
                    }}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyStagedPreset}
                    className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
                  >
                    Apply Preset
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id={`${baseId}-genotype`}
                type="text"
                placeholder={
                  speciesGeneticsSpec
                    ? `e.g. ${speciesVarietyPresets[0]?.conservativeGenotype || speciesGeneticsSpec.loci.map(() => '__').join(' ')}`
                    : 'Custom species plain-text genotype or DNA notes (stored verbatim)'
                }
                value={genotypeRaw}
                onChange={(e) => setGenotypeRaw(e.target.value)}
                className="flex-1 min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
              {speciesGeneticsSpec && (
                <button
                  type="button"
                  onClick={() => setShowLocusBuilder((v) => !v)}
                  aria-expanded={showLocusBuilder}
                  className="min-h-[42px] px-3.5 py-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium whitespace-nowrap shrink-0"
                >
                  {showLocusBuilder
                    ? 'Hide Locus Builder'
                    : `Locus Builder (${speciesGeneticsSpec.loci.length} Loci)`}
                </button>
              )}
            </div>

            {speciesGeneticsSpec && showLocusBuilder && (
              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[var(--barn-ink)]">
                    {speciesProfile.name} Locus Allele Builder
                  </span>
                  {genotypeRaw.trim() && (
                    <button
                      type="button"
                      onClick={() => setGenotypeRaw('')}
                      className="text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline"
                    >
                      Clear all loci
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {speciesGeneticsSpec.loci.map((locusDef) => {
                    const pair = parsedLocusPairsByCode.get(locusDef.locus);
                    const isXLinkedMale =
                      locusDef.inheritanceMode === 'x_linked' && sex === 'Male';
                    const a1 = pair?.allele1 || '_';
                    const a2 = isXLinkedMale ? 'Y' : pair?.allele2 || '_';
                    const modeNote =
                      locusDef.inheritanceMode === 'x_linked'
                        ? 'X-linked'
                        : locusDef.inheritanceMode === 'codominant'
                        ? 'Codominant'
                        : locusDef.inheritanceMode === 'incomplete_dominant'
                        ? 'Incomplete dom.'
                        : '';

                    return (
                      <div
                        key={locusDef.locus}
                        className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-semibold text-[var(--barn-ink)] truncate">
                            <span className="font-mono">{locusDef.locus}</span> · {locusDef.name}
                          </span>
                          {modeNote && (
                            <span className="text-[10px] text-[var(--barn-muted)] shrink-0">
                              {modeNote}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label={`${locusDef.name} allele 1`}
                            value={a1}
                            onChange={(e) =>
                              setGenotypeRaw((prev) =>
                                setLocusInGenotypeString(
                                  prev,
                                  locusDef.locus,
                                  e.target.value,
                                  a2,
                                  speciesProfile.name,
                                  sex
                                )
                              )
                            }
                            className="flex-1 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                          >
                            <option value="_">_ (Unverified)</option>
                            {locusDef.alleles.map((al) => (
                              <option key={al} value={al}>
                                {al}
                              </option>
                            ))}
                          </select>
                          {isXLinkedMale ? (
                            <span className="min-h-[34px] px-2.5 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono text-[var(--barn-muted)] inline-flex items-center">
                              Y
                            </span>
                          ) : (
                            <select
                              aria-label={`${locusDef.name} allele 2`}
                              value={a2}
                              onChange={(e) =>
                                setGenotypeRaw((prev) =>
                                  setLocusInGenotypeString(
                                    prev,
                                    locusDef.locus,
                                    a1,
                                    e.target.value,
                                    speciesProfile.name,
                                    sex
                                  )
                                )
                              }
                              className="flex-1 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                            >
                              <option value="_">_ (Unverified)</option>
                              {locusDef.alleles.map((al) => (
                                <option key={al} value={al}>
                                  {al}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--barn-muted)] leading-snug">
                          {locusDef.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!speciesGeneticsSpec && (
              <p className="text-[11px] text-[var(--barn-muted)]">
                Custom species stores genotypes as plain-text breeder notes without Rabbit locus assumptions.
              </p>
            )}

            {(speciesGeneticsSpec?.supportsRufusIntensity || rufusLevel) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="editor-rufus-select"
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Rufus Intensity (Polygenic Pigment Richness)
                  </label>
                  <select
                    id="editor-rufus-select"
                    value={rufusLevel}
                    onChange={(e) => setRufusLevel(normalizeRufusLevel(e.target.value))}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    {RUFUS_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value || 'none'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <p className="text-[11px] text-[var(--barn-muted)] pb-1">
                    Tracked separately from Mendelian Wide-Band (<code className="font-mono">W / w</code>): rich Reds can have High Rufus without being proven{' '}
                    <code className="font-mono">ww</code>.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Hidden Genetic Traits, Carrier Disclosures &amp; Branch Clearances
                </span>
                <span className="text-[11px] text-[var(--barn-muted)]">
                  Displayed compactly on this animal&apos;s and descendants&apos; pedigrees
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CarrierTraitCombobox
                  label="Suspected Carrier Of"
                  tone="suspected"
                  selected={suspectedCarrierOf}
                  suggestions={carrierTraitSuggestions}
                  disabledTraits={[
                    ...confirmedCarrierOf,
                    ...clearedCarrierOf.map((c) => c.trait),
                  ]}
                  disabledReason="Confirmed or Cleared"
                  placeholder="Select or type suspected recessive/trait..."
                  helperText="Possible carrier from lineage, phenotype clues, or partial test breedings."
                  onChange={(next) => {
                    const reconciled = reconcileCarrierTraitLists(
                      next,
                      confirmedCarrierOf,
                      clearedCarrierOf
                    );
                    setSuspectedCarrierOf(reconciled.suspectedCarrierOf);
                  }}
                />
                <CarrierTraitCombobox
                  label="Confirmed Carrier Of"
                  tone="confirmed"
                  selected={confirmedCarrierOf}
                  suggestions={carrierTraitSuggestions}
                  placeholder="Select or type confirmed recessive/trait..."
                  helperText="Verified via DNA test, pedigree certainty, or offspring produced."
                  onChange={(next) => {
                    const reconciled = reconcileCarrierTraitLists(
                      suspectedCarrierOf,
                      next,
                      clearedCarrierOf,
                      'confirmed'
                    );
                    setConfirmedCarrierOf(reconciled.confirmedCarrierOf);
                    setSuspectedCarrierOf(reconciled.suspectedCarrierOf);
                    setClearedCarrierOf(reconciled.clearedCarrierOf);
                  }}
                />
              </div>

              <div className="pt-1 space-y-2">
                <CarrierTraitCombobox
                  label="Cleared / Verified Non-Carrier Of (Stops Ancestral Propagation)"
                  tone="cleared"
                  selected={clearedCarrierOf.map((c) => c.trait)}
                  suggestions={carrierTraitSuggestions}
                  placeholder="Select or type trait cleared by test breeding or DNA..."
                  helperText="Marks this animal proven non-carrier on its branch so earlier ancestral suspicions do not pass forward to offspring."
                  onChange={handleClearedTraitsChange}
                />

                {clearedCarrierOf.length > 0 && (
                  <div className="space-y-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3">
                    <div className="text-[11px] font-medium text-[var(--barn-muted)]">
                      Clearance Verification Details
                    </div>
                    {clearedCarrierOf.map((rec) => (
                      <div
                        key={rec.trait}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs py-1 border-b last:border-b-0 border-[var(--barn-border)]/60"
                      >
                        <span className="font-medium text-[var(--barn-ink)]">{rec.trait}</span>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Proof type for ${rec.trait}`}
                            value={rec.proofType}
                            onChange={(e) =>
                              updateClearedProof(rec.trait, {
                                proofType: e.target.value as ClearedCarrierProofType,
                              })
                            }
                            className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                          >
                            {Object.entries(CLEARED_CARRIER_PROOF_LABELS).map(([k, lbl]) => (
                              <option key={k} value={k}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                          {rec.proofType === 'test_bred' && (
                            <label className="inline-flex items-center gap-1 text-[11px] text-[var(--barn-muted)]">
                              <span>Matings:</span>
                              <input
                                type="number"
                                aria-label={`Test breedings count for ${rec.trait}`}
                                min="1"
                                max="99"
                                value={rec.testBreedingCount ?? 2}
                                onChange={(e) =>
                                  updateClearedProof(rec.trait, {
                                    testBreedingCount: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className="w-14 min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums text-xs"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {liveHomozygousClearances.length > 0 && (
                  <p className="text-[11px] text-[var(--barn-sage)]">
                    Explicit homozygous genotype loci also clear ancestral alerts automatically:{' '}
                    <span className="font-mono">
                      {liveHomozygousClearances.map((g) => `${g.trait} (${g.pair})`).join(', ')}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Lineage Parents ({speciesProfile.name} Only)
                </span>
                {archivedParentCount > 0 && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-[var(--barn-ink)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeArchivedParents}
                      onChange={(e) => setIncludeArchivedParents(e.target.checked)}
                      className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                    />
                    Include Archived ({archivedParentCount})
                  </label>
                )}
              </div>
              {projectedCoi && (() => {
                const comp = getPedigreeCompletenessSummary(projectedCoi);
                return (
                  <span className="text-xs font-mono tabular-nums text-[var(--barn-sage)]">
                    Projected COI: {projectedCoi.coiPercent.toFixed(2)}% ({projectedCoi.risk.label}) ·{' '}
                    {comp.known3Gen}/{comp.max3Gen} 3-gen
                    {comp.isIncompleteZeroOutcross ? ' (incomplete pedigree)' : ''}
                  </span>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={`${baseId}-sire`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Sire ({speciesProfile.maleLabel})
                </label>
                {includeArchivedParents ? (
                  <SearchableParentPicker
                    id={`${baseId}-sire`}
                    label={`Sire (${speciesProfile.maleLabel})`}
                    value={sireId}
                    candidates={sireCandidates}
                    unknownLabel={`Unknown / Foundation ${speciesProfile.maleLabel}`}
                    placeholder={`Search ${speciesProfile.maleLabel}s (incl. archived)...`}
                    onChange={(id) => setSireId(id)}
                  />
                ) : (
                  <select
                    id={`${baseId}-sire`}
                    value={sireId}
                    onChange={(e) => setSireId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    <option value="">Unknown / Foundation {speciesProfile.maleLabel}</option>
                    {sireId && !sireCandidates.some((c) => c.id === sireId) && (
                      <option value={sireId}>
                        {currentSireObj
                          ? `[Sex Mismatch: ${currentSireObj.name} (${currentSireObj.sex}) — unlink or change parent sex]`
                          : `[Unlisted / Missing Sire ID: ${sireId.slice(0, 8)} — select Unknown to unlink]`}
                      </option>
                    )}
                    {sireCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.tattoo ? `(${c.tattoo})` : ''}
                        {isAnimalArchived(c) ? ' [Archived]' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {hasMismatchedCurrentSire && currentSireObj && (
                  <p className="text-[11px] text-[var(--barn-terracotta)] font-medium mt-1">
                    Warning: Linked sire &ldquo;{currentSireObj.name}&rdquo; is recorded as{' '}
                    {currentSireObj.sex}. Select a {speciesProfile.maleLabel} or Unknown to resolve.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-dam`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Dam ({speciesProfile.femaleLabel})
                </label>
                {includeArchivedParents ? (
                  <SearchableParentPicker
                    id={`${baseId}-dam`}
                    label={`Dam (${speciesProfile.femaleLabel})`}
                    value={damId}
                    candidates={damCandidates}
                    unknownLabel={`Unknown / Foundation ${speciesProfile.femaleLabel}`}
                    placeholder={`Search ${speciesProfile.femaleLabel}s (incl. archived)...`}
                    onChange={(id) => setDamId(id)}
                  />
                ) : (
                  <select
                    id={`${baseId}-dam`}
                    value={damId}
                    onChange={(e) => setDamId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    <option value="">Unknown / Foundation {speciesProfile.femaleLabel}</option>
                    {damId && !damCandidates.some((c) => c.id === damId) && (
                      <option value={damId}>
                        {currentDamObj
                          ? `[Sex Mismatch: ${currentDamObj.name} (${currentDamObj.sex}) — unlink or change parent sex]`
                          : `[Unlisted / Missing Dam ID: ${damId.slice(0, 8)} — select Unknown to unlink]`}
                      </option>
                    )}
                    {damCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.tattoo ? `(${c.tattoo})` : ''}
                        {isAnimalArchived(c) ? ' [Archived]' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {hasMismatchedCurrentDam && currentDamObj && (
                  <p className="text-[11px] text-[var(--barn-terracotta)] font-medium mt-1">
                    Warning: Linked dam &ldquo;{currentDamObj.name}&rdquo; is recorded as{' '}
                    {currentDamObj.sex}. Select a {speciesProfile.femaleLabel} or Unknown to resolve.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor={`${baseId}-reg`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Registration #
              </label>
              <input
                id={`${baseId}-reg`}
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-gc`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Grand Champion #
              </label>
              <input
                id={`${baseId}-gc`}
                type="text"
                value={grandChampionNumber}
                onChange={(e) => setGrandChampionNumber(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-breeder`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Breeder
              </label>
              <input
                id={`${baseId}-breeder`}
                type="text"
                value={breederName}
                onChange={(e) => setBreederName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-owner`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Owner
              </label>
              <input
                id={`${baseId}-owner`}
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${baseId}-notes`}
              className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
            >
              Barn Notes
            </label>
            <textarea
              id={`${baseId}-notes`}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
            />
          </div>

          {/* Direct Photo Upload & Compression Strip */}
          <div className="border-t border-[var(--barn-border)] pt-4 space-y-2.5">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleSelectModalPhotos(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Attach Animal Photos (Auto-Optimized to {activePreset.maxDimension}px WebP)
                </span>
                {stagedPhotos.length > 0 && (
                  <div className="text-[11px] font-mono text-[var(--barn-sage)]">
                    Staged {stagedPhotos.length} photo{stagedPhotos.length === 1 ? '' : 's'} ·{' '}
                    {formatByteSizePure(
                      stagedPhotos.reduce((a, b) => a + b.storedBytes, 0)
                    )}{' '}
                    total (saved{' '}
                    {calculateSavingsPercent(
                      stagedPhotos.reduce((a, b) => a + b.originalBytes, 0),
                      stagedPhotos.reduce((a, b) => a + b.storedBytes, 0)
                    )}
                    %)
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={isOptimizingPhotos}
                onClick={() => photoInputRef.current?.click()}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                {isOptimizingPhotos ? 'Optimizing...' : '+ Select Photo(s)'}
              </button>
            </div>

            {photoError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs"
              >
                {photoError}
              </div>
            )}

            {stagedPhotos.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {stagedPhotos.map((p, idx) => (
                  <div
                    key={`${p.originalFileName}-${idx}`}
                    className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--barn-border)] shrink-0"
                  >
                    <img
                      src={p.thumbnailDataUrl}
                      alt={p.originalFileName}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setStagedPhotos((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remove staged photo"
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-md bg-black/75 text-white flex items-center justify-center"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activeWithdrawal?.isActive &&
            !pendingWithdrawalWarning &&
            ((status === 'Sold' && initialAnimal?.status !== 'Sold') ||
              (culled && !initialAnimal?.culled)) && (
              <div
                role="status"
                className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)]/75 border border-[var(--barn-terracotta)]/70 flex items-start gap-2.5 text-xs"
              >
                <ShieldAlert
                  className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
                    Active Medication Withdrawal ({activeWithdrawal.countdownLabel} · clears{' '}
                    {formatReadableDate(activeWithdrawal.clearDateIso)})
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    Medications: <strong className="text-[var(--barn-ink)]">{activeWithdrawal.medicationSummary}</strong>.
                    You will be asked to confirm before saving this change.
                  </p>
                </div>
              </div>
            )}

          {pendingWithdrawalWarning && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-3 text-xs"
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert
                  className="w-5 h-5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    {pendingWithdrawalWarning.headline}
                  </div>
                  <p className="text-[var(--barn-ink)] leading-relaxed">
                    {pendingWithdrawalWarning.detail}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => setPendingWithdrawalWarning(null)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => void checkCapacityThenSave()}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-xs font-semibold hover:opacity-95 disabled:opacity-55"
                >
                  {submitLock.isSubmitting ? 'Saving...' : 'Confirm Withdrawal Hold & Save'}
                </button>
              </div>
            </div>
          )}

          {pendingCapacityWarning && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] space-y-3 text-xs"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="w-5 h-5 text-[var(--barn-danger)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    {pendingCapacityWarning.headline}
                  </div>
                  <p className="text-[var(--barn-ink)] leading-relaxed">
                    {pendingCapacityWarning.detail}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => setPendingCapacityWarning(null)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => void executeSave()}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-xs font-semibold hover:opacity-95 disabled:opacity-55"
                >
                  {submitLock.isSubmitting ? 'Saving...' : 'Confirm Over-Capacity & Save'}
                </button>
              </div>
            </div>
          )}

          {submitGuardError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium text-[var(--barn-ink)]"
            >
              {submitGuardError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--barn-border)]">
            {isEditing && onDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--barn-danger)] font-medium">
                    Confirm delete?
                  </span>
                  <button
                    type="button"
                    disabled={submitLock.isSubmitting}
                    onClick={() => {
                      void submitLock.runLocked(async () => {
                        await onDelete(initialAnimal!);
                        onClose();
                      });
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold disabled:opacity-55"
                  >
                    {submitLock.isSubmitting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    disabled={submitLock.isSubmitting}
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs disabled:opacity-55"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-55"
                >
                  Delete Animal
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitLock.isSubmitting}
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                aria-busy={submitLock.isSubmitting}
                className="min-h-[42px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
              >
                {submitLock.isSubmitting && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                )}
                {submitLock.isSubmitting
                  ? `Saving ${speciesProfile.name}...`
                  : `Save ${speciesProfile.name}`}
              </button>
            </div>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
```

## `src/components/AnimalPhotoGallery.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Per-Animal Multi-Photo Gallery, Live Optimizer & Lightbox (`src/components/AnimalPhotoGallery.tsx`).
 *
 * Directly optimizes end-user camera/file uploads through `optimizeImageFile` using the barn's
 * active compression preset, displays real-time byte savings, supports multiple photos per animal,
 * cover/primary photo selection, captions, and full-screen inspection.
 */

import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  ImageOptimizationPresetId,
  OptimizedImagePayload,
  resolveImageOptimizationPreset,
} from '../core/imageOptimizationSpec';
import {
  MAX_PHOTO_BATCH_COUNT,
  MAX_PHOTO_UPLOAD_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { Animal, AnimalPhoto } from '../core/models';
import { logDiagnosticEvent } from '../storage/crashLogger';
import { revokeBlobUrlIfNeeded } from '../storage/photoHydration';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

interface AnimalPhotoGalleryProps {
  animal: Animal;
  photos: AnimalPhoto[];
  optimizationPresetId?: ImageOptimizationPresetId;
  onLoadFullPhoto?: (photoId: string) => Promise<string | null>;
  onAddPhotos: (
    payloads: Array<OptimizedImagePayload & { caption?: string }>
  ) => Promise<void> | void;
  onSetPrimary: (photoId: string) => Promise<void> | void;
  onUpdateCaption: (photoId: string, caption: string) => Promise<void> | void;
  onDeletePhoto: (photoId: string) => Promise<void> | void;
}

export function AnimalPhotoGallery({
  animal,
  photos,
  optimizationPresetId,
  onLoadFullPhoto,
  onAddPhotos,
  onSetPrimary,
  onUpdateCaption,
  onDeletePhoto,
}: AnimalPhotoGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizeStatus, setOptimizeStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [captionDraft, setCaptionDraft] = useState<string>('');
  const [captionSavedPulse, setCaptionSavedPulse] = useState<boolean>(false);
  const [showPrimaryPrompt, setShowPrimaryPrompt] = useState<boolean>(false);
  const [hydratedUrls, setHydratedUrls] = useState<Record<string, string>>({});
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);

  const preset = resolveImageOptimizationPreset(optimizationPresetId);

  const activePhoto: AnimalPhoto | null =
    photos.find((p) => p.id === selectedPhotoId) || photos[0] || null;
  const activeIndex = activePhoto ? photos.findIndex((p) => p.id === activePhoto.id) : -1;
  const activePhotoSrc = activePhoto
    ? activePhoto.dataUrl || hydratedUrls[activePhoto.id] || activePhoto.thumbnailDataUrl
    : '';

  const lightboxDialogRef = useAccessibleDialog({
    isOpen: Boolean(lightboxOpen && activePhoto),
    onClose: () => setLightboxOpen(false),
  });

  const captionPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedUrlsRef = useRef<Record<string, string>>({});
  const hydrationQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    hydratedUrlsRef.current = hydratedUrls;
  }, [hydratedUrls]);

  useEffect(() => {
    return () => {
      if (captionPulseTimerRef.current !== null) {
        clearTimeout(captionPulseTimerRef.current);
      }
      for (const url of Object.values(hydratedUrlsRef.current)) {
        revokeBlobUrlIfNeeded(url);
      }
      hydratedUrlsRef.current = {};
    };
  }, []);

  // Clear per-animal resolved full-res image URLs when switching animals
  useEffect(() => {
    setHydratedUrls((prev) => {
      for (const url of Object.values(prev)) {
        revokeBlobUrlIfNeeded(url);
      }
      return {};
    });
    setLoadingPhotoId(null);
  }, [animal.id]);

  // Lazily and sequentially fetch full-resolution URL from SQLite when viewing a dehydrated photo
  useEffect(() => {
    if (!activePhoto || activePhoto.dataUrl || hydratedUrls[activePhoto.id] || !onLoadFullPhoto) {
      return;
    }
    let cancelled = false;
    const targetId = activePhoto.id;
    setLoadingPhotoId(targetId);

    const runLoad = async () => {
      if (cancelled) return;
      try {
        const resolved = await onLoadFullPhoto(targetId);
        if (cancelled) {
          revokeBlobUrlIfNeeded(resolved);
          return;
        }
        if (!resolved) return;
        setHydratedUrls((prev) => {
          if (prev[targetId] === resolved) return prev;
          if (prev[targetId]) {
            revokeBlobUrlIfNeeded(prev[targetId]);
          }
          const entries = Object.entries(prev).filter(([k]) => k !== targetId);
          // Keep local component state bounded even on large multi-photo galleries
          const evicted = entries.slice(0, Math.max(0, entries.length - 7));
          for (const [, evictedUrl] of evicted) {
            revokeBlobUrlIfNeeded(evictedUrl);
          }
          const trimmed = entries.slice(-7);
          return Object.fromEntries([...trimmed, [targetId, resolved]]);
        });
      } catch (err) {
        logDiagnosticEvent({
          level: 'warn',
          category: 'media',
          message: `Failed to load full-resolution photo "${targetId}"`,
          error: err,
        });
        if (!cancelled) {
          setUploadError(
            err instanceof Error && err.message
              ? `Could not load full photo: ${err.message}`
              : 'Could not load full-resolution photo from local storage.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPhotoId((curr) => (curr === targetId ? null : curr));
        }
      }
    };

    hydrationQueueRef.current = hydrationQueueRef.current.then(runLoad, runLoad);
    return () => {
      cancelled = true;
    };
  }, [activePhoto, hydratedUrls, onLoadFullPhoto]);

  // Reset active selection and caption draft when switching animals or active photo
  useEffect(() => {
    setConfirmDeleteId(null);
    setUploadError(null);
    if (photos.length > 0 && (!selectedPhotoId || !photos.some((p) => p.id === selectedPhotoId))) {
      setSelectedPhotoId(photos[0].id);
    } else if (photos.length === 0) {
      setSelectedPhotoId(null);
    }
  }, [animal.id, photos, selectedPhotoId]);

  useEffect(() => {
    setCaptionDraft(activePhoto?.caption || '');
  }, [activePhoto?.id, activePhoto?.caption]);

  // Arrow-key navigation when Lightbox is open (Escape + focus trap handled by useAccessibleDialog)
  useEffect(() => {
    if (!lightboxOpen || photos.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = photos[(activeIndex + 1) % photos.length];
        if (next) setSelectedPhotoId(next.id);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = photos[(activeIndex - 1 + photos.length) % photos.length];
        if (prev) setSelectedPhotoId(prev.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, photos, activeIndex]);

  const totalOrigBytes = photos.reduce((acc, p) => acc + (p.originalBytes || 0), 0);
  const totalStoredBytes = photos.reduce((acc, p) => acc + (p.storedBytes || 0), 0);
  const totalSavingsPct = calculateSavingsPercent(totalOrigBytes, totalStoredBytes);

  const processFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif)$/i.test(f.name)
    );
    if (files.length === 0) {
      setUploadError('Please choose one or more image files (JPG, PNG, WebP, AVIF, GIF).');
      return;
    }
    if (files.length > MAX_PHOTO_BATCH_COUNT) {
      setUploadError(
        `Selected ${files.length} images. To protect mobile browser memory, please add up to ${MAX_PHOTO_BATCH_COUNT} photos per batch.`
      );
      return;
    }

    for (const file of files) {
      const sizeCheck = validateUploadFileSize(
        file.name,
        file.size,
        MAX_PHOTO_UPLOAD_BYTES,
        'a photo upload'
      );
      if (!sizeCheck.ok) {
        setUploadError(sizeCheck.error);
        return;
      }
    }

    setUploadError(null);
    setIsOptimizing(true);
    const optimizedBatch: OptimizedImagePayload[] = [];
    const failedNames: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        setOptimizeStatus(`Optimizing ${i + 1} of ${files.length} (${preset.maxDimension}px)...`);
        try {
          const result = await optimizeImageFile(files[i], preset.id);
          optimizedBatch.push(result);
        } catch {
          failedNames.push(files[i].name);
        }
      }

      if (optimizedBatch.length > 0) {
        await onAddPhotos(optimizedBatch);
        if (photos.length + optimizedBatch.length >= 2) {
          setShowPrimaryPrompt(true);
        }
      }
      if (failedNames.length > 0) {
        setUploadError(
          `Could not decode ${failedNames.length} file(s): ${failedNames.slice(0, 3).join(', ')}. Try exporting HEIC/RAW images as JPG or PNG.`
        );
      }
    } finally {
      setIsOptimizing(false);
      setOptimizeStatus('');
    }
  };

  const commitCaptionIfChanged = async () => {
    if (!activePhoto) return;
    const trimmed = captionDraft.trim();
    if (trimmed === activePhoto.caption) return;
    try {
      await onUpdateCaption(activePhoto.id, trimmed);
      setCaptionSavedPulse(true);
      if (captionPulseTimerRef.current !== null) {
        clearTimeout(captionPulseTimerRef.current);
      }
      captionPulseTimerRef.current = setTimeout(() => {
        captionPulseTimerRef.current = null;
        setCaptionSavedPulse(false);
      }, 1800);
    } catch (err) {
      setUploadError(
        err instanceof Error && err.message ? err.message : 'Could not save photo caption.'
      );
    }
  };

  const handleSetPrimaryPhoto = async (photoId: string) => {
    try {
      setUploadError(null);
      await onSetPrimary(photoId);
    } catch (err) {
      setUploadError(
        err instanceof Error && err.message ? err.message : 'Could not update primary photo.'
      );
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    try {
      setUploadError(null);
      await onDeletePhoto(photoId);
      setHydratedUrls((prev) => {
        const existing = prev[photoId];
        if (!existing) return prev;
        revokeBlobUrlIfNeeded(existing);
        const next = { ...prev };
        delete next[photoId];
        return next;
      });
    } catch (err) {
      setUploadError(
        err instanceof Error && err.message ? err.message : 'Could not delete photo.'
      );
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files?.length) {
          void processFiles(e.dataTransfer.files);
        }
      }}
      className={`space-y-3 border-b border-[var(--barn-border)] pb-5 transition-colors ${
        isDragOver ? 'bg-[var(--barn-sage-tint)]/30 rounded-xl p-3 -mx-3' : ''
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            void processFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Section Header & Upload Action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              Animal Photos ({photos.length})
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[10px] text-[var(--barn-muted)]">
              Auto-Optimize: {preset.maxDimension}px WebP
            </span>
          </div>
          {photos.length > 0 && (
            <p className="text-[11px] text-[var(--barn-muted)] font-mono mt-0.5">
              Stored footprint: {formatByteSizePure(totalStoredBytes)}
              {totalSavingsPct > 0
                ? ` · Saved ${totalSavingsPct}% (from ${formatByteSizePure(totalOrigBytes)})`
                : ''}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={isOptimizing}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
          {isOptimizing ? optimizeStatus || 'Optimizing...' : '+ Add Photos'}
        </button>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs"
        >
          {uploadError}
        </div>
      )}

      {/* Empty State Dropzone */}
      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-4 rounded-xl bg-[var(--barn-canvas)] border border-dashed border-[var(--barn-border)] hover:border-[var(--barn-sage)] transition-colors text-left flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4 text-[var(--barn-muted)]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--barn-ink)]">
                Add 1 or multiple photos for {animal.name}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] truncate">
                Drop images or tap to browse · Resized &amp; compressed ({preset.typicalSizeHint})
              </div>
            </div>
          </div>
          <Sparkles className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
        </button>
      ) : (
        activePhoto && (
          <div className="space-y-2.5">
            {/* Active Photo Showcase Card */}
            <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] overflow-hidden">
              <div className="relative bg-black/20 flex items-center justify-center max-h-72 overflow-hidden group">
                {activePhotoSrc ? (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    aria-label={`Inspect ${activePhoto.caption || `${animal.name} photo`} full size`}
                    className="max-h-72 flex items-center justify-center cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--barn-sage)]"
                  >
                    <img
                      src={activePhotoSrc}
                      alt={activePhoto.caption || `${animal.name} photo`}
                      className="max-h-72 w-auto object-contain select-none"
                    />
                  </button>
                ) : (
                  <div className="w-full py-10 px-4 flex flex-col items-center justify-center text-center gap-1.5 text-xs text-white/85">
                    <Camera className="w-6 h-6 text-white/70" aria-hidden="true" />
                    <div className="font-medium">
                      {activePhoto.originalFileName || 'Synced photo metadata'}
                    </div>
                    <p className="text-[11px] text-white/65 max-w-xs">
                      Photo metadata synced. Restore a Photos-Only or Complete .ZIP backup to view this image.
                    </p>
                  </div>
                )}
                {loadingPhotoId === activePhoto.id && !activePhoto.dataUrl && !hydratedUrls[activePhoto.id] && (
                  <span
                    role="status"
                    className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium"
                  >
                    Loading full photo...
                  </span>
                )}

                {/* Top-Left Cover Status / Set Primary Action */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  {activePhoto.isPrimary ? (
                    <span className="px-2.5 py-1 rounded-lg bg-black/70 text-white text-[11px] font-semibold inline-flex items-center gap-1 backdrop-blur-xs">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                      Cover Photo
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSetPrimaryPhoto(activePhoto.id)}
                      className="min-h-[28px] px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black/85 text-white text-[11px] font-medium inline-flex items-center gap-1 backdrop-blur-xs"
                    >
                      <Star className="w-3 h-3" aria-hidden="true" />
                      Set as Cover
                    </button>
                  )}
                </div>

                {/* Top-Right Fullscreen Zoom Button */}
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label="Inspect full size"
                  className="absolute top-2.5 right-2.5 min-h-[30px] min-w-[30px] rounded-lg bg-black/70 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-xs"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                {/* Prev/Next Overlay Arrows when Multiple Photos Exist */}
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const prev = photos[(activeIndex - 1 + photos.length) % photos.length];
                        if (prev) setSelectedPhotoId(prev.id);
                      }}
                      aria-label="Previous photo"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = photos[(activeIndex + 1) % photos.length];
                        if (next) setSelectedPhotoId(next.id);
                      }}
                      aria-label="Next photo"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Caption Editor + Compression Metadata Bar */}
              <div className="p-2.5 border-t border-[var(--barn-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    type="text"
                    aria-label="Photo caption"
                    placeholder="Add photo caption (e.g. Side profile, Left ear tattoo)..."
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    onBlur={() => void commitCaptionIfChanged()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                  {captionSavedPulse && (
                    <span className="text-[11px] text-[var(--barn-sage)] inline-flex items-center gap-0.5 shrink-0">
                      <Check className="w-3 h-3" />
                      Saved
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                  <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                    {activePhoto.width > 0 ? `${activePhoto.width}×${activePhoto.height} · ` : ''}
                    {formatByteSizePure(activePhoto.storedBytes)}
                    {calculateSavingsPercent(activePhoto.originalBytes, activePhoto.storedBytes) > 0
                      ? ` (-${calculateSavingsPercent(
                          activePhoto.originalBytes,
                          activePhoto.storedBytes
                        )}%)`
                      : ''}
                  </span>

                  {confirmDeleteId === activePhoto.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDeletePhoto(activePhoto.id)}
                        className="min-h-[28px] px-2 py-0.5 rounded-md bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(activePhoto.id)}
                      aria-label="Delete photo"
                      className="min-h-[30px] min-w-[30px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Primary Photo Prompt & Quick Selector when 2+ Photos Exist */}
            {photos.length >= 2 && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  showPrimaryPrompt
                    ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                    : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[var(--barn-ink)]">
                      {showPrimaryPrompt
                        ? 'Choose Your Primary Photo (Multiple Photos Uploaded)'
                        : 'Primary Photo for Profile & Printed Pedigree'}
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)]">
                      Tap any thumbnail below or mark your favorite as Primary so you can print it on
                      official pedigrees.
                    </p>
                  </div>
                  {showPrimaryPrompt && (
                    <button
                      type="button"
                      onClick={() => setShowPrimaryPrompt(false)}
                      className="min-h-[28px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium"
                    >
                      Done
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {photos.map((p, idx) => {
                    const isCurrent = p.id === activePhoto.id;
                    return (
                      <div key={p.id} className="flex flex-col items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedPhotoId(p.id)}
                          className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                            isCurrent
                              ? 'border-[var(--barn-sage)] scale-[1.02]'
                              : 'border-[var(--barn-border)] opacity-75 hover:opacity-100'
                          }`}
                        >
                          {p.thumbnailDataUrl || p.dataUrl ? (
                            <img
                              src={p.thumbnailDataUrl || p.dataUrl}
                              alt={p.caption || `Photo ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span
                              title="Photo metadata synced — restore ZIP backup for image"
                              className="w-full h-full flex items-center justify-center bg-[var(--barn-canvas)] text-[var(--barn-muted)]"
                            >
                              <Camera className="w-4 h-4" aria-hidden="true" />
                            </span>
                          )}
                          {p.isPrimary && (
                            <span
                              title="Primary photo"
                              className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 flex items-center justify-center"
                            >
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={p.isPrimary}
                          onClick={() => {
                            void handleSetPrimaryPhoto(p.id);
                            setSelectedPhotoId(p.id);
                            setShowPrimaryPrompt(false);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            p.isPrimary
                              ? 'text-[var(--barn-sage)] font-semibold'
                              : 'border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                          }`}
                        >
                          {p.isPrimary ? 'Primary ★' : 'Set Primary'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Full-Screen Lightbox Modal */}
      {lightboxOpen && activePhoto && (
        <div
          ref={lightboxDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${animal.name} photo viewer`}
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full flex flex-col items-center gap-3"
          >
            <div className="w-full flex items-center justify-between text-white text-xs px-1">
              <div className="truncate">
                <span className="font-semibold">{animal.name}</span>
                {activePhoto.caption ? ` — ${activePhoto.caption}` : ''}
                <span className="text-white/65 font-mono ml-2">
                  ({activeIndex + 1}/{photos.length} · {activePhoto.width}×{activePhoto.height} ·{' '}
                  {formatByteSizePure(activePhoto.storedBytes)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close photo viewer"
                className="min-h-[36px] min-w-[36px] rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative w-full flex items-center justify-center">
              {activePhotoSrc ? (
                <img
                  src={activePhotoSrc}
                  alt={activePhoto.caption || animal.name}
                  className="max-h-[78vh] max-w-full rounded-xl object-contain"
                />
              ) : (
                <div className="p-8 rounded-xl bg-black/50 border border-white/15 text-center text-white/85 text-xs space-y-1.5">
                  <Camera className="w-7 h-7 mx-auto text-white/70" aria-hidden="true" />
                  <div className="font-medium">
                    {activePhoto.originalFileName || 'Synced photo metadata'}
                  </div>
                  <div className="text-[11px] text-white/65">
                    Restore a Photos-Only or Complete .ZIP backup to view this image.
                  </div>
                </div>
              )}
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const prev = photos[(activeIndex - 1 + photos.length) % photos.length];
                      if (prev) setSelectedPhotoId(prev.id);
                    }}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = photos[(activeIndex + 1) % photos.length];
                      if (next) setSelectedPhotoId(next.id);
                    }}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

## `src/components/ArchivedHerdsModal.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Archived Herds Management Dialog (`ArchivedHerdsModal`).
 *
 * Lists compressed `.archive.zip` bundles stored in OPFS `/archives` for retired,
 * sold, or deceased livestock. Supports searching, species filtering, 1-click full
 * restore (with original status or back to Active), `.ZIP` download, permanent
 * deletion, and toggling `autoOffloadRetiredToOpfs`.
 */

import {
  Archive,
  ArchiveRestore,
  Download,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { ArchivedHerdIndexEntry } from '../core/backupVault';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

interface ArchivedHerdsModalProps {
  isOpen: boolean;
  opfsSupported: boolean;
  archives: ArchivedHerdIndexEntry[];
  autoOffloadEnabled: boolean;
  onToggleAutoOffload: (enabled: boolean) => void;
  onRestoreArchive: (
    archiveKey: string,
    options?: { restoreToActiveStatus?: boolean; deleteArchiveAfterRestore?: boolean }
  ) => Promise<void>;
  onDownloadArchive: (archiveKey: string) => Promise<void>;
  onDeleteArchive: (archiveKey: string) => Promise<void>;
  onClose: () => void;
}

export function ArchivedHerdsModal({
  isOpen,
  opfsSupported,
  archives,
  autoOffloadEnabled,
  onToggleAutoOffload,
  onRestoreArchive,
  onDownloadArchive,
  onDeleteArchive,
  onClose,
}: ArchivedHerdsModalProps) {
  const [query, setQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const dialogRef = useAccessibleDialog({ isOpen, onClose });

  const availableSpecies = useMemo(() => {
    const set = new Set<string>();
    for (const entry of archives) {
      for (const sp of entry.speciesSummary) {
        if (sp) set.add(sp);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [archives]);

  const filteredArchives = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archives.filter((entry) => {
      if (
        speciesFilter !== 'all' &&
        !entry.speciesSummary.some((sp) => sp.toLowerCase() === speciesFilter.toLowerCase())
      ) {
        return false;
      }
      if (!q) return true;
      return (
        entry.speciesSummary.some((sp) => sp.toLowerCase().includes(q)) ||
        entry.animals.some(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.tattoo.toLowerCase().includes(q) ||
            a.breed.toLowerCase().includes(q) ||
            a.status.toLowerCase().includes(q) ||
            (a.buyerName || '').toLowerCase().includes(q)
        )
      );
    });
  }, [archives, query, speciesFilter]);

  if (!isOpen) return null;

  const handleRestore = async (archiveKey: string, restoreToActiveStatus: boolean) => {
    setActionError(null);
    setBusyKey(archiveKey);
    try {
      await onRestoreArchive(archiveKey, {
        restoreToActiveStatus,
        deleteArchiveAfterRestore: true,
      });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not restore archived herd.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="archived-herds-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden focus:outline-none">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[var(--barn-border)]">
          <div className="space-y-0.5">
            <h2
              id="archived-herds-modal-title"
              className="font-display text-lg font-semibold flex items-center gap-2"
            >
              <Archive className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
              <span>Archived Herds (OPFS /archives)</span>
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              Full animal records, high-resolution photos, and care logs offloaded from active
              SQLite memory. Ancestor-linked records keep lightweight Pedigree Reference stubs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Archived Herds dialog"
            className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoOffloadEnabled}
              disabled={!opfsSupported}
              onChange={(e) => onToggleAutoOffload(e.target.checked)}
              className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
            />
            <span>
              <strong className="text-[var(--barn-ink)]">
                Automatically offload Sold &amp; Deceased animals to OPFS /archives on save
              </strong>
              <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                Moves heavy photos and care logs into compressed `.archive.zip` bundles cleanly
                without breaking sire/dam ancestry trees.
              </span>
            </span>
          </label>

          {archives.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search archived herds"
                  placeholder="Search by animal name, tattoo, breed, buyer, or status..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>

              <select
                aria-label="Filter archives by species"
                value={speciesFilter}
                onChange={(e) => setSpeciesFilter(e.target.value)}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                <option value="all">All Species ({archives.length})</option>
                {availableSpecies.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>
          )}

          {actionError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
            >
              {actionError}
            </div>
          )}

          {!opfsSupported ? (
            <div className="p-5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
              Origin Private File System (OPFS) directory access is not supported in this browser.
              Sold and Deceased records remain stored in your local Herd Archived tab.
            </div>
          ) : filteredArchives.length === 0 ? (
            <div className="p-6 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-center text-xs text-[var(--barn-muted)]">
              {archives.length === 0
                ? 'No animals have been offloaded to OPFS /archives yet. Mark an animal Sold or Deceased, or select animals in Herd Registry -> Offload to OPFS /archives.'
                : 'No archived bundles match your current filter.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-hidden">
              {filteredArchives.map((bundle) => {
                const isBusy = busyKey === bundle.archiveKey;
                const isConfirmDelete = confirmDeleteKey === bundle.archiveKey;
                const stubCount = bundle.animals.filter((a) => a.hasPedigreeStubInDb).length;

                return (
                  <div key={bundle.archiveKey} className="p-4 space-y-2.5 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-semibold text-[var(--barn-ink)]">
                          {bundle.speciesSummary.join(', ')} · {bundle.animalCount} animal
                          {bundle.animalCount === 1 ? '' : 's'}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                          Archived {new Date(bundle.createdAtIso).toLocaleString()} ·{' '}
                          {bundle.photoCount} photo{bundle.photoCount === 1 ? '' : 's'} ·{' '}
                          {bundle.careLogCount} care log{bundle.careLogCount === 1 ? '' : 's'} ·{' '}
                          {formatByteSizePure(bundle.byteSize)}
                          {stubCount > 0 ? ` · ${stubCount} pedigree stub(s) linked` : ''}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                        {isConfirmDelete ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setConfirmDeleteKey(null);
                                void onDeleteArchive(bundle.archiveKey);
                              }}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold whitespace-nowrap"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(null)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleRestore(bundle.archiveKey, true)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                              {isBusy ? 'Restoring...' : 'Restore to Active'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleRestore(bundle.archiveKey, false)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap disabled:opacity-50"
                            >
                              Restore as Archived
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDownloadArchive(bundle.archiveKey)}
                              aria-label={`Download ${bundle.fileName}`}
                              className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(bundle.archiveKey)}
                              aria-label={`Delete archive ${bundle.fileName}`}
                              className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 pl-2 border-l border-[var(--barn-border)]">
                      {bundle.animals.map((a) => (
                        <div
                          key={a.id}
                          className="text-[11px] text-[var(--barn-muted)] flex flex-wrap items-center gap-x-1.5"
                        >
                          <strong className="text-[var(--barn-ink)] font-medium">{a.name}</strong>
                          <span className="font-mono">({a.tattoo || 'No ID'})</span>
                          <span>·</span>
                          <span>{a.status}</span>
                          {a.breed && (
                            <>
                              <span>·</span>
                              <span>
                                {a.breed} {a.variety}
                              </span>
                            </>
                          )}
                          {a.buyerName && (
                            <>
                              <span>·</span>
                              <span>Buyer: {a.buyerName}</span>
                            </>
                          )}
                          {a.deathCause && (
                            <>
                              <span>·</span>
                              <span>Cause: {a.deathCause}</span>
                            </>
                          )}
                          {a.hasPedigreeStubInDb && (
                            <>
                              <span>·</span>
                              <span className="text-[var(--barn-sage)] font-medium">
                                Pedigree Reference stub retained
                              </span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

## `src/components/AsyncErrorToastHost.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Non-blocking Global Async Error & Background Pause Toast Host (`src/components/AsyncErrorToastHost.tsx`).
 *
 * Behavior:
 * - Minor transient warnings / clean background pauses auto-dismiss after 9s (no manual tap needed).
 * - Severity errors (QuotaExceeded, memory faults, DB write failures, permission-lost sync pauses)
 *   remain sticky until dismissed or acted upon.
 */

import { AlertTriangle, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getPausedBackgroundJobs,
  PausedBackgroundJob,
  resumePausedBackgroundJob,
  subscribePausedBackgroundJobs,
} from '../storage/backgroundFreezeCoordinator';
import {
  AsyncErrorNotice,
  dismissAsyncErrorToast,
  getActiveAsyncErrorToasts,
  subscribeAsyncErrorToasts,
} from '../storage/crashLogger';

interface AsyncErrorToastHostProps {
  onOpenDiagnostics: () => void;
  isOnSettingsRoute: boolean;
}

export function AsyncErrorToastHost({
  onOpenDiagnostics,
  isOnSettingsRoute,
}: AsyncErrorToastHostProps) {
  const [notices, setNotices] = useState<AsyncErrorNotice[]>(() => getActiveAsyncErrorToasts());
  const [pausedJobs, setPausedJobs] = useState<PausedBackgroundJob[]>(() =>
    getPausedBackgroundJobs().filter((j) => j.severity === 'severity')
  );
  const [resumingJobId, setResumingJobId] = useState<string | null>(null);

  useEffect(() => {
    const unsubToasts = subscribeAsyncErrorToasts((list) => {
      setNotices(list);
    });
    const unsubJobs = subscribePausedBackgroundJobs((jobs) => {
      setPausedJobs(jobs.filter((j) => j.severity === 'severity'));
    });
    return () => {
      unsubToasts();
      unsubJobs();
    };
  }, []);

  if (notices.length === 0 && pausedJobs.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-20 md:bottom-5 right-3 left-3 sm:left-auto sm:w-[400px] z-40 space-y-2 pointer-events-none"
      aria-label="System notifications"
    >
      {pausedJobs.slice(0, 1).map((job) => (
        <div
          key={`paused-${job.taskId}`}
          role="alert"
          aria-live="assertive"
          className="pointer-events-auto rounded-xl border border-[var(--barn-terracotta)] bg-[var(--barn-surface)] text-[var(--barn-ink)] shadow-lg p-3.5 text-xs space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-semibold text-[var(--barn-ink)]">
                {job.label} Paused — Action Needed
              </div>
              <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed break-words">
                {job.severityReason ||
                  'Background suspension interrupted this task and requires confirmation to continue safely.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {job.resumeHandler && (
              <button
                type="button"
                disabled={resumingJobId === job.taskId}
                aria-busy={resumingJobId === job.taskId}
                onClick={() => {
                  if (resumingJobId) return;
                  setResumingJobId(job.taskId);
                  void resumePausedBackgroundJob(job.taskId).finally(() => {
                    setResumingJobId(null);
                  });
                }}
                className="min-h-[44px] sm:min-h-[34px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${resumingJobId === job.taskId ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {resumingJobId === job.taskId ? 'Resuming...' : 'Tap to Resume'}
              </button>
            )}
          </div>
        </div>
      ))}

      {notices.map((notice) => {
        const isError = notice.severity === 'error';
        return (
          <div
            key={notice.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={`pointer-events-auto rounded-xl border shadow-lg p-3.5 text-xs space-y-2 ${
              isError
                ? 'border-[var(--barn-danger)] bg-[var(--barn-surface)] text-[var(--barn-ink)]'
                : 'border-[var(--barn-terracotta)] bg-[var(--barn-surface)] text-[var(--barn-ink)]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {isError ? (
                <ShieldAlert
                  className="w-4 h-4 text-[var(--barn-danger)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="font-semibold text-[var(--barn-ink)]">{notice.title}</div>
                <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed break-words">
                  {notice.detail}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Dismiss ${notice.title}`}
                onClick={() => dismissAsyncErrorToast(notice.id)}
                className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] -mt-1 -mr-1 rounded-lg hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center shrink-0 text-[var(--barn-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {(notice.canOpenDiagnostics && !isOnSettingsRoute) || notice.sticky ? (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                {notice.canOpenDiagnostics && !isOnSettingsRoute && (
                  <button
                    type="button"
                    onClick={() => {
                      dismissAsyncErrorToast(notice.id);
                      onOpenDiagnostics();
                    }}
                    className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)]"
                  >
                    Open Diagnostics
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismissAsyncErrorToast(notice.id)}
                  className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-subtle)] text-[var(--barn-ink)] text-[11px] font-medium hover:opacity-90"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
```

## `src/components/BarnBenchScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * "Barn Bench" Fast Sequential Batch Entry Screen (`src/components/BarnBenchScreen.tsx`).
 *
 * Tap-friendly, cage-row-walkable chore sheet strictly isolated to the active species.
 * Lets breeders walk down a physical barn row logging weights, body condition scores (BCS),
 * nail trims / hoof grooming, cage moves (with live capacity checks), and quick notes
 * with automatic advance and zero modal switching.
 */

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  MapPin,
  RotateCcw,
  Scale,
  Scissors,
  Search,
  ShieldAlert,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildWithdrawalByAnimalMap,
  evaluateCageAssignmentCapacityWarning,
  evaluateSpeciesCagesOccupancy,
} from '../core/barnAlerts';
import {
  BARN_BENCH_BCS_PRESETS,
  BARN_BENCH_SECTION_ALL,
  BARN_BENCH_SECTION_UNASSIGNED,
  BarnBenchBatchEntryDraft,
  BarnBenchFocusMode,
  BarnBenchStatusFilter,
  buildBarnBenchQueue,
  extractSpeciesCageSections,
  findNextBarnBenchIndex,
} from '../core/barnBench';
import {
  BarnSettings,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  formatWeightInputValue,
  getSpeciesIdentifierLabels,
  getWeightInputMeta,
  parseWeightInputToGrams,
  resolveSpeciesWeightUnit,
  todayDateIso,
} from '../core/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

interface BarnBenchScreenProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onCommitEntry: (
    draft: BarnBenchBatchEntryDraft
  ) => Promise<{ ok: boolean; animalId: string; summary: string[] }>;
  onOpenAnimal: (animalId: string) => void;
  onBackToHub: () => void;
}

const FOCUS_MODES: ReadonlyArray<{ id: BarnBenchFocusMode; label: string }> = [
  { id: 'all', label: 'All Fields' },
  { id: 'weight', label: 'Weights' },
  { id: 'bcs', label: 'BCS' },
  { id: 'nail_trim', label: 'Nail Trim' },
  { id: 'cage_move', label: 'Cage Move' },
];

export function BarnBenchScreen({
  activeData,
  settings,
  onCommitEntry,
  onOpenAnimal,
  onBackToHub,
}: BarnBenchScreenProps) {
  const { speciesProfile, animals, cages, careLogs, primaryPhotoByAnimalId } = activeData;
  const baseId = useId();
  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 200 });

  const weightUnit = useMemo(
    () => resolveSpeciesWeightUnit(speciesProfile, settings),
    [speciesProfile, settings]
  );
  const weightMeta = useMemo(() => getWeightInputMeta(weightUnit), [weightUnit]);
  const idLabels = useMemo(
    () => getSpeciesIdentifierLabels(speciesProfile.name),
    [speciesProfile.name]
  );

  // Queue filter & session preferences
  const [sectionFilter, setSectionFilter] = useState<string>(BARN_BENCH_SECTION_ALL);
  const [statusFilter, setStatusFilter] = useState<BarnBenchStatusFilter>('housing');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusMode, setFocusMode] = useState<BarnBenchFocusMode>('all');
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [entryDateIso, setEntryDateIso] = useState<string>(() => todayDateIso());

  // Session progress & active bench cursor
  const [activeAnimalId, setActiveAnimalId] = useState<string | null>(null);
  const [loggedSessionMap, setLoggedSessionMap] = useState<Record<string, string[]>>({});
  const [lastSavedBanner, setLastSavedBanner] = useState<{
    animalName: string;
    summary: string[];
  } | null>(null);

  // Per-animal bench input draft
  const [weightInput, setWeightInput] = useState<string>('');
  const [selectedBcs, setSelectedBcs] = useState<number | null>(null);
  const [customBcsInput, setCustomBcsInput] = useState<string>('');
  const [nailTrimDone, setNailTrimDone] = useState<boolean>(false);
  const [targetCageLocation, setTargetCageLocation] = useState<string>('');
  const [customCageMode, setCustomCageMode] = useState<boolean>(false);
  const [notesInput, setNotesInput] = useState<string>('');
  const [confirmOverCapacity, setConfirmOverCapacity] = useState<boolean>(false);

  // Reset species-specific session filters when switching active species
  useEffect(() => {
    setSectionFilter(BARN_BENCH_SECTION_ALL);
    setStatusFilter('housing');
    setSearchQuery('');
    setActiveAnimalId(null);
    setLoggedSessionMap({});
    setLastSavedBanner(null);
  }, [speciesProfile.name]);

  const sections = useMemo(
    () => extractSpeciesCageSections(cages, speciesProfile.name),
    [cages, speciesProfile.name]
  );

  const sortedCages = useMemo(
    () =>
      [...cages].sort(
        (a, b) =>
          (a.section || '').localeCompare(b.section || '', undefined, {
            numeric: true,
            sensitivity: 'base',
          }) ||
          a.label.localeCompare(b.label, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
      ),
    [cages]
  );

  const cagesOccupancy = useMemo(
    () => evaluateSpeciesCagesOccupancy(cages, animals, speciesProfile.name),
    [cages, animals, speciesProfile.name]
  );

  const withdrawalByAnimalId = useMemo(() => buildWithdrawalByAnimalMap(careLogs), [careLogs]);

  const queue = useMemo(
    () =>
      buildBarnBenchQueue({
        animals,
        cages,
        careLogs,
        options: {
          speciesName: speciesProfile.name,
          sectionFilter,
          statusFilter,
          searchQuery,
        },
      }),
    [animals, cages, careLogs, speciesProfile.name, sectionFilter, statusFilter, searchQuery]
  );

  const currentIndex = useMemo(() => {
    if (queue.length === 0) return 0;
    if (activeAnimalId) {
      const idx = queue.findIndex((row) => row.animal.id === activeAnimalId);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [queue, activeAnimalId]);

  const activeRow = queue[currentIndex] ?? null;
  const activeAnimal = activeRow?.animal ?? null;

  // Reset per-row draft whenever the active animal switches
  useEffect(() => {
    if (!activeRow) {
      setWeightInput('');
      setSelectedBcs(null);
      setCustomBcsInput('');
      setNailTrimDone(false);
      setTargetCageLocation('');
      setCustomCageMode(false);
      setNotesInput('');
      setConfirmOverCapacity(false);
      return;
    }
    const existingCageLabel = activeRow.cageLabel;
    const isKnownCage =
      !existingCageLabel ||
      sortedCages.some((c) => c.label.trim().toLowerCase() === existingCageLabel.toLowerCase());
    setWeightInput('');
    setSelectedBcs(null);
    setCustomBcsInput('');
    setNailTrimDone(false);
    setTargetCageLocation(existingCageLabel);
    setCustomCageMode(!isKnownCage);
    setNotesInput('');
    setConfirmOverCapacity(false);
  }, [activeRow?.animal.id]);

  // Reset over-capacity confirmation whenever target cage changes
  useEffect(() => {
    setConfirmOverCapacity(false);
  }, [targetCageLocation]);

  const parsedWeightGrams = useMemo(
    () => parseWeightInputToGrams(weightInput, weightUnit),
    [weightInput, weightUnit]
  );

  const effectiveBcs = useMemo(() => {
    const customTrimmed = customBcsInput.trim();
    if (customTrimmed) {
      const parsed = Number(customTrimmed);
      return Number.isFinite(parsed) && parsed > 0 ? Math.min(20, Math.round(parsed * 10) / 10) : 0;
    }
    return selectedBcs && selectedBcs > 0 ? selectedBcs : 0;
  }, [customBcsInput, selectedBcs]);

  const cageChanged = useMemo(() => {
    if (!activeRow) return false;
    return targetCageLocation.trim() !== activeRow.cageLabel.trim();
  }, [activeRow, targetCageLocation]);

  const cageCapacityWarning = useMemo(() => {
    if (!activeRow || !cageChanged || !targetCageLocation.trim()) return null;
    return evaluateCageAssignmentCapacityWarning({
      targetCageLabel: targetCageLocation,
      cages,
      animals,
      speciesName: speciesProfile.name,
      animalId: activeRow.animal.id,
      animalName: activeRow.animal.name,
      wasAlreadyOccupyingTargetCage: false,
      willOccupyAfterSave: true,
    });
  }, [activeRow, cageChanged, targetCageLocation, cages, animals, speciesProfile.name]);

  const hasDraftChanges = Boolean(
    activeRow &&
      (parsedWeightGrams > 0 ||
        effectiveBcs > 0 ||
        nailTrimDone ||
        cageChanged ||
        notesInput.trim().length > 0)
  );

  const needsCapacityConfirm = Boolean(cageCapacityWarning?.wouldExceed && !confirmOverCapacity);

  const loggedInQueueCount = useMemo(() => {
    let count = 0;
    for (const row of queue) {
      if (loggedSessionMap[row.animal.id]?.length) {
        count++;
      }
    }
    return count;
  }, [queue, loggedSessionMap]);

  const progressPercent =
    queue.length > 0 ? Math.min(100, Math.round((loggedInQueueCount / queue.length) * 100)) : 0;

  const activeWithdrawal = activeAnimal ? withdrawalByAnimalId.get(activeAnimal.id) : undefined;
  const activeThumb = activeAnimal
    ? primaryPhotoByAnimalId.get(activeAnimal.id)?.thumbnailDataUrl
    : undefined;

  const handleSelectIndex = (nextIdx: number) => {
    if (queue.length === 0) return;
    const clamped = Math.max(0, Math.min(queue.length - 1, nextIdx));
    setActiveAnimalId(queue[clamped].animal.id);
  };

  const handleSkipNext = () => {
    if (queue.length <= 1) return;
    const nextIdx = (currentIndex + 1) % queue.length;
    setActiveAnimalId(queue[nextIdx].animal.id);
  };

  const handleStepPrev = () => {
    if (queue.length <= 1) return;
    const prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    setActiveAnimalId(queue[prevIdx].animal.id);
  };

  const handleCommit = async (advanceAfter: boolean) => {
    if (!activeRow || !hasDraftChanges || needsCapacityConfirm) return;

    const currentAnimalId = activeRow.animal.id;
    const currentAnimalName = activeRow.animal.name;

    // Precompute next target animal BEFORE commit so a cage move re-sorting the queue
    // still advances smoothly to the next expected animal in the barn row.
    const projectedLoggedIds = new Set<string>(Object.keys(loggedSessionMap));
    projectedLoggedIds.add(currentAnimalId);
    const nextIndex = findNextBarnBenchIndex({
      queue,
      currentIndex,
      loggedAnimalIds: projectedLoggedIds,
      preferUnlogged: true,
    });
    const nextTargetAnimalId =
      queue.length > 1 && nextIndex !== currentIndex ? queue[nextIndex]?.animal.id ?? null : null;

    const draft: BarnBenchBatchEntryDraft = {
      animalId: currentAnimalId,
      dateIso: entryDateIso || todayDateIso(),
      weightGrams: parsedWeightGrams > 0 ? parsedWeightGrams : undefined,
      bodyConditionScore: effectiveBcs > 0 ? effectiveBcs : undefined,
      nailTrimDone: nailTrimDone || undefined,
      targetCageLocation: cageChanged ? targetCageLocation.trim() : undefined,
      notes: notesInput.trim() || undefined,
    };

    const locked = await submitLock.runLocked(() => onCommitEntry(draft));
    const result = locked.skipped ? null : locked.value;
    if (!result || !result.ok) return;

    setLoggedSessionMap((prev) => {
      const existing = prev[currentAnimalId] || [];
      const merged = Array.from(new Set([...existing, ...result.summary]));
      return { ...prev, [currentAnimalId]: merged };
    });
    setLastSavedBanner({
      animalName: currentAnimalName,
      summary: result.summary,
    });

    if (advanceAfter && nextTargetAnimalId) {
      setActiveAnimalId(nextTargetAnimalId);
      if (focusMode === 'weight' && weightInputRef.current) {
        weightInputRef.current.focus();
      }
    } else {
      // Clear active draft fields while remaining on the same animal
      setWeightInput('');
      setSelectedBcs(null);
      setCustomBcsInput('');
      setNailTrimDone(false);
      setNotesInput('');
      setConfirmOverCapacity(false);
    }
  };

  const showWeightBlock = focusMode === 'all' || focusMode === 'weight';
  const showBcsBlock = focusMode === 'all' || focusMode === 'bcs';
  const showTrimBlock = focusMode === 'all' || focusMode === 'nail_trim';
  const showCageBlock = focusMode === 'all' || focusMode === 'cage_move';

  return (
    <div className="space-y-5">
      {/* Header & Session Progress */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBackToHub}
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{speciesProfile.name} Hub</span>
              </button>
              <span className="text-[11px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] font-semibold">
                Fast Sequential Entry
              </span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>{speciesProfile.name} Barn Bench</span>
            </h1>
            <p className="text-xs text-[var(--barn-muted)]">
              Walk down each cage row and log weights, body condition scores, nail trims, or cage moves with auto-advance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`${baseId}-entry-date`}
              className="text-[11px] text-[var(--barn-muted)] font-medium"
            >
              Chore Date
            </label>
            <input
              id={`${baseId}-entry-date`}
              type="date"
              value={entryDateIso}
              onChange={(e) => setEntryDateIso(e.target.value || todayDateIso())}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
            />
            {Object.keys(loggedSessionMap).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLoggedSessionMap({});
                  setLastSavedBanner(null);
                }}
                title="Clear green session checkmarks (saved records remain untouched)"
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Sheet</span>
              </button>
            )}
          </div>
        </div>

        {/* Row / Section Filter Bar + Status + Search */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-4">
            <label
              htmlFor={`${baseId}-section-filter`}
              className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
            >
              Barn Row / Section
            </label>
            <select
              id={`${baseId}-section-filter`}
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value={BARN_BENCH_SECTION_ALL}>All Rows &amp; Cages</option>
              {sections.map((sec) => (
                <option key={sec} value={sec}>
                  Row / Section: {sec}
                </option>
              ))}
              <option value={BARN_BENCH_SECTION_UNASSIGNED}>Unassigned Animals Only</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor={`${baseId}-status-filter`}
              className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
            >
              Herd Group
            </label>
            <select
              id={`${baseId}-status-filter`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BarnBenchStatusFilter)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value="housing">All Housed Stock (Active, Junior, Retired)</option>
              <option value="active_only">Active Breeding Stock Only</option>
              <option value="junior_only">Juniors / Growouts Only</option>
            </select>
          </div>

          <div className="md:col-span-5">
            <label
              htmlFor={`${baseId}-search`}
              className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
            >
              Quick Jump / Filter
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id={`${baseId}-search`}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Filter by cage, name, or ${idLabels.shortLabel.toLowerCase()}...`}
                className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
            </div>
          </div>
        </div>

        {/* Focus Mode Strip + Auto-Advance Toggle + Progress Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Entry focus mode">
            {FOCUS_MODES.map((mode) => {
              const active = focusMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFocusMode(mode.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="w-4 h-4 accent-[var(--barn-sage)] rounded"
            />
            <span>Auto-advance to next unlogged cage</span>
          </label>
        </div>

        {/* Session Progress Indicator */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--barn-muted)]">
            <span>
              Bench Queue: <strong className="text-[var(--barn-ink)] tabular-nums">{queue.length}</strong>{' '}
              animal{queue.length === 1 ? '' : 's'}
            </span>
            <span className="tabular-nums font-medium">
              <strong className="text-[var(--barn-sage)]">{loggedInQueueCount}</strong> / {queue.length} logged this session ({progressPercent}%)
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Barn Bench session completion"
            className="h-2 w-full rounded-full bg-[var(--barn-canvas)] border border-[var(--barn-border)] overflow-hidden"
          >
            <div
              className="h-full bg-[var(--barn-sage)] transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* Brief Last-Saved Confirmation Strip */}
      {lastSavedBanner && (
        <div
          role="status"
          aria-live="polite"
          className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-xl px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>
              Logged <strong>{lastSavedBanner.animalName}</strong>: {lastSavedBanner.summary.join(' · ')}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setLastSavedBanner(null)}
            className="text-[11px] underline text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Empty Queue State */}
      {!activeRow || !activeAnimal ? (
        <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-3">
          <h2 className="font-display text-lg font-semibold">
            No {speciesProfile.name} Animals Match This Bench Filter
          </h2>
          <p className="text-xs text-[var(--barn-muted)] max-w-md mx-auto">
            {sectionFilter !== BARN_BENCH_SECTION_ALL || statusFilter !== 'housing' || searchQuery.trim()
              ? 'Try switching back to All Rows & Cages or clearing your search filter.'
              : `Add active or junior ${speciesProfile.name.toLowerCase()} records in the Herd Registry to start sequential cage-side entry.`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {(sectionFilter !== BARN_BENCH_SECTION_ALL ||
              statusFilter !== 'housing' ||
              searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSectionFilter(BARN_BENCH_SECTION_ALL);
                  setStatusFilter('housing');
                  setSearchQuery('');
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
              >
                Reset Bench Filters
              </button>
            )}
            <button
              type="button"
              onClick={onBackToHub}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
            >
              Back to {speciesProfile.name} Hub
            </button>
          </div>
        </section>
      ) : (
        /* Active Cage-Side Bench Card */
        <section className="bg-[var(--barn-surface)] border-2 border-[var(--barn-sage)]/70 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
          {/* Active Animal Identity Banner */}
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[var(--barn-border)]">
            <div className="flex items-start gap-3 min-w-0">
              {activeThumb ? (
                <img
                  src={activeThumb}
                  alt={activeAnimal.name}
                  className="w-14 h-14 rounded-xl object-cover border border-[var(--barn-border)] shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex items-center justify-center text-xs font-mono font-bold text-[var(--barn-muted)] shrink-0">
                  {activeRow.cageLabel ? activeRow.cageLabel.slice(0, 6) : '—'}
                </div>
              )}

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-xs font-mono font-bold text-[var(--barn-sage)]">
                    {activeRow.hasAssignedCage ? activeRow.cageLabel : 'Unassigned Cage'}
                  </span>
                  <span className="text-[11px] text-[var(--barn-muted)] font-medium">
                    {activeRow.sectionLabel}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums">
                    #{currentIndex + 1} of {queue.length}
                  </span>
                  {loggedSessionMap[activeAnimal.id]?.length ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold">
                      <Check className="w-3 h-3" aria-hidden="true" />
                      Logged
                    </span>
                  ) : null}
                </div>

                <h2 className="font-display text-xl sm:text-2xl font-bold truncate">
                  {activeAnimal.name}
                </h2>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                  <span className="font-mono font-semibold text-[var(--barn-ink)]">
                    {activeAnimal.tattoo || 'No ID'}
                  </span>
                  <span>{formatSexForSpecies(activeAnimal.sex, speciesProfile)}</span>
                  <span>{activeAnimal.status}</span>
                  {(activeAnimal.breed || activeAnimal.variety) && (
                    <span>
                      {[activeAnimal.breed, activeAnimal.variety].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeWithdrawal?.isActive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] font-semibold text-[var(--barn-terracotta)]">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Withdrawal Hold: {activeWithdrawal.shortCountdownLabel} (clear{' '}
                    {formatReadableDate(activeWithdrawal.clearDateIso)})
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenAnimal(activeAnimal.id)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <span>Open Profile</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Focused / All Entry Blocks */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCommit(autoAdvance);
            }}
            className="space-y-4"
          >
            <div
              className={`grid grid-cols-1 ${
                focusMode === 'all' ? 'lg:grid-cols-2' : ''
              } gap-4`}
            >
              {/* 1. Weight Check */}
              {showWeightBlock && (
                <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`${baseId}-weight`}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Scale className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Weight Check ({weightMeta.shortUnit})</span>
                    </label>
                    <span className="text-[11px] text-[var(--barn-muted)] font-mono">
                      Current: {formatWeight(activeAnimal.weightGrams, weightUnit)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={weightInputRef}
                      id={`${baseId}-weight`}
                      type="text"
                      inputMode="decimal"
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      placeholder={weightMeta.placeholder}
                      className="flex-1 min-h-[46px] px-3.5 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-base font-mono font-semibold"
                    />
                    {activeAnimal.weightGrams > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setWeightInput(formatWeightInputValue(activeAnimal.weightGrams, weightUnit))
                        }
                        className="min-h-[46px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium whitespace-nowrap"
                      >
                        Same Wt
                      </button>
                    )}
                  </div>
                  {parsedWeightGrams > 0 && (
                    <div className="text-[11px] text-[var(--barn-sage)] font-medium">
                      Will save: {formatWeight(parsedWeightGrams, weightUnit)} ({parsedWeightGrams.toLocaleString()} g)
                    </div>
                  )}
                </div>
              )}

              {/* 2. Body Condition Score (BCS) */}
              {showBcsBlock && (
                <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Body Condition Score (BCS)</span>
                    </span>
                    <span className="text-[11px] text-[var(--barn-muted)] font-mono">
                      Latest:{' '}
                      {activeRow.latestBcs > 0
                        ? `${activeRow.latestBcs} (${formatReadableDate(activeRow.latestBcsDateIso)})`
                        : 'None'}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5" role="group" aria-label="BCS quick presets">
                    {BARN_BENCH_BCS_PRESETS.map((score) => {
                      const active = !customBcsInput.trim() && selectedBcs === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setCustomBcsInput('');
                            setSelectedBcs((prev) => (prev === score ? null : score));
                          }}
                          className={`min-h-[42px] rounded-xl text-xs font-mono font-bold transition-colors ${
                            active
                              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                              : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                          }`}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    <label
                      htmlFor={`${baseId}-custom-bcs`}
                      className="text-[11px] text-[var(--barn-muted)] whitespace-nowrap"
                    >
                      Custom (e.g. 1–9):
                    </label>
                    <input
                      id={`${baseId}-custom-bcs`}
                      type="text"
                      inputMode="decimal"
                      value={customBcsInput}
                      onChange={(e) => {
                        setCustomBcsInput(e.target.value);
                        if (e.target.value.trim()) setSelectedBcs(null);
                      }}
                      placeholder="Optional"
                      className="w-28 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {/* 3. Nail Trim / Grooming & Hoof */}
              {showTrimBlock && (
                <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Scissors className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Nail Trim / Hoof Grooming</span>
                    </span>
                    <span className="text-[11px] text-[var(--barn-muted)] font-mono">
                      Last:{' '}
                      {activeRow.latestNailTrimDateIso
                        ? formatReadableDate(activeRow.latestNailTrimDateIso)
                        : 'Never logged'}
                    </span>
                  </div>

                  <button
                    type="button"
                    aria-pressed={nailTrimDone}
                    onClick={() => setNailTrimDone((prev) => !prev)}
                    className={`w-full min-h-[50px] px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      nailTrimDone
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                        : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                    }`}
                  >
                    {nailTrimDone ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>Nail Trim / Grooming Done</span>
                      </>
                    ) : (
                      <>
                        <Scissors className="w-4 h-4" aria-hidden="true" />
                        <span>Tap to Mark Nail Trim Done</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* 4. Cage / Pen Move */}
              {showCageBlock && (
                <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`${baseId}-cage-move`}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      <MapPin className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Cage / Pen Move</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomCageMode((prev) => !prev)}
                      className="text-[11px] underline text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                    >
                      {customCageMode ? 'Pick Registered Cage' : 'Type Custom Label'}
                    </button>
                  </div>

                  {customCageMode ? (
                    <input
                      id={`${baseId}-cage-move`}
                      type="text"
                      value={targetCageLocation}
                      onChange={(e) => setTargetCageLocation(e.target.value)}
                      placeholder="Enter cage/pen label or leave blank to unassign"
                      className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
                    />
                  ) : (
                    <select
                      id={`${baseId}-cage-move`}
                      value={targetCageLocation}
                      onChange={(e) => setTargetCageLocation(e.target.value)}
                      className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
                    >
                      <option value="">Unassigned (No Cage)</option>
                      {sortedCages.map((c) => {
                        const occ = cagesOccupancy.byCageId.get(c.id);
                        const ratio = occ ? ` (${occ.ratioLabel})` : '';
                        const sec = c.section ? `${c.section} · ` : '';
                        return (
                          <option key={c.id} value={c.label}>
                            {sec}
                            {c.label}
                            {ratio}
                          </option>
                        );
                      })}
                    </select>
                  )}

                  {cageCapacityWarning && (
                    <div
                      role="alert"
                      className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] rounded-xl p-3 space-y-2 text-xs"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="space-y-0.5">
                          <div className="font-semibold">{cageCapacityWarning.headline}</div>
                          <div className="text-[11px] text-[var(--barn-muted)]">
                            {cageCapacityWarning.detail}
                          </div>
                        </div>
                      </div>
                      {cageCapacityWarning.wouldExceed && (
                        <label className="inline-flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confirmOverCapacity}
                            onChange={(e) => setConfirmOverCapacity(e.target.checked)}
                            className="w-4 h-4 accent-[var(--barn-terracotta)] rounded"
                          />
                          <span>Confirm moving over configured cage capacity</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {focusMode !== 'all' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setFocusMode('all')}
                  className="text-[11px] underline text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                >
                  Show all 4 entry fields for this animal
                </button>
              </div>
            )}

            {/* Quick Note Input */}
            <div>
              <label
                htmlFor={`${baseId}-notes`}
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                Quick Bench Note (optional — attaches to logged entries or saves as a Journal Note)
              </label>
              <input
                id={`${baseId}-notes`}
                type="text"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="e.g. Slight molt on rump, trimmed dewclaws, clean hocks..."
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
            </div>

            {/* Tap-Friendly Sequential Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[var(--barn-border)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={queue.length <= 1 || submitLock.isSubmitting}
                  onClick={handleStepPrev}
                  className="min-h-[46px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={queue.length <= 1 || submitLock.isSubmitting}
                  onClick={handleSkipNext}
                  className="min-h-[46px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <span>Skip</span>
                  <SkipForward className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {autoAdvance && queue.length > 1 && (
                  <button
                    type="button"
                    disabled={!hasDraftChanges || needsCapacityConfirm || submitLock.isSubmitting}
                    onClick={() => void handleCommit(false)}
                    className="min-h-[46px] px-4 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-40"
                  >
                    Save &amp; Stay
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!hasDraftChanges || needsCapacityConfirm || submitLock.isSubmitting}
                  aria-busy={submitLock.isSubmitting}
                  className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                >
                  {submitLock.isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" aria-hidden="true" />
                      <span>
                        {autoAdvance && queue.length > 1 ? 'Save & Next Cage' : 'Save Entry'}
                      </span>
                      {autoAdvance && queue.length > 1 && (
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      )}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Clickable Walkthrough Queue */}
      {queue.length > 0 && (
        <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold">
              Cage Walkthrough Queue ({queue.length})
            </h2>
            <span className="text-[11px] text-[var(--barn-muted)]">
              Tap any row to jump directly to that cage
            </span>
          </div>

          <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl overflow-hidden bg-[var(--barn-canvas)]">
            {queue.map((row, idx) => {
              const isSelected = activeAnimal?.id === row.animal.id;
              const sessionSummaries = loggedSessionMap[row.animal.id];
              const isLogged = Boolean(sessionSummaries && sessionSummaries.length > 0);
              return (
                <button
                  key={row.animal.id}
                  type="button"
                  onClick={() => handleSelectIndex(idx)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`w-full text-left px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-[var(--barn-sage-tint)] border-l-4 border-l-[var(--barn-sage)]'
                      : 'hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg text-[11px] font-mono font-bold inline-flex items-center justify-center shrink-0 ${
                        isLogged
                          ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                          : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-muted)]'
                      }`}
                    >
                      {isLogged ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : idx + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-[var(--barn-sage)]">
                          {row.hasAssignedCage ? row.cageLabel : 'Unassigned'}
                        </span>
                        <span className="text-xs font-semibold truncate">{row.animal.name}</span>
                        {row.animal.tattoo && (
                          <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                            ({row.animal.tattoo})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--barn-muted)]">
                        {row.sectionLabel} · {formatSexForSpecies(row.animal.sex, speciesProfile)} ·{' '}
                        {formatWeight(row.animal.weightGrams, weightUnit)}
                        {row.latestBcs > 0 ? ` · BCS ${row.latestBcs}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    {isLogged ? (
                      <span className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[var(--barn-sage)] font-semibold">
                        {sessionSummaries.join(' · ')}
                      </span>
                    ) : (
                      <span className="text-[var(--barn-muted)]">Pending</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
```

## `src/components/BarnSchedulerGantt.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive Drag-and-Drop Barn Scheduler Gantt Timeline, Smart Priority Escalation,
 * and Local P2P / LAN Outbox Reconciliation Panel (`src/components/BarnSchedulerGantt.tsx`).
 */

import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderSync,
  Layers,
  Radio,
  RefreshCw,
  Send,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BarnGanttBarItem,
  buildBarnGanttTimeline,
  GanttGroupingMode,
  GanttWindowDays,
  resizeTaskStartDateByDays,
  shiftTaskDatesByDays,
} from '../core/barnScheduler';
import { formatSystemTaskTitle } from '../core/calendarExport';
import {
  addDaysIso,
  Animal,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  formatReadableDate,
  SpeciesProfile,
  todayDateIso,
} from '../core/models';
import {
  createP2pAckWireMessage,
  createP2pDeltaWireMessage,
  P2pReconciliationSummary,
  P2pWireMessage,
  parseP2pWireOrDeltaPayload,
} from '../core/p2pSyncProtocol';
import { SyncConflictEntry, SyncOperation } from '../core/syncOutbox';
import { BackupSyncStatus } from '../storage/localSyncChannels';
import {
  createLanP2pSession,
  LanP2pSessionController,
  LanP2pSessionState,
  reconcileWithPickedSyncFolder,
  supportsLanWebRtcP2p,
} from '../storage/p2pLanChannel';
import { copyTextWithFallback } from '../utils/webFileActions';

interface BarnSchedulerGanttProps {
  speciesProfile: SpeciesProfile;
  animals: Animal[];
  tasks: BarnTask[];
  breedings: BreedingRecord[];
  settings: BarnSettings;
  deviceId: string;
  syncOperations: SyncOperation[];
  syncConflicts: SyncConflictEntry[];
  backupSyncStatus?: BackupSyncStatus | null;
  masterBackupJson?: string;
  onToggleTask: (task: BarnTask) => Promise<boolean | void> | void;
  onRescheduleTask: (
    task: BarnTask,
    nextDates: { startDateIso?: string; dueDateIso: string }
  ) => Promise<boolean>;
  onApplySmartEscalations: (tasksToEscalate?: BarnTask[]) => Promise<number>;
  onDeleteTask: (taskId: string) => void;
  onOpenAnimal: (animalId: string) => void;
  onReconcileOutboxOps: (
    incomingOps: SyncOperation[],
    peerDeviceId?: string
  ) => Promise<P2pReconciliationSummary>;
  onResolveSyncConflict: (conflictId: string, useSide: 'winning' | 'losing') => Promise<void>;
  onDismissSyncConflict: (conflictId: string) => Promise<void>;
  onBuildLocalDeltaJson: () => { filename: string; content: string };
}

interface ActiveDragState {
  task: BarnTask;
  mode: 'move' | 'resize-start';
  startClientX: number;
  trackWidthPx: number;
  deltaDays: number;
}

export function BarnSchedulerGantt({
  speciesProfile,
  animals,
  tasks,
  breedings,
  settings,
  deviceId,
  syncOperations,
  syncConflicts,
  backupSyncStatus,
  masterBackupJson,
  onToggleTask,
  onRescheduleTask,
  onApplySmartEscalations,
  onDeleteTask,
  onOpenAnimal,
  onReconcileOutboxOps,
  onResolveSyncConflict,
  onDismissSyncConflict,
  onBuildLocalDeltaJson,
}: BarnSchedulerGanttProps) {
  const baseId = useId();
  const today = todayDateIso();

  const [windowStartIso, setWindowStartIso] = useState<string>(() => addDaysIso(today, -3));
  const [windowDays, setWindowDays] = useState<GanttWindowDays>(21);
  const [grouping, setGrouping] = useState<GanttGroupingMode>('breeding_or_animal');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [escalatingBusy, setEscalatingBusy] = useState(false);
  const [rescheduleBusyId, setRescheduleBusyId] = useState<string | null>(null);

  // Drag-and-drop state
  const [dragState, setDragState] = useState<ActiveDragState | null>(null);
  const dragStateRef = useRef<ActiveDragState | null>(null);
  const timelineGridRef = useRef<HTMLDivElement | null>(null);

  // P2P / LAN Outbox Reconciliation drawer state
  const [showP2pDrawer, setShowP2pDrawer] = useState(false);
  const [p2pState, setP2pState] = useState<LanP2pSessionState>('idle');
  const [p2pStatusText, setP2pStatusText] = useState<string>('');
  const [p2pError, setP2pError] = useState<string | null>(null);
  const [localOfferToken, setLocalOfferToken] = useState('');
  const [remoteAnswerInput, setRemoteAnswerInput] = useState('');
  const [remoteOfferInput, setRemoteOfferInput] = useState('');
  const [localAnswerToken, setLocalAnswerToken] = useState('');
  const [manualDeltaInput, setManualDeltaInput] = useState('');
  const [p2pBusy, setP2pBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState<P2pReconciliationSummary | null>(null);
  const [lastPeerAck, setLastPeerAck] = useState<
    Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }> | null
  >(null);

  const sessionRef = useRef<LanP2pSessionController | null>(null);
  const onReconcileRef = useRef(onReconcileOutboxOps);
  onReconcileRef.current = onReconcileOutboxOps;
  const onRescheduleRef = useRef(onRescheduleTask);
  onRescheduleRef.current = onRescheduleTask;

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  const timeline = useMemo(
    () =>
      buildBarnGanttTimeline({
        tasks,
        breedings,
        speciesProfile,
        windowStartIso,
        windowDays,
        grouping,
        includeCompleted,
        todayIso: today,
      }),
    [tasks, breedings, speciesProfile, windowStartIso, windowDays, grouping, includeCompleted, today]
  );

  const taskTitleContext = useMemo(
    () => ({
      animals,
      breedings,
      speciesProfiles: [speciesProfile],
    }),
    [animals, breedings, speciesProfile]
  );

  const escalatedBars = useMemo(() => {
    const out: BarnGanttBarItem[] = [];
    for (const lane of timeline.lanes) {
      for (const bar of lane.bars) {
        if (bar.escalation.isEscalated) {
          out.push(bar);
        }
      }
    }
    return out.sort((a, b) => b.escalation.urgencyScore - a.escalation.urgencyScore);
  }, [timeline.lanes]);

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [selectedTaskId, tasks]
  );

  const unresolvedConflicts = useMemo(
    () =>
      syncConflicts
        .filter((c) => !c.resolved)
        .sort((a, b) => {
          if (a.entity_type === 'task' && b.entity_type !== 'task') return -1;
          if (b.entity_type === 'task' && a.entity_type !== 'task') return 1;
          return b.detected_at.localeCompare(a.detected_at);
        }),
    [syncConflicts]
  );

  // Global pointer listeners while actively dragging a Gantt bar
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (ev: PointerEvent) => {
      const active = dragStateRef.current;
      if (!active) return;
      const colWidth = Math.max(16, active.trackWidthPx / windowDays);
      const nextDelta = Math.round((ev.clientX - active.startClientX) / colWidth);
      if (nextDelta !== active.deltaDays) {
        const updated = { ...active, deltaDays: nextDelta };
        dragStateRef.current = updated;
        setDragState(updated);
      }
    };

    const commitDrag = async () => {
      const active = dragStateRef.current;
      dragStateRef.current = null;
      setDragState(null);
      if (!active || active.deltaDays === 0) return;

      const ts = new Date().toISOString();
      const updated =
        active.mode === 'move'
          ? shiftTaskDatesByDays(active.task, active.deltaDays, ts)
          : resizeTaskStartDateByDays(active.task, active.deltaDays, ts);
      if (!updated) return;

      setRescheduleBusyId(active.task.id);
      try {
        await onRescheduleRef.current(active.task, {
          startDateIso: updated.startDateIso ?? '',
          dueDateIso: updated.dueDateIso,
        });
      } finally {
        setRescheduleBusyId(null);
      }
    };

    const handlePointerCancel = () => {
      dragStateRef.current = null;
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', commitDrag);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', commitDrag);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [dragState !== null, windowDays]);

  const startBarDrag = (
    e: React.PointerEvent<HTMLElement>,
    task: BarnTask,
    mode: 'move' | 'resize-start'
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    const trackWidthPx = timelineGridRef.current?.clientWidth || 560;
    const next: ActiveDragState = {
      task,
      mode,
      startClientX: e.clientX,
      trackWidthPx,
      deltaDays: 0,
    };
    dragStateRef.current = next;
    setDragState(next);
    setSelectedTaskId(task.id);
  };

  const handleNudgeTaskDays = async (
    task: BarnTask,
    deltaDays: number,
    mode: 'move' | 'resize-start'
  ) => {
    const ts = new Date().toISOString();
    const updated =
      mode === 'move'
        ? shiftTaskDatesByDays(task, deltaDays, ts)
        : resizeTaskStartDateByDays(task, deltaDays, ts);
    if (!updated) return;
    setRescheduleBusyId(task.id);
    try {
      await onRescheduleTask(task, {
        startDateIso: updated.startDateIso ?? '',
        dueDateIso: updated.dueDateIso,
      });
    } finally {
      setRescheduleBusyId(null);
    }
  };

  const handleApplyEscalationsClick = async () => {
    setEscalatingBusy(true);
    try {
      await onApplySmartEscalations(tasks);
    } finally {
      setEscalatingBusy(false);
    }
  };

  const ensureLanSession = useCallback((): LanP2pSessionController => {
    if (sessionRef.current && sessionRef.current.getState() !== 'closed') {
      return sessionRef.current;
    }
    const ctrl = createLanP2pSession({
      deviceId,
      onDeltaOperations: (ops, senderDeviceId) => {
        void onReconcileRef
          .current(ops, senderDeviceId)
          .then((summary) => {
            setLastSummary(summary);
            setP2pError(null);
            setP2pStatusText(
              `Reconciled ${summary.appliedOpCount} op(s) from ${summary.peerDeviceId} (${summary.taskOpsReceivedCount} task op(s)).`
            );
            try {
              ctrl.sendWireMessage(
                createP2pAckWireMessage({
                  senderDeviceId: deviceId,
                  receivedCount: summary.receivedOpsCount,
                  appliedCount: summary.appliedOpCount,
                  taskOpsCount: summary.taskOpsReceivedCount,
                  conflictCount: summary.newConflictCount,
                })
              );
            } catch {
              // Ignore ack error if channel closed concurrently
            }
          })
          .catch((err) => {
            setP2pError(err instanceof Error ? err.message : 'Outbox reconciliation failed.');
          });
      },
      onAckReceived: (ack) => {
        setLastPeerAck(ack);
        setP2pStatusText(
          `Peer ${ack.senderDeviceId} confirmed: ${ack.appliedCount} of ${ack.receivedCount} op(s) merged (${ack.conflictCount} conflict(s)).`
        );
      },
      onStateChange: (nextState, detail) => {
        setP2pState(nextState);
        if (detail) setP2pStatusText(detail);
      },
      onError: (msg) => {
        setP2pError(msg);
      },
    });
    sessionRef.current = ctrl;
    return ctrl;
  }, [deviceId]);

  const handleCreateOffer = async () => {
    setP2pBusy(true);
    setP2pError(null);
    try {
      sessionRef.current?.close();
      sessionRef.current = null;
      const sess = ensureLanSession();
      const token = await sess.createOfferToken();
      setLocalOfferToken(token);
      setLocalAnswerToken('');
      setP2pStatusText('Offer code generated. Share it with your second device on this LAN.');
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Unable to create LAN offer.');
    } finally {
      setP2pBusy(false);
    }
  };

  const handleAcceptOffer = async () => {
    setP2pBusy(true);
    setP2pError(null);
    try {
      sessionRef.current?.close();
      sessionRef.current = null;
      const sess = ensureLanSession();
      const answerToken = await sess.acceptOfferAndCreateAnswerToken(remoteOfferInput);
      setLocalAnswerToken(answerToken);
      setP2pStatusText('Answer code ready. Send it back to the host device to open the link.');
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Invalid peer Offer code.');
    } finally {
      setP2pBusy(false);
    }
  };

  const handleCompleteHandshake = async () => {
    if (!sessionRef.current) {
      setP2pError('Generate an Offer code first.');
      return;
    }
    setP2pBusy(true);
    setP2pError(null);
    try {
      await sessionRef.current.completeHandshakeWithAnswer(remoteAnswerInput);
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Invalid peer Answer code.');
    } finally {
      setP2pBusy(false);
    }
  };

  const handleSendOutboxOverP2p = () => {
    if (!sessionRef.current || p2pState !== 'connected') {
      setP2pError('Complete the LAN P2P pairing first.');
      return;
    }
    setP2pError(null);
    try {
      const msg = createP2pDeltaWireMessage({
        senderDeviceId: deviceId,
        operations: syncOperations,
        includePeerRelays: true,
      });
      sessionRef.current.sendWireMessage(msg);
      setP2pStatusText(
        `Sent ${msg.kind === 'pedigree-p2p-delta-v1' ? msg.operations.length : 0} outbox op(s) to connected peer.`
      );
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Failed to send outbox over WebRTC.');
    }
  };

  const handleFolderSyncClick = async () => {
    setP2pBusy(true);
    setP2pError(null);
    try {
      const deltaPayload = onBuildLocalDeltaJson();
      const folderRes = await reconcileWithPickedSyncFolder({
        deviceId,
        localOperations: syncOperations,
        masterBackupJson: masterBackupJson || deltaPayload.content,
      });
      const summary = await onReconcileOutboxOps(
        folderRes.incomingOps,
        `folder:${folderRes.folderName}`
      );
      setLastSummary(summary);
      setP2pStatusText(
        `Folder "${folderRes.folderName}": read ${folderRes.peerFilesRead} peer file(s), merged ${summary.appliedOpCount} op(s).`
      );
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Shared folder sync failed.');
    } finally {
      setP2pBusy(false);
    }
  };

  const handleManualReconcileClick = async () => {
    setP2pError(null);
    if (!manualDeltaInput.trim()) return;
    setP2pBusy(true);
    try {
      const parsed = parseP2pWireOrDeltaPayload(manualDeltaInput);
      const summary = await onReconcileOutboxOps(parsed.operations, parsed.senderDeviceId);
      setLastSummary(summary);
      setManualDeltaInput('');
      setP2pStatusText(
        `Manual delta merged: ${summary.appliedOpCount} of ${summary.receivedOpsCount} op(s) applied.`
      );
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Could not parse delta JSON payload.');
    } finally {
      setP2pBusy(false);
    }
  };

  const getBarToneClasses = (bar: BarnGanttBarItem): string => {
    if (bar.task.completed) {
      return 'bg-[var(--barn-subtle)] border-[var(--barn-border)] text-[var(--barn-muted)] line-through';
    }
    if (bar.escalation.isOverdue || bar.escalation.isCriticalTimeWindow) {
      return 'bg-[var(--barn-danger)] text-[var(--barn-on-danger)] border-transparent';
    }
    if (bar.escalation.effectivePriority === 'High') {
      return 'bg-[var(--barn-terracotta)] text-[var(--barn-on-terracotta)] border-transparent';
    }
    return 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent';
  };

  return (
    <div className="space-y-4">
      {/* Smart Priority Escalation Banner */}
      {(timeline.summary.escalatedCount > 0 || timeline.summary.criticalNestboxOrBirthCount > 0) && (
        <div
          role="status"
          className="rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs"
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertTriangle
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-0.5">
              <div className="font-semibold text-[var(--barn-ink)]">
                Smart Priority Escalation:{' '}
                <span className="font-mono tabular-nums">
                  {timeline.summary.escalatedCount}
                </span>{' '}
                chore{timeline.summary.escalatedCount === 1 ? '' : 's'} queued for priority boost
                {timeline.summary.criticalNestboxOrBirthCount > 0 && (
                  <span className="text-[var(--barn-danger)]">
                    {' '}
                    ({timeline.summary.criticalNestboxOrBirthCount} critical nestbox /{' '}
                    {speciesProfile.birthEventLabel.toLowerCase()})
                  </span>
                )}
              </div>
              {escalatedBars.length > 0 && (
                <div className="text-[11px] text-[var(--barn-muted)] truncate">
                  {escalatedBars
                    .slice(0, 3)
                    .map(
                      (b) =>
                        `${formatSystemTaskTitle(b.task, settings.calendarSync, taskTitleContext)} (${b.escalation.reason})`
                    )
                    .join(' · ')}
                </div>
              )}
            </div>
          </div>

          {timeline.summary.escalatedCount > 0 && (
            <button
              type="button"
              disabled={escalatingBusy}
              onClick={() => void handleApplyEscalationsClick()}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-60"
            >
              {escalatingBusy
                ? 'Escalating...'
                : `Apply ${timeline.summary.escalatedCount} Smart Escalation${
                    timeline.summary.escalatedCount === 1 ? '' : 's'
                  }`}
            </button>
          )}
        </div>
      )}

      {/* Scheduler Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5">
            <button
              type="button"
              onClick={() => setWindowStartIso((prev) => addDaysIso(prev, -7))}
              aria-label="Shift Gantt timeline back 7 days"
              className="min-h-[30px] min-w-[30px] rounded-md hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setWindowStartIso(addDaysIso(today, -3))}
              className="min-h-[30px] px-2.5 rounded-md hover:bg-[var(--barn-subtle)] font-medium whitespace-nowrap"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setWindowStartIso((prev) => addDaysIso(prev, 7))}
              aria-label="Shift Gantt timeline forward 7 days"
              className="min-h-[30px] min-w-[30px] rounded-md hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="inline-flex items-center rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5">
            {([14, 21, 30] as const).map((daysOpt) => (
              <button
                key={daysOpt}
                type="button"
                aria-pressed={windowDays === daysOpt}
                onClick={() => setWindowDays(daysOpt)}
                className={`min-h-[30px] px-2 py-0.5 rounded-md font-mono text-[11px] font-medium transition-colors whitespace-nowrap ${
                  windowDays === daysOpt
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : 'text-[var(--barn-muted)]'
                }`}
              >
                {daysOpt}d
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setGrouping((prev) =>
                prev === 'breeding_or_animal' ? 'category' : 'breeding_or_animal'
              )
            }
            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Group: {grouping === 'breeding_or_animal' ? 'Breeding / Animal' : 'Category'}
          </button>

          <label className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-[var(--barn-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
              className="accent-[var(--barn-sage)]"
            />
            Show Done
          </label>
        </div>

        <button
          type="button"
          aria-expanded={showP2pDrawer}
          onClick={() => setShowP2pDrawer((v) => !v)}
          className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            p2pState === 'connected'
              ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
              : unresolvedConflicts.length > 0
              ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
              : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[var(--barn-ink)]'
          }`}
        >
          <Wifi className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
          LAN P2P Outbox
          {unresolvedConflicts.length > 0 && (
            <span className="font-mono text-[11px] text-[var(--barn-danger)] font-semibold">
              ({unresolvedConflicts.length} conflict{unresolvedConflicts.length === 1 ? '' : 's'})
            </span>
          )}
        </button>
      </div>

      {/* Collapsible P2P / LAN Outbox Reconciliation Drawer */}
      {showP2pDrawer && (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-4 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                Local P2P / LAN Outbox Reconciliation (Zero Server)
              </h3>
              <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                Device ID: <span className="font-mono text-[var(--barn-ink)]">{deviceId}</span> ·{' '}
                Outbox ops: <span className="font-mono">{syncOperations.length}</span> · Link:{' '}
                <span className="font-mono font-semibold text-[var(--barn-ink)]">{p2pState}</span>
              </p>
            </div>
            {p2pState === 'connected' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendOutboxOverP2p}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  Push Outbox to Peer
                </button>
                <button
                  type="button"
                  onClick={() => sessionRef.current?.close()}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {p2pStatusText && (
            <div className="px-3 py-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] text-[var(--barn-ink)]">
              {p2pStatusText}
            </div>
          )}
          {p2pError && (
            <div
              role="alert"
              className="px-3 py-2 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] text-[11px] text-[var(--barn-danger)] font-medium"
            >
              {p2pError}
            </div>
          )}

          {lastSummary && (
            <div className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
              Last Reconcile ({lastSummary.peerDeviceId}): {lastSummary.appliedOpCount} applied of{' '}
              {lastSummary.receivedOpsCount} ops ({lastSummary.taskOpsReceivedCount} task ops) ·{' '}
              {lastSummary.newConflictCount} new conflict(s)
            </div>
          )}
          {lastPeerAck && (
            <div className="font-mono text-[11px] text-[var(--barn-sage)] tabular-nums">
              Ack from {lastPeerAck.senderDeviceId}: merged {lastPeerAck.appliedCount}/
              {lastPeerAck.receivedCount} ops ({lastPeerAck.taskOpsCount} task ops)
            </div>
          )}

          {/* Direct WebRTC Pairing (Host / Join) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
              <div className="font-semibold text-[var(--barn-ink)]">
                1. Host Device (Same Wi-Fi / LAN)
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={p2pBusy || !supportsLanWebRtcP2p()}
                  onClick={() => void handleCreateOffer()}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-[11px] font-semibold disabled:opacity-50"
                >
                  Generate LAN Offer Code
                </button>
                {localOfferToken && (
                  <button
                    type="button"
                    onClick={() => void copyTextWithFallback(localOfferToken)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] inline-flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    Copy Offer
                  </button>
                )}
              </div>
              {localOfferToken && (
                <textarea
                  readOnly
                  aria-label="Local LAN Offer Code"
                  rows={2}
                  value={localOfferToken}
                  className="w-full p-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[10px]"
                />
              )}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="Paste peer Answer code"
                  placeholder="Paste peer CP-LAN1 Answer code..."
                  value={remoteAnswerInput}
                  onChange={(e) => setRemoteAnswerInput(e.target.value)}
                  className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[11px]"
                />
                <button
                  type="button"
                  disabled={p2pBusy || !remoteAnswerInput.trim()}
                  onClick={() => void handleCompleteHandshake()}
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] font-semibold text-[11px] disabled:opacity-50"
                >
                  Connect
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
              <div className="font-semibold text-[var(--barn-ink)]">
                2. Joining Peer Device
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="Paste host Offer code"
                  placeholder="Paste host CP-LAN1 Offer code..."
                  value={remoteOfferInput}
                  onChange={(e) => setRemoteOfferInput(e.target.value)}
                  className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[11px]"
                />
                <button
                  type="button"
                  disabled={p2pBusy || !remoteOfferInput.trim() || !supportsLanWebRtcP2p()}
                  onClick={() => void handleAcceptOffer()}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold text-[11px] disabled:opacity-50"
                >
                  Create Answer
                </button>
              </div>
              {localAnswerToken && (
                <div className="space-y-1.5">
                  <textarea
                    readOnly
                    aria-label="Generated LAN Answer Code"
                    rows={2}
                    value={localAnswerToken}
                    className="w-full p-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[10px]"
                  />
                  <button
                    type="button"
                    onClick={() => void copyTextWithFallback(localAnswerToken)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] inline-flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    Copy Answer Back to Host
                  </button>
                </div>
              )}
              {!supportsLanWebRtcP2p() && (
                <p className="text-[11px] text-[var(--barn-muted)]">
                  WebRTC is unavailable in this browser; use Folder Sync or Manual Delta JSON below.
                </p>
              )}
            </div>
          </div>

          {/* Shared LAN Folder & Manual Delta Fallback */}
          <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--barn-ink)]">
                Shared Folder / Manual Delta Reconciliation
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={p2pBusy}
                  onClick={() => void handleFolderSyncClick()}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 text-[11px] font-medium"
                >
                  <FolderSync className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  {backupSyncStatus?.configured
                    ? `Sync Folder (${backupSyncStatus.folderName})`
                    : 'Pick Shared LAN / SyncThing Folder'}
                </button>
                <button
                  type="button"
                  onClick={() => void copyTextWithFallback(onBuildLocalDeltaJson().content)}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 text-[11px]"
                >
                  <Copy className="w-3 h-3" aria-hidden="true" />
                  Copy My Delta JSON
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Paste peer delta JSON"
                placeholder="Paste peer delta_*.json or wire JSON to reconcile offline..."
                value={manualDeltaInput}
                onChange={(e) => setManualDeltaInput(e.target.value)}
                className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[11px]"
              />
              <button
                type="button"
                disabled={p2pBusy || !manualDeltaInput.trim()}
                onClick={() => void handleManualReconcileClick()}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-[11px] font-semibold disabled:opacity-50 inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                Merge
              </button>
            </div>
          </div>

          {/* Unresolved Field Collisions */}
          {unresolvedConflicts.length > 0 && (
            <div className="space-y-2">
              <div className="font-semibold text-[var(--barn-terracotta)]">
                Unresolved Outbox Collisions ({unresolvedConflicts.length})
              </div>
              <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-surface)]">
                {unresolvedConflicts.slice(0, 6).map((c) => (
                  <div
                    key={c.conflict_id}
                    className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold text-[var(--barn-ink)] truncate">
                        [{c.entity_type}] {c.entity_label} · field{' '}
                        <span className="font-mono">{c.field_name}</span>
                      </div>
                      <div className="text-[var(--barn-muted)] font-mono truncate">
                        Applied ({c.winning_device_id}): {JSON.stringify(c.winning_value)} · Other (
                        {c.losing_device_id}): {JSON.stringify(c.losing_value)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onResolveSyncConflict(c.conflict_id, 'winning')}
                        className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
                      >
                        Keep Applied
                      </button>
                      <button
                        type="button"
                        onClick={() => void onResolveSyncConflict(c.conflict_id, 'losing')}
                        className="min-h-[28px] px-2 py-0.5 rounded-md bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] font-semibold"
                      >
                        Use Other
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDismissSyncConflict(c.conflict_id)}
                        aria-label={`Dismiss conflict ${c.conflict_id}`}
                        className="min-h-[28px] px-1.5 rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Gantt Chart Grid */}
      {timeline.lanes.length === 0 ? (
        <div className="p-6 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-center text-xs text-[var(--barn-muted)]">
          No scheduled {speciesProfile.name.toLowerCase()} chores match the active filter.
        </div>
      ) : (
        <div className="border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Header Row */}
            <div className="flex border-b border-[var(--barn-border)] bg-[var(--barn-subtle)]">
              <div className="w-44 shrink-0 px-3 py-2 text-[11px] font-semibold text-[var(--barn-muted)] border-r border-[var(--barn-border)]">
                Lane / Target
              </div>
              <div
                ref={timelineGridRef}
                className="flex-1 grid"
                style={{ gridTemplateColumns: `repeat(${windowDays}, minmax(0, 1fr))` }}
              >
                {timeline.days.map((day) => (
                  <div
                    key={day.dateIso}
                    title={day.dateIso}
                    className={`py-1.5 text-center border-r last:border-r-0 border-[var(--barn-border)]/50 ${
                      day.isToday
                        ? 'bg-[var(--barn-sage-tint)] font-bold text-[var(--barn-ink)]'
                        : day.isWeekend
                        ? 'bg-[var(--barn-subtle)]/70 text-[var(--barn-muted)]'
                        : 'text-[var(--barn-muted)]'
                    }`}
                  >
                    <div className="text-[9px] uppercase tracking-wider">{day.weekdayShort}</div>
                    <div className="font-mono text-[11px] tabular-nums">{day.dayOfMonth}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lane Rows */}
            <div className="divide-y divide-[var(--barn-border)]">
              {timeline.lanes.map((lane) => {
                const barsToShow = lane.bars.filter((b) => b.isInWindow);
                return (
                  <div key={lane.laneId} className="flex items-stretch">
                    <div className="w-44 shrink-0 px-3 py-2.5 border-r border-[var(--barn-border)] flex flex-col justify-center min-w-0">
                      <div className="text-xs font-semibold text-[var(--barn-ink)] truncate">
                        {lane.label}
                      </div>
                      <div className="text-[10px] text-[var(--barn-muted)] truncate">
                        {lane.subtitle}
                      </div>
                      {lane.linkedAnimalId && (
                        <button
                          type="button"
                          onClick={() => onOpenAnimal(lane.linkedAnimalId!)}
                          className="text-[10px] text-[var(--barn-sage)] underline text-left mt-0.5 truncate"
                        >
                          Open animal
                        </button>
                      )}
                    </div>

                    <div className="flex-1 py-2 px-0.5 space-y-1.5 relative">
                      {/* Background Day Columns */}
                      <div
                        className="absolute inset-0 grid pointer-events-none"
                        style={{ gridTemplateColumns: `repeat(${windowDays}, minmax(0, 1fr))` }}
                      >
                        {timeline.days.map((day) => (
                          <div
                            key={day.dateIso}
                            className={`border-r last:border-r-0 border-[var(--barn-border)]/35 ${
                              day.isToday
                                ? 'bg-[var(--barn-sage-tint)]/45'
                                : day.isWeekend
                                ? 'bg-[var(--barn-subtle)]/30'
                                : ''
                            }`}
                          />
                        ))}
                      </div>

                      {barsToShow.length === 0 ? (
                        <div className="relative z-10 px-2 py-1 text-[11px] text-[var(--barn-muted)] font-mono">
                          {lane.bars.length} chore{lane.bars.length === 1 ? '' : 's'} outside current{' '}
                          {windowDays}d window ({lane.bars[0]?.effectiveDueIso})
                        </div>
                      ) : (
                        barsToShow.map((bar) => {
                          const isDraggingThis = dragState?.task.id === bar.task.id;
                          const deltaDays = isDraggingThis ? dragState.deltaDays : 0;
                          const rawStart =
                            isDraggingThis && dragState.mode === 'move'
                              ? bar.startColIndex + deltaDays
                              : isDraggingThis && dragState.mode === 'resize-start'
                              ? Math.min(
                                  bar.startColIndex + bar.spanCols - 1,
                                  bar.startColIndex + deltaDays
                                )
                              : bar.startColIndex;
                          const displayStart = Math.max(0, Math.min(windowDays - 1, rawStart));
                          const rawSpan =
                            isDraggingThis && dragState.mode === 'resize-start'
                              ? Math.max(1, bar.spanCols - deltaDays)
                              : bar.spanCols;
                          const displaySpan = Math.max(
                            1,
                            Math.min(windowDays - displayStart, rawSpan)
                          );

                          const leftPct = (displayStart / windowDays) * 100;
                          const widthPct = (displaySpan / windowDays) * 100;
                          const tailWidthPct =
                            !isDraggingThis && bar.overdueTailCols > 0
                              ? Math.min(
                                  ((windowDays - (displayStart + displaySpan)) / windowDays) * 100,
                                  (bar.overdueTailCols / windowDays) * 100
                                )
                              : 0;

                          const title = formatSystemTaskTitle(
                            bar.task,
                            settings.calendarSync,
                            taskTitleContext
                          );
                          const isSelected = selectedTaskId === bar.task.id;

                          return (
                            <div
                              key={bar.task.id}
                              className="relative h-8 flex items-center"
                            >
                              {tailWidthPct > 0 && (
                                <div
                                  aria-hidden="true"
                                  style={{
                                    left: `${leftPct + widthPct}%`,
                                    width: `${tailWidthPct}%`,
                                  }}
                                  className="absolute h-3 bg-[var(--barn-danger)]/35 border-y border-r border-dashed border-[var(--barn-danger)] rounded-r-md pointer-events-none"
                                />
                              )}

                              <div
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelected}
                                aria-label={`${title} (${bar.effectiveStartIso} to ${bar.effectiveDueIso}${
                                  bar.escalation.isEscalated ? `, Escalated: ${bar.escalation.reason}` : ''
                                })`}
                                onClick={() => setSelectedTaskId(bar.task.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedTaskId(bar.task.id);
                                  } else if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    void handleNudgeTaskDays(bar.task, -1, 'move');
                                  } else if (e.key === 'ArrowRight') {
                                    e.preventDefault();
                                    void handleNudgeTaskDays(bar.task, 1, 'move');
                                  }
                                }}
                                onPointerDown={(e) => startBarDrag(e, bar.task, 'move')}
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                  touchAction: 'none',
                                }}
                                className={`absolute z-10 h-7 rounded-lg border px-1.5 flex items-center gap-1 select-none cursor-grab active:cursor-grabbing text-[11px] font-medium shadow-xs transition-shadow ${getBarToneClasses(
                                  bar
                                )} ${
                                  isSelected ? 'ring-2 ring-[var(--barn-ink)] ring-offset-1' : ''
                                } ${rescheduleBusyId === bar.task.id ? 'opacity-60' : ''}`}
                              >
                                <span
                                  role="separator"
                                  aria-label={`Resize start date for ${title}`}
                                  onPointerDown={(e) => startBarDrag(e, bar.task, 'resize-start')}
                                  className="w-2 h-5 -ml-1 rounded-sm cursor-ew-resize hover:bg-black/20 shrink-0"
                                  title="Drag left edge to adjust start date span"
                                />
                                <span className="truncate flex-1">{title}</span>
                                {bar.escalation.isEscalated && (
                                  <span className="font-mono text-[9px] font-bold uppercase shrink-0">
                                    !
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Selected Task Keyboard/Touch Inspector & Quick Actions */}
      {selectedTask && (
        <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="min-w-0 space-y-0.5">
            <div className="font-semibold text-[var(--barn-ink)] truncate">
              {formatSystemTaskTitle(selectedTask, settings.calendarSync, taskTitleContext)}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              {selectedTask.startDateIso
                ? `${formatReadableDate(selectedTask.startDateIso)} → ${formatReadableDate(selectedTask.dueDateIso)}`
                : `Due ${formatReadableDate(selectedTask.dueDateIso)}`}{' '}
              · {selectedTask.category} · {selectedTask.priority} priority
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={rescheduleBusyId === selectedTask.id}
              onClick={() => void handleNudgeTaskDays(selectedTask, -1, 'resize-start')}
              title="Extend span 1 day earlier"
              className="min-h-[32px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-mono text-[11px]"
            >
              Start -1d
            </button>
            <button
              type="button"
              disabled={rescheduleBusyId === selectedTask.id}
              onClick={() => void handleNudgeTaskDays(selectedTask, -1, 'move')}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-mono text-[11px]"
            >
              Move -1d
            </button>
            <button
              type="button"
              disabled={rescheduleBusyId === selectedTask.id}
              onClick={() => void handleNudgeTaskDays(selectedTask, 1, 'move')}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-mono text-[11px]"
            >
              Move +1d
            </button>
            <button
              type="button"
              onClick={() => void onToggleTask(selectedTask)}
              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold inline-flex items-center gap-1 text-[11px]"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              {selectedTask.completed ? 'Reopen' : 'Done'}
            </button>
            <button
              type="button"
              onClick={() => {
                onDeleteTask(selectedTask.id);
                setSelectedTaskId(null);
              }}
              aria-label={`Delete chore ${selectedTask.title}`}
              className="min-h-[32px] min-w-[32px] rounded-lg border border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] flex items-center justify-center"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Unscheduled Tasks Strip */}
      {timeline.unscheduledTasks.length > 0 && (
        <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
          <div className="font-semibold text-[var(--barn-muted)] flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            Unscheduled Chores ({timeline.unscheduledTasks.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {timeline.unscheduledTasks.map(({ task }) => (
              <div
                key={task.id}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center gap-2"
              >
                <span className="truncate max-w-[200px]">
                  {formatSystemTaskTitle(task, settings.calendarSync, taskTitleContext)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void onRescheduleTask(task, { startDateIso: '', dueDateIso: today })
                  }
                  className="text-[11px] font-semibold text-[var(--barn-sage)] underline whitespace-nowrap"
                >
                  Schedule Today
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

<!-- END OF PART 02 OF 16 (27 files) -->

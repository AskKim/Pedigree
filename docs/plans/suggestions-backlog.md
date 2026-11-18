# Community Pedigree — Saved Suggestions Backlog

> **NOTE TO FUTURE SELF / CODING ASSISTANT:**
> Whenever any suggestion on this list is implemented and verified, **remove that completed item from this file** (and update the "Remaining" count/numbering cleanly) so this document always reflects only unimplemented suggestions.

---

## Current App Suggestions & Remediation List (36 Remaining — Ordered by Criticality & Severity)

### Priority 1: Critical Security, Data-Loss & Offline Compatibility Fixes
*Immediate security, storage-retention, multi-tab integrity, and compatibility safeguards identified in codebase audit.*

1. **[High / Sync & Reset Integrity — NEEDS FURTHER RESEARCH / DEFERRED] Align Sync Outbox Mutations & Reset Cleanup (`src/hooks/useBarnStore.ts`)**
   - *(Bypassed for now pending further research unless it blocks another Priority 1 item.)*
   - Investigate wiping `sync_outbox` / `sync_conflicts` and `pedigree.lastBackupMeta.v1` / `pedigree.backupReminderSnoozedUntil.v1` during factory resets/full `replace` restores, and evaluate photo delta payload sizes vs metadata-only sync for `addOptimizedAnimalPhotos` and `migrateAnimalsSpecies`.

2. **[High / Compatibility] Replace or Polyfill `Blob.prototype.arrayBuffer()` for 2018+ Browsers (`src/utils/es2018Shims.ts` & File Readers)**
   - Guarantee at least 2018 browser compatibility (Chrome 68+, Safari 12+, Firefox 63+, Edge 79+, and older where feasible) by adding a `FileReader`-backed `readBlobAsArrayBuffer` helper + non-enumerable `Blob.prototype.arrayBuffer` shim across `webImageOptimizer.ts:177`, `SettingsAndSyncScreen.tsx:807,951`, `WipedStorageRecoveryModal.tsx:115,123`, `ExternalImporterPanel.tsx:282`, and `opfsStorage.ts:326`, plus auditing other post-2018 APIs.

3. **[High / Deployment & CI] Fix GitHub Pages Subpath Build While Keeping Bun Toolchain (`vite.config.ts`, `.github/workflows/`)**
   - Keep `.github/workflows/deploy-pages.yml` strictly on **Bun** (with an explicit code comment explaining GitHub Pages requires Bun so automated edits never replace it with npm).
   - Pass `--base=${{ steps.pages.outputs.base_path }}` via CLI and make `VitePWA` manifest/icon URLs relative (`'./'`) while keeping `const basePath = '/'` in `vite.config.ts` so both GitHub Pages subpath builds and `IMP-008` invariants pass together.

---

### Priority 2: High-Impact Livestock Safety, Temporal Integrity & Core Barn Workflows
*High-impact animal safety warnings, clock-skew protection, rapid-tap locks, and daily cage-side productivity.*

4. **[High / Safety] Active Medication Withdrawal Countdown & Safety Alerts (`withdrawalClearDateIso`)**
   - Surface active care-log withdrawal period badges on Herd cards and Home alerts—and trigger a soft confirmation warning before marking an animal under active withdrawal for sale, meat/processing, or exhibition.

5. **[Medium-High / Temporal & Export Safety] Enforce Clock-Skew Adjustment Consistently & Guard Archive Exports Against Double-Tap (`SettingsAndSyncScreen.tsx`, `pwaUpdateManager.ts`, `SpeciesEditorModal.tsx`, `taskMaster.ts`, Importers)**
   - Forward HTTP `Date` headers from `fetchJsonNoStore('./version.json' / './status.json')` in `src/storage/pwaUpdateManager.ts` to `recordServerDateHeaderSkew()` (and use `getAdjustedNowIsoUtc()` for `lastCheckedAtIso`) so clock-skew detection runs on upgrade-gate checks as well as connectivity probes.
   - Replace remaining unadjusted `Date.now()` / `nowIsoUtc()` writes (`SettingsAndSyncScreen.tsx:1194`, `SpeciesEditorModal.tsx:214`, `herdBossImporter.ts`, `universalPedigreeImporter.ts`, `conflictResolver.ts`, `taskMaster.ts`, `models.ts`, `syncOutbox.ts`, `webSqliteAdapter.ts`) with `getAdjustedNowMs()` / `getAdjustedNowIsoUtc()` when clock-skew compensation is active.
   - Guard `handleDownloadCompleteZip`, `handleDownloadPhotosOnlyZip`, `handleDownloadTimestampedFullBackup`, and `handleDownloadDatabaseOnlyBackup` in `SettingsAndSyncScreen.tsx` with `useAsyncSubmitLock` to eliminate the `<16ms` pre-render double-tap window.

6. **[Medium-High / Active RAM & UI Performance] Enforce True Lazy 2–3 Gen IndexedDB Pedigree Fetching & Virtualize Large Breeding/Herd Lists (`PedigreeScreen.tsx`, `BreedingScreen.tsx`, `HerdScreen.tsx`)**
   - While `buildPedigreeBranchViewport` caps initial rendered pedigree DOM nodes at Gen 0–3, active React state still holds all herd `animals` in memory upfront; load active animal + 2–3 immediate generations cleanly and lazily query Gen 4+ ancestors directly from SQLite/IndexedDB on branch expansion.
   - Add pagination/virtualization to the `BreedingScreen.tsx:1079` breeding & litter history ledger (currently renders `breedings.map(...)` unbounded) and adopt true DOM windowing/virtualization for very large `HerdScreen`, `BreedingScreen`, and `ReportsScreen` lists.

7. **[High / Welfare] Cage / Pen Capacity Warnings & Quick Occupant Assignment**
   - Compare current animal occupants against `CageLocation.capacity` (e.g., `3/2 over capacity`), allow one-click occupant assignment from the housing card, and warn before exceeding capacity.

8. **[High / Daily Workflow] Breeding Lab & Master Task List Refinements (`taskMaster.ts`)**
   - **Recalculate Post-Birth Tasks on Actual Birth:** When a breeding is logged as `Bred`, `AFTER_BIRTH` tasks (weaning, rebreed readiness) are scheduled from `expectedDueDateIso`. If the birth happens a couple of days early or late and `actualBirthDateIso` is entered later, offering a one-tap option to shift uncompleted post-birth tasks to the actual birth date prevents stale weaning/rebreed reminders.
   - **One-Click Breeding Outcome Checkoffs & Conditional Chain Cleanup:** Allow checking off a Palpation or Birth task in the task list to directly log `Palpated Positive` / `Missed` (Open) or live/stillborn offspring counts onto the linked breeding record—and automatically clear pending nestbox/birth tasks when a breeding is marked `Missed`/Open.
   - **Per-Breed Milestone Offset Overrides:** Allow optional day-offset overrides by breed (e.g., dwarf vs. giant rabbit lines) on top of the species-level defaults.

9. **[High / Onboarding] Interactive CSV Column Mapper, Starter Template & Unlinked Parent Preview**
   - Add a one-click **"Download Starter CSV Template"** button (with standard headers like `Name, Ear_ID, Sex, DOB, Breed, Variety, Weight, Sire_ID, Dam_ID, Reg_No, GC_No`), a spreadsheet import column-mapping preview ("We matched these columns — map the remaining ones"), and pre-import highlighting for unresolved Sire/Dam links on non-HerdBoss CSV imports.

---

### Priority 3: Architecture Hygiene, Core Workflow Speed & Pedigree Depth
*Maintainability cleanups plus fast cage-side entry, batch printing, and breeding/genetics comparisons.*

10. **[Medium / Architecture & Cleanup] Enforce `src/core/` Isolation, Remove Duplicates & Sync Metadata/Docs**
    - Decouple `src/core/supportBundle.ts:20` from `../storage/crashLogger` type imports so `src/core/` keeps strict zero-upward-dependency isolation.
    - Remove unused duplicate `src/core/masterTaskList.ts` (update `ARCHITECTURE.md:15` to `taskMaster.ts`), consolidate dual `usePWAInstall` (`src/hooks/usePWAInstall.ts` vs `src/storage/storageProtection.ts`), strip unused `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` from `metadata.json:5`, review whether `firebase` + `firebase-applet-config.json` stay strictly for optional Google Calendar OAuth, remove `public/assets/aistudio/` scratch artifacts, and update `.github/structure.txt`.

11. **[Medium / Low-RAM Export Streaming] Route All Printable/Shareable Exports & Streaming Chunks Through OPFS `/tmp` (`src/utils/webFileActions.ts`, `src/core/backupArchive.ts`)**
    - Stage printable `.HTM` pedigrees, cage cards, and `shareTextFileOrDownload` / `shareBinaryFileOrDownload` exports through OPFS `/tmp` (with immediate post-use cleanup) even when under the current `512 KB` threshold (`OPFS_SCRATCHPAD_THRESHOLD_BYTES`) when OPFS is available.
    - Stream large `.ZIP` / `.JSON` backup chunks incrementally into OPFS `/tmp` instead of materializing whole-archive `Uint8Array` / string buffers in JS heap beforehand.

12. **"Barn Bench" Fast Sequential Batch Entry Mode**
    - Provide a rapid, tap-friendly barn chore sheet filtered by cage row or species—allowing breeders to log weights, body condition scores, nail trims, or cage moves down the row with auto-advance and minimal modal switching.

13. **Batch Cage Card, Compact Mini-Sheet & Pedigree Printing from Herd Multi-Select**
    - Allow breeders to multi-select animals in `HerdScreen` and generate a single printable sheet of kennel/cage cards, stacked pedigrees, 1/4-page (4-up) mini pedigree sheets, or 3-generation 4x6 photo cards in one pass for shows, auctions, or transport.

14. **QR-Coded Cage Cards & Visual Hutch-Row / Facility Pen Board**
    - Embed scannable QR codes on printable cage/housing cards that jump straight to the animal's local profile route in the PWA when scanned with a phone camera.
    - Add a visual **Hutch-by-Hutch / Cage Row & Pasture Board** grouping animals by physical barn section and linking pens to feedlot inventories and recurring maintenance reminders (complementing #7 capacity warnings and #13 batch cage card printing).

15. **Side-by-Side Multi-Candidate Pairing Comparison Matrix (Breeding Lab)**
    - Let breeders compare one dam against multiple candidate sires (or vice versa) in a single table showing COI %, shared bottleneck ancestors, carrier risk flags, and predicted coat varieties side by side.

16. **Color-Coded Allele Provenance, Unique-Ancestor Dimming & Registration Flags**
    - Color-code genotype alleles in genetics/pedigree views to show provenance (inherited from sire vs. dam vs. inferred from offspring vs. manually entered).
    - Gray out unique (non-convergent) ancestors on pedigree nodes to spotlight linebred convergence, and highlight pedigree nodes in red when missing ARBA registration fields (e.g., tattoo, weight, variety, or incomplete 3-gen lineage) would block registration, listing the exact deficiency.

---

### Priority 4: Low-Severity Polish, Resilience & Pedigree/Analytics Upgrades
*Edge-case UI/hook cleanups and advanced print, genetics, show, and weight analytics features.*

17. **[Low / Resilience] Guard `useAsyncSubmitLock` & `useAsyncKeyedLock` Against StrictMode Remount Wedge (`src/utils/useAsyncSubmitLock.ts`)**
    - Reset or recreate the lock controller on effect mount/cleanup (`src/utils/useAsyncSubmitLock.ts:127-168`) so enabling `React.StrictMode` or `<Activity>` remounts never leave `disposed = true` permanently locking submit buttons.

18. **[Low / UX] Surface `.HTM` Download & Web Share Errors in Print Preview (`src/components/PrintPreviewModal.tsx`)**
    - Replace silent `catch {}` blocks in `handleDownloadHtm` and `handleShareHtm` (`src/components/PrintPreviewModal.tsx:371-401`) with visible error notices/toasts.

19. **[Low / Accessibility & Mobile UX] Add Header `X` & Backdrop Dismiss to Outcome Modal (`src/components/BreedingScreen.tsx`)**
    - Add a top-right `X` close button and backdrop-click dismiss to the Update Litter Outcome modal (`src/components/BreedingScreen.tsx:1136-1152`) so mobile users do not have to scroll down to Cancel.

20. **[Low / Code Cleanup] Remove Redundant Branch in Universal Pedigree Importer (`src/core/importers/universalPedigreeImporter.ts`)**
    - Simplify the identical `if / else if` branches incrementing `placeholderAncestorsCreated` at `src/core/importers/universalPedigreeImporter.ts:1132-1137`.

21. **Pedigree Print Orientation Toggle, Optional Breeder Logo & Direct Offline PDF Export**
    - Add a **Landscape / Portrait** 8.5" x 11" toggle, optional breeder/rabbitry **logo upload** in the header block, and an optional **`lbs.oz` decimal notation** toggle (e.g., `10.04`) on printed ARBA pedigrees (`generateEvansHtmPedigree` / `PrintPreviewModal`).
    - Optionally offer a direct client-side `.pdf` file download alongside browser Print-to-PDF while keeping everything 100% offline.

22. **8-Generation Pedigree Tree Mode, Custom Print Styling & Shareable Export Cards**
    - Extend `PedigreeScreen` and `generateEvansHtmPedigree` beyond the current 3–6 generation limit to support up to 8 generations on demand, plus customizable pedigree border/color/layout presets and lightweight standalone shareable pedigree HTML cards.

23. **Structured Show Placements, Wins, Judge Notes & E-Leg Vault (`ShowEvent`)**
    - Expand `ShowEvent` entries to capture class placements, judge notes, awards (`BOB`, `BOS`, `BIS`, `GCH`), earned points/legs, and photo-backed e-leg certificate attachments per entered animal so show summaries and Grand Championship progress feed automatically into pedigrees and Male/Female reports.

24. **Genetic Variety / Coat Explorer Sandbox**
    - Add a "What-If" genotype playground inside Breeding Lab so breeders can experiment with hypothetical loci combinations and see predicted varieties without creating temporary animal records first.

25. **Rate of Gain, Comparative Weight Charts & Litter Survival Curves**
    - Track kit/offspring survival rate per dam/sire and chart litter weight-gain milestones (e.g., 3-week, 6-week, 8-week weaning weights) to evaluate maternal performance across seasons.
    - Add multi-select animal comparative Rate of Gain line charts plotted on an age-in-days axis with native target/goal weight curve overlays.

---

### Priority 5: Specialized Operations, OCR Pipelines, Economics, CRM & Optional Cloud
*Larger domain expansions, client-side OCR modules, financial/CRM tools, and strictly opt-in future cloud sync.*

26. **Feed Inventory Ledger, Tag Lot-Number OCR & Biosecurity Auto-Purge**
    - **Feed Ledger:** Track incoming feed purchases, bag weights, active inventory, and intake allocation linked directly to cages, pens, or litters.
    - **Photo-Backed Feed Tags & Pre-Compression Lot OCR:** Capture feed tag and receipt photos locally, run client-side OCR *before* deep image compression to extract mill lot numbers/codes (with manual override fields for faded stamps), and auto-purge heavy raw tag images after a configurable 30/60/90-day window once lot numbers are indexed.
    - **Offline Manufacturer Emergency Directory:** Bundle an offline-ready directory of major feed manufacturers (e.g., Purina, Nutrena, Kent) with hotlines, web report links, and community feed-issue watch links.

27. **Offline Photo Pedigree Scanning & Local OCR Importer**
    - Add client-side OCR (e.g., lazy-loaded Web Worker `Tesseract.js` or local browser vision fallback) to parse ancestor names, ear tattoos/IDs, weights, and ARBA registration numbers from snapped photos or JPG/PDF scans of paper pedigrees directly into the import review queue.

28. **Local Economic Ledger, Meat/Pelt Processing Yields & 4-H/FFA Project Books**
    - **Expenses, Receipts & Profit Margins:** Expand current animal sale/purchase/stud-fee income tracking with general barn expense categories (feed consumption costs, bedding, vet, equipment), compressed receipt photo attachments, and automated net profit/loss margins per litter or individual animal.
    - **Meat & Pelt Production:** Track butcher schedules, harvest dates, live-to-dressed carcass yield percentages, and pelt grading logs.
    - **4-H / FFA Youth Project Record Books:** Track youth project feed logs, project-specific income/expenses, and formatted printable completion reports.

29. **Client CRM, Buyer Waitlist, Reservations & Deposit Reminders**
    - Add a local-first breeder CRM tracking buyer waitlist inquiries, animal/litter reservations, deposit tracking with automated follow-up reminders, and printable/exportable sales agreements.

30. **Alternative Certificates, Show Entry/Remark Cards & IAGARB Wool/Fiber Tracking**
    - **Alternative Documents & Family Layouts:** Generate pet-sale Birth Certificates (omitting breeder contact info), Breeding Certificates, and multi-photo family portrait pedigree layouts.
    - **Show Entry Forms & Remark Cards:** Generate printable/emailable official ARBA-style show entry forms and show remark card labels directly from `ShowEvent` entries.
    - **Wool / Fiber Harvest & IAGARB Angora Template:** Log individual fiber harvests (prime vs. grade weights) with totals summarized onto pedigrees, plus breed-specific pedigree templates like the IAGARB standard for German Angoras with wool judging point calculations.

31. **Founder Loss / Heritability Analytics & Interactive Barn Scheduler Gantt**
    - Add heritability coefficient trends and founder-loss / ancestor genetic contribution analytics in Breeding Lab & Pedigree Explorer.
    - Add an interactive drag-and-drop Barn Scheduler Gantt timeline with smart priority escalation for time-critical tasks (such as overdue nest boxes), paired with local P2P/LAN outbox reconciliation.

32. **Zero-Server Breeder Showcase / "For Sale" Catalog Exporter**
    - Generate a self-contained static HTML showcase page or buyer-ready stock sheet from animals marked `For Sale` (with photos, summarized pedigrees, and breeder contact info) that breeders can share or host free without a centralized marketplace server.

33. **Health Reference Wiki Links & Local Veterinary PDF Folder Pointer**
    - Add curated online links to external rabbit/livestock health wikis alongside a simple local device folder pointer for personal offline veterinary PDFs, paired with periodic reminders to back up external document folders.

34. **Breeding Calendar Moon/Holiday/Weather Overlays, Mileage Tax Log & Personal Journal**
    - **Calendar Overlays:** Add offline-computed moon-phase and holiday markers plus an optional online weekly weather forecast strip inside the Breeding Calendar.
    - **Mileage & Tax Report Log:** Log barn/show travel mileage and export tax-ready annual mileage reports.
    - **Personal Barn Journal:** Add a date-organized journal supporting rich text notes, color categories, star ratings, and full-text search.

35. **The Judge's Notebook (Dedicated Show Judge Module)**
    - Add an optional module for show judges to manage assigned show dates, club contacts, travel mileage, judging expenses, bid statuses, and judging contracts.

36. **Optional Cloud App-Folder Sync (`Google Drive AppFolder` / `OneDrive approot`) & `403`/`507` Quota Circuit Breaker**
    - *(Optional future roadmap beyond current zero-cloud / local-folder SyncThing sync)* Trigger user-opted background delta syncs to isolated app-specific cloud folders (`AppFolder` / `approot`) with incremental delta chunking when storage thresholds are tight.
    - Intercept `403` / `507` QuotaExceeded cloud responses with an immediate circuit breaker that pauses failing automated cloud syncs, shows a persistent warning, and prunes rolling cloud backups without ever blocking or rolling back local IndexedDB writes.

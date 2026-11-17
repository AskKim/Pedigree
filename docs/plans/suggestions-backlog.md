# Community Pedigree — Saved Suggestions Backlog

> **NOTE TO FUTURE SELF / CODING ASSISTANT:**
> Whenever any suggestion on this list is implemented and verified, **remove that completed item from this file** (and update the "Remaining" count/numbering cleanly) so this document always reflects only unimplemented suggestions.

---

> *(Earlier completed technical plans—OPFS Storage Vault & Archives, Legacy Browser Compatibility & Graceful Degradation, Reports Data Fields & 22 Report Generators, Coat Color Genetics Upgrade, Pedigree Completeness & Incomplete-Pedigree COI Notice, Per-Species Weight Units & Identifier Labels, Batch Offspring Creation Helper, and Repository Structure Cleanup—have been implemented cleanly.)*

---

## Current App Suggestions List (36 Remaining — Ordered by Implementation Workflow)

### Phase 1: Browser Stability, Memory Safety & Offline Update Resilience
*Lock down mobile tab stability, crash-loop recovery, and safe upgrade gates before adding heavier UI modules or bulk pipelines.*

1. **Automatic Startup Crash-Loop Circuit Breaker & `?emergency_reset=true` Panic Hatch**
   - **Crash-Loop Circuit Breaker (`sessionStorage`):** Track consecutive boot/startup crashes in `sessionStorage` inside `CrashErrorBoundary`; if the app crashes 3 times within 60 seconds of boot, automatically trip a circuit breaker to unregister all Service Workers, clear Workbox CacheStorage, and force a hard reload from network.
   - **Pre-Boot Manual Recovery Hatch (`?emergency_reset=true`):** Support an `?emergency_reset=true` URL query-param trigger and a boot-splash recovery link that immediately purge corrupt Service Workers and stale caches before React/SQLite finishes booting—without touching core IndexedDB/SQLite herd tables unless explicitly confirmed.

2. **Service Worker SPA Navigation Fallback, Manual Activation Gate & `controllerchange` Handshake**
   - Configure Workbox `navigateFallback` to return cached `index.html` when offline or when deep routes are refreshed, preventing offline 404 crashes.
   - Switch SW registration from `autoUpdate` to a manual `{ type: 'SKIP_WAITING' }` gate, inspect `registration.waiting` on cold launch, and attach a `controllerchange` listener with a `refreshing` guard so all open tabs reload cleanly without `ChunkLoadError` crashes (deferring while editor forms have unsaved changes).

3. **Mobile Background Freeze Pause/Resume, Double-Submit Guards & Async Error Toast**
   - **Background Freeze Handling (`document.visibilityState`):** Prevent mid-batch IndexedDB corruption when iOS Safari / Android Chrome freeze JS on app switch or screen lock by pausing active Outbox syncs or heavy backups on `'hidden'`, committing immediate progress state to IndexedDB, and safely resuming on `'visible'` (extending `crashLogger`'s existing visibility listener).
   - **Global `unhandledrejection` Toast Surface:** Extend `crashLogger`'s existing `window.addEventListener('unhandledrejection', ...)` safety net (plus `sessionStorage` trace if storage is full) to display a gentle non-blocking toast notification rather than letting a stalled async write freeze the UI with a permanent spinner.
   - **Rapid-Tap / Double-Submit Race Guards:** Add instant UI-level debounce, disabled state, and loading indicators on all primary action buttons (e.g., `Save Breeding Record`, `Save Animal`, `Sync Now`) from tap until the async promise resolves or rejects.

4. **Virtualized Herd/Log Lists, Windowed Pedigree Loading & Lifecycle Cleanup Audit**
   - Add list virtualization/windowing for large Herd rosters, litter histories, and care/breeding logs so only visible DOM nodes render on mobile.
   - Keep only the active animal and 2–3 immediate generations in active React pedigree state, lazy-loading deeper generations on demand when expanded or printed.
   - Audit all components and hooks to ensure strict teardown of `useEffect` subscriptions, timers, object URLs, and global `window`/`document` listeners on unmount during all-day barn sessions.

5. **PWA Update Governor (`auto` / `notify` / `pinned`), App Offline Toggle & Connectivity Probe**
   - Decouple SW asset updates from `navigator.onLine` via a `pwa_update_policy` setting in `localStorage`: `auto` (check on load/focus and prompt), `notify` (passive badge), and `pinned` (Hold Version — block `registration.update()` and suppress update prompts while keeping network sync active).
   - Add an in-app Offline Toggle that queues outbound sync/network actions locally without device airplane mode, plus a lightweight timed fetch probe to distinguish local/captive Wi-Fi from true internet connectivity.

6. **Uncached `version.json` / `status.json` Upgrade Gate, Remote Killswitch & Backup Checksums**
   - Serve `public/version.json` (`appVersion`, `schemaVersion`, `minDirectUpgradeSchema`) and `public/status.json` (`allowUpdates`, `revokedVersions`) with `Cache-Control: no-store`.
   - Run a pre-flight check before posting `SKIP_WAITING`: abort & warn if listed in `revokedVersions`, enforce a mandatory pre-upgrade JSON backup download/verification when `schemaDelta >= 2`, and trigger a Safe-Harbor Archive & Re-Import flow if `currentSchemaVersion < minDirectUpgradeSchema`.
   - Stamp records with `_schemaVersion` for cross-version sync transformation and append/verify SHA-256 checksums on automated pre-upgrade JSON backups before restore.

---

### Phase 2: Backups, Restore Safety & Sync Integrity
*Establish storage pruning, pre-restore inspections, memory warnings, temporal sync accuracy, and optional encryption.*

7. **Stale Photo / Orphan Attachment Pruner**
   - Add a storage cleanup utility in Diagnostics/Settings to inspect total photo bytes by species, downscale legacy oversized images created before current compression targets, or selectively prune full-res payloads when nearing browser storage quota limits.

8. **Pre-Restore Archive Inspector**
   - Display a compact summary preview (species breakdown, animal count, photo payload size, and detected tattoo/sex conflicts) before committing a full `.ZIP` or `.JSON` overwrite in Settings.

9. **Device Clock Skew Delta Compensation & Drift Nudge Banner**
   - Inspect HTTP response `Date` headers (or online sync responses) whenever network requests succeed to compute `timeOffset = serverTimestamp - localDeviceTimestamp` and persist the offset locally.
   - Stamp outbox mutations and audit logs with `adjustedTime = Date.now() + timeOffset` instead of raw `Date.now()` so multi-device sync ordering stays chronological even when a device clock is off, and show a gentle non-blocking UI banner when drift exceeds ~5 minutes.

10. **Per-Record Monotonic `_rev` Counters & Deterministic Google Calendar Event IDs**
    - Pair adjusted outbox timestamps with an incrementing `_rev` counter (`1, 2, 3...`) on synced records (extending `syncOutbox`'s `logicalCounter`) so backward device clock rewinds cannot cause newer edits to lose conflict resolution.
    - Generate deterministic Google Calendar API event IDs tied to permanent record/task UUIDs (matching `.ics`'s deterministic `UID`) in `googleCalendarClient.ts` so multi-device updates or retries update existing calendar events instead of creating duplicates.

11. **Optional Passphrase Encryption for Shared `.ZIP` Backups & Sync Folders**
    - Offer optional client-side Web Crypto passphrase encryption when exporting `.ZIP` backups or writing sync folder deltas to protect buyer names, prices, and vet records while keeping one-click plain exports when off.

---

### Phase 3: Core Barn Workflow, Housing & Importer Usability
*High-impact daily cage-side and onboarding improvements built directly on existing Herd, Housing, Importer, and TaskMaster foundations.*

12. **Interactive CSV Column Mapper, Starter Template & Unlinked Parent Preview**
    - Add a one-click **"Download Starter CSV Template"** button (with standard headers like `Name, Ear_ID, Sex, DOB, Breed, Variety, Weight, Sire_ID, Dam_ID, Reg_No, GC_No`), a spreadsheet import column-mapping preview ("We matched these columns — map the remaining ones"), and pre-import highlighting for unresolved Sire/Dam links on non-HerdBoss CSV imports.

13. **Breeding Lab & Master Task List Refinements (`masterTaskList.ts`)**
    - **Recalculate Post-Birth Tasks on Actual Birth:** When a breeding is logged as `Bred`, `AFTER_BIRTH` tasks (weaning, rebreed readiness) are scheduled from `expectedDueDateIso`. If the birth happens a couple of days early or late and `actualBirthDateIso` is entered later, offering a one-tap option to shift uncompleted post-birth tasks to the actual birth date prevents stale weaning/rebreed reminders.
    - **One-Click Breeding Outcome Checkoffs & Conditional Chain Cleanup:** Allow checking off a Palpation or Birth task in the task list to directly log `Palpated Positive` / `Missed` (Open) or live/stillborn offspring counts onto the linked breeding record—and automatically clear pending nestbox/birth tasks when a breeding is marked `Missed`/Open.
    - **Per-Breed Milestone Offset Overrides:** Allow optional day-offset overrides by breed (e.g., dwarf vs. giant rabbit lines) on top of the species-level defaults.

14. **Active Medication Withdrawal Countdown & Safety Alerts (`withdrawalClearDateIso`)**
    - Surface active care-log withdrawal period badges on Herd cards and Home alerts—and trigger a soft confirmation warning before marking an animal under active withdrawal for sale, meat/processing, or exhibition.

15. **Cage / Pen Capacity Warnings & Quick Occupant Assignment**
    - Compare current animal occupants against `CageLocation.capacity` (e.g., `3/2 over capacity`), allow one-click occupant assignment from the housing card, and warn before exceeding capacity.

16. **"Barn Bench" Fast Sequential Batch Entry Mode**
    - Provide a rapid, tap-friendly barn chore sheet filtered by cage row or species—allowing breeders to log weights, body condition scores, nail trims, or cage moves down the row with auto-advance and minimal modal switching.

17. **QR-Coded Cage Cards & Visual Hutch-Row / Facility Pen Board**
    - Embed scannable QR codes on printable cage/housing cards that jump straight to the animal's local profile route in the PWA when scanned with a phone camera.
    - Add a visual **Hutch-by-Hutch / Cage Row & Pasture Board** grouping animals by physical barn section and linking pens to feedlot inventories and recurring maintenance reminders (complementing #15 capacity warnings and #18 batch cage card printing).

18. **Batch Cage Card, Compact Mini-Sheet & Pedigree Printing from Herd Multi-Select**
    - Allow breeders to multi-select animals in `HerdScreen` and generate a single printable sheet of kennel/cage cards, stacked pedigrees, 1/4-page (4-up) mini pedigree sheets, or 3-generation 4x6 photo cards in one pass for shows, auctions, or transport.

---

### Phase 4: Pedigrees, Genetics & Show Records Depth
*Deepen lineage trees, print customization, allele traceability, breeding analytics, and show/leg tracking.*

19. **8-Generation Pedigree Tree Mode, Custom Print Styling & Shareable Export Cards**
    - Extend `PedigreeScreen` and `generateEvansHtmPedigree` beyond the current 3–6 generation limit to support up to 8 generations on demand, plus customizable pedigree border/color/layout presets and lightweight standalone shareable pedigree HTML cards.

20. **Pedigree Print Orientation Toggle, Optional Breeder Logo & Direct Offline PDF Export**
    - Add a **Landscape / Portrait** 8.5" x 11" toggle, optional breeder/rabbitry **logo upload** in the header block, and an optional **`lbs.oz` decimal notation** toggle (e.g., `10.04`) on printed ARBA pedigrees (`generateEvansHtmPedigree` / `PrintPreviewModal`).
    - Optionally offer a direct client-side `.pdf` file download alongside browser Print-to-PDF while keeping everything 100% offline.

21. **Color-Coded Allele Provenance, Unique-Ancestor Dimming & Registration Flags**
    - Color-code genotype alleles in genetics/pedigree views to show provenance (inherited from sire vs. dam vs. inferred from offspring vs. manually entered).
    - Gray out unique (non-convergent) ancestors on pedigree nodes to spotlight linebred convergence, and highlight pedigree nodes in red when missing ARBA registration fields (e.g., tattoo, weight, variety, or incomplete 3-gen lineage) would block registration, listing the exact deficiency.

22. **Alternative Certificates, Show Entry/Remark Cards & IAGARB Wool/Fiber Tracking**
    - **Alternative Documents & Family Layouts:** Generate pet-sale Birth Certificates (omitting breeder contact info), Breeding Certificates, and multi-photo family portrait pedigree layouts.
    - **Show Entry Forms & Remark Cards:** Generate printable/emailable official ARBA-style show entry forms and show remark card labels directly from `ShowEvent` entries.
    - **Wool / Fiber Harvest & IAGARB Angora Template:** Log individual fiber harvests (prime vs. grade weights) with totals summarized onto pedigrees, plus breed-specific pedigree templates like the IAGARB standard for German Angoras with wool judging point calculations.

23. **Structured Show Placements, Wins, Judge Notes & E-Leg Vault (`ShowEvent`)**
    - Expand `ShowEvent` entries to capture class placements, judge notes, awards (`BOB`, `BOS`, `BIS`, `GCH`), earned points/legs, and photo-backed e-leg certificate attachments per entered animal so show summaries and Grand Championship progress feed automatically into pedigrees and Male/Female reports.

24. **Side-by-Side Multi-Candidate Pairing Comparison Matrix (Breeding Lab)**
    - Let breeders compare one dam against multiple candidate sires (or vice versa) in a single table showing COI %, shared bottleneck ancestors, carrier risk flags, and predicted coat varieties side by side.

25. **Genetic Variety / Coat Explorer Sandbox**
    - Add a "What-If" genotype playground inside Breeding Lab so breeders can experiment with hypothetical loci combinations and see predicted varieties without creating temporary animal records first.

26. **Founder Loss / Heritability Analytics & Interactive Barn Scheduler Gantt**
    - Add heritability coefficient trends and founder-loss / ancestor genetic contribution analytics in Breeding Lab & Pedigree Explorer.
    - Add an interactive drag-and-drop Barn Scheduler Gantt timeline with smart priority escalation for time-critical tasks (such as overdue nest boxes), paired with local P2P/LAN outbox reconciliation.

---

### Phase 5: Feed Biosecurity, Production, Economics, CRM & Specialized Modules
*Larger homestead/commercial/youth modules and client-side OCR pipelines built atop the stabilized storage, photo, and animal-record platform.*

27. **Offline Photo Pedigree Scanning & Local OCR Importer**
    - Add client-side OCR (e.g., lazy-loaded Web Worker `Tesseract.js` or local browser vision fallback) to parse ancestor names, ear tattoos/IDs, weights, and ARBA registration numbers from snapped photos or JPG/PDF scans of paper pedigrees directly into the import review queue.

28. **Feed Inventory Ledger, Tag Lot-Number OCR & Biosecurity Auto-Purge**
    - **Feed Ledger:** Track incoming feed purchases, bag weights, active inventory, and intake allocation linked directly to cages, pens, or litters.
    - **Photo-Backed Feed Tags & Pre-Compression Lot OCR:** Capture feed tag and receipt photos locally, run client-side OCR *before* deep image compression to extract mill lot numbers/codes (with manual override fields for faded stamps), and auto-purge heavy raw tag images after a configurable 30/60/90-day window once lot numbers are indexed.
    - **Offline Manufacturer Emergency Directory:** Bundle an offline-ready directory of major feed manufacturers (e.g., Purina, Nutrena, Kent) with hotlines, web report links, and community feed-issue watch links.

29. **Rate of Gain, Comparative Weight Charts & Litter Survival Curves**
    - Track kit/offspring survival rate per dam/sire and chart litter weight-gain milestones (e.g., 3-week, 6-week, 8-week weaning weights) to evaluate maternal performance across seasons.
    - Add multi-select animal comparative Rate of Gain line charts plotted on an age-in-days axis with native target/goal weight curve overlays.

30. **Local Economic Ledger, Meat/Pelt Processing Yields & 4-H/FFA Project Books**
    - **Expenses, Receipts & Profit Margins:** Expand current animal sale/purchase/stud-fee income tracking with general barn expense categories (feed consumption costs, bedding, vet, equipment), compressed receipt photo attachments, and automated net profit/loss margins per litter or individual animal.
    - **Meat & Pelt Production:** Track butcher schedules, harvest dates, live-to-dressed carcass yield percentages, and pelt grading logs.
    - **4-H / FFA Youth Project Record Books:** Track youth project feed logs, project-specific income/expenses, and formatted printable completion reports.

31. **Client CRM, Buyer Waitlist, Reservations & Deposit Reminders**
    - Add a local-first breeder CRM tracking buyer waitlist inquiries, animal/litter reservations, deposit tracking with automated follow-up reminders, and printable/exportable sales agreements.

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

---

### Phase 6: Optional Future Cloud-Folder Integration
*Strictly opt-in roadmap outside the core zero-cloud release.*

36. **Optional Cloud App-Folder Sync (`Google Drive AppFolder` / `OneDrive approot`) & `403`/`507` Quota Circuit Breaker**
    - *(Optional future roadmap beyond current zero-cloud / local-folder SyncThing sync)* Trigger user-opted background delta syncs to isolated app-specific cloud folders (`AppFolder` / `approot`) with incremental delta chunking when storage thresholds are tight.
    - Intercept `403` / `507` QuotaExceeded cloud responses with an immediate circuit breaker that pauses failing automated cloud syncs, shows a persistent warning, and prunes rolling cloud backups without ever blocking or rolling back local IndexedDB writes.

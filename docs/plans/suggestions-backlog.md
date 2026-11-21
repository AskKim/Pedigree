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

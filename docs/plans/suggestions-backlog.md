# Community Pedigree — Saved Suggestions Backlog

> **NOTE TO FUTURE SELF / CODING ASSISTANT:**
> Whenever any suggestion on this list is implemented and verified, **remove that completed item from this file** (and update the "Remaining" count/numbering cleanly) so this document always reflects only unimplemented suggestions.
>
> *Audit note (2026-11-20): Removed already-completed ES2018 `Blob.prototype.arrayBuffer()` / `readBlobAsArrayBuffer` shim item, reorganized remaining items by criticality, completed & removed the GitHub Pages Subpath Build & Bun Toolchain fix, Active Medication Withdrawal Countdown & Safety Alerts (`IMP-024`), Align Sync Outbox Mutations & Reset Cleanup (`IMP-025`), Clock-Skew Consistency & Archive Export Double-Tap Locks (`IMP-026`), True Lazy 2–3 Gen SQLite/OPFS Pedigree Fetching & Windowed List Virtualization (`IMP-027`), Cage / Pen Capacity Warnings & Quick Occupant Assignment (`IMP-028`), Breeding Lab & Master Task List Refinements (`IMP-029`), Consolidated Import/Export Hub & Extensible Non-Native Exporter Registry (`IMP-030`), Interactive CSV Column Mapper, Starter Template & Unlinked Parent Preview (`IMP-031`), `src/core/` Isolation, Duplicate Removal & Metadata/Docs Sync, Low-RAM Export Streaming & Full OPFS `/tmp` Staging (`IMP-032`), Guard `useAsyncSubmitLock` & `useAsyncKeyedLock` Against StrictMode/Activity Remount Wedge, "Barn Bench" Fast Sequential Batch Entry Mode (`IMP-034`), Batch Cage Card, Compact Mini-Sheet & Pedigree Printing from Herd Multi-Select (`IMP-035`), QR-Coded Cage Cards & Visual Hutch-Row / Facility Pen Board (`IMP-036`), Side-by-Side Multi-Candidate Pairing Comparison Matrix (`IMP-037`), Color-Coded Allele Provenance, Unique-Ancestor Dimming & Registration Flags (`IMP-038`), Surface `.HTM` Download & Web Share Errors in Print Preview (`PrintPreviewModal.tsx`), Header `X` & Backdrop Dismiss on the Update Litter Outcome Modal (`BreedingScreen.tsx`), removed obsolete redundant-branch cleanup item in `universalPedigreeImporter.ts` (already simplified), completed & removed Pedigree Print Orientation Toggle, Optional Breeder Logo, ARBA `lbs.oz` Notation & Direct Offline PDF Export (`IMP-039`), and completed & removed 8-Generation Pedigree Tree Mode, Custom Print Styling & Shareable Export Cards (`IMP-040`).*

---

## Current App Suggestions & Remediation List (14 Remaining — Ordered by Criticality & Severity)

### Priority 3: Low-Severity Polish, UX Resilience & Pedigree/Analytics Upgrades
*Edge-case UI cleanups and advanced print, genetics, show, and weight analytics features.*

1. **Structured Show Placements, Wins, Judge Notes & E-Leg Vault (`ShowEvent`)**
   - Expand `ShowEvent` entries to capture class placements, judge notes, awards (`BOB`, `BOS`, `BIS`, `GCH`), earned points/legs, and photo-backed e-leg certificate attachments per entered animal so show summaries and Grand Championship progress feed automatically into pedigrees and Male/Female reports.

2. **Genetic Variety / Coat Explorer Sandbox**
   - Add a "What-If" genotype playground inside Breeding Lab so breeders can experiment with hypothetical loci combinations and see predicted varieties without creating temporary animal records first.

3. **Rate of Gain, Comparative Weight Charts & Litter Survival Curves**
   - Track kit/offspring survival rate per dam/sire and chart litter weight-gain milestones (e.g., 3-week, 6-week, 8-week weaning weights) to evaluate maternal performance across seasons.
   - Add multi-select animal comparative Rate of Gain line charts plotted on an age-in-days axis with native target/goal weight curve overlays.

---

### Priority 4: Specialized Operations, OCR Pipelines, Economics, CRM & Optional Cloud
*Larger domain expansions, client-side OCR modules, financial/CRM tools, and strictly opt-in future cloud sync.*

4. **Feed Inventory Ledger, Tag Lot-Number OCR & Biosecurity Auto-Purge**
   - **Feed Ledger:** Track incoming feed purchases, bag weights, active inventory, and intake allocation linked directly to cages, pens, or litters.
   - **Photo-Backed Feed Tags & Pre-Compression Lot OCR:** Capture feed tag and receipt photos locally, run client-side OCR *before* deep image compression to extract mill lot numbers/codes (with manual override fields for faded stamps), and auto-purge heavy raw tag images after a configurable 30/60/90-day window once lot numbers are indexed.
   - **Offline Manufacturer Emergency Directory:** Bundle an offline-ready directory of major feed manufacturers (e.g., Purina, Nutrena, Kent) with hotlines, web report links, and community feed-issue watch links.

5. **Offline Photo Pedigree Scanning & Local OCR Importer**
   - Add client-side OCR (e.g., lazy-loaded Web Worker `Tesseract.js` or local browser vision fallback) to parse ancestor names, ear tattoos/IDs, weights, and ARBA registration numbers from snapped photos or JPG/PDF scans of paper pedigrees directly into the import review queue.

6. **Local Economic Ledger, Meat/Pelt Processing Yields & 4-H/FFA Project Books**
   - **Expenses, Receipts & Profit Margins:** Expand current animal sale/purchase/stud-fee income tracking with general barn expense categories (feed consumption costs, bedding, vet, equipment), compressed receipt photo attachments, and automated net profit/loss margins per litter or individual animal.
   - **Meat & Pelt Production:** Track butcher schedules, harvest dates, live-to-dressed carcass yield percentages, and pelt grading logs.
   - **4-H / FFA Youth Project Record Books:** Track youth project feed logs, project-specific income/expenses, and formatted printable completion reports.

7. **Client CRM, Buyer Waitlist, Reservations & Deposit Reminders**
   - Add a local-first breeder CRM tracking buyer waitlist inquiries, animal/litter reservations, deposit tracking with automated follow-up reminders, and printable/exportable sales agreements.

8. **Alternative Certificates, Show Entry/Remark Cards & IAGARB Wool/Fiber Tracking**
   - **Alternative Documents & Family Layouts:** Generate pet-sale Birth Certificates (omitting breeder contact info), Breeding Certificates, and multi-photo family portrait pedigree layouts.
   - **Show Entry Forms & Remark Cards:** Generate printable/emailable official ARBA-style show entry forms and show remark card labels directly from `ShowEvent` entries.
   - **Wool / Fiber Harvest & IAGARB Angora Template:** Log individual fiber harvests (prime vs. grade weights) with totals summarized onto pedigrees, plus breed-specific pedigree templates like the IAGARB standard for German Angoras with wool judging point calculations.

9. **Founder Loss / Heritability Analytics & Interactive Barn Scheduler Gantt**
   - Add heritability coefficient trends and founder-loss / ancestor genetic contribution analytics in Breeding Lab & Pedigree Explorer.
   - Add an interactive drag-and-drop Barn Scheduler Gantt timeline with smart priority escalation for time-critical tasks (such as overdue nest boxes), paired with local P2P/LAN outbox reconciliation.

10. **Zero-Server Breeder Showcase / "For Sale" Catalog Exporter**
    - Generate a self-contained static HTML showcase page or buyer-ready stock sheet from animals marked `For Sale` (with photos, summarized pedigrees, and breeder contact info) that breeders can share or host free without a centralized marketplace server.

11. **Health Reference Wiki Links & Local Veterinary PDF Folder Pointer**
    - Add curated online links to external rabbit/livestock health wikis alongside a simple local device folder pointer for personal offline veterinary PDFs, paired with periodic reminders to back up external document folders.

12. **Breeding Calendar Moon/Holiday/Weather Overlays, Mileage Tax Log & Personal Journal**
    - **Calendar Overlays:** Add offline-computed moon-phase and holiday markers plus an optional online weekly weather forecast strip inside the Breeding Calendar.
    - **Mileage & Tax Report Log:** Log barn/show travel mileage and export tax-ready annual mileage reports.
    - **Personal Barn Journal:** Add a date-organized journal supporting rich text notes, color categories, star ratings, and full-text search.

13. **The Judge's Notebook (Dedicated Show Judge Module)**
    - Add an optional module for show judges to manage assigned show dates, club contacts, travel mileage, judging expenses, bid statuses, and judging contracts.

14. **Optional Cloud App-Folder Sync (`Google Drive AppFolder` / `OneDrive approot`) & `403`/`507` Quota Circuit Breaker**
    - *(Optional future roadmap beyond current zero-cloud / local-folder SyncThing sync)* Trigger user-opted background delta syncs to isolated app-specific cloud folders (`AppFolder` / `approot`) with incremental delta chunking when storage thresholds are tight.
    - Intercept `403` / `507` QuotaExceeded cloud responses with an immediate circuit breaker that pauses failing automated cloud syncs, shows a persistent warning, and prunes rolling cloud backups without ever blocking or rolling back local IndexedDB writes.

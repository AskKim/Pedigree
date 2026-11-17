# Community Pedigree — Saved Suggestions Backlog

> **NOTE TO FUTURE SELF / CODING ASSISTANT:**
> Whenever any suggestion on this list is implemented and verified, **remove that completed item from this file** (and update the "Remaining" count/numbering cleanly) so this document always reflects only unimplemented suggestions.

---

> *(Earlier completed technical plans—Reports Data Fields & 22 Report Generators, Coat Color Genetics Upgrade, Pedigree Completeness & Incomplete-Pedigree COI Notice, Per-Species Weight Units & Identifier Labels, Batch Offspring Creation Helper, and Repository Structure Cleanup—have been implemented and removed from `docs/plans/`. Coat color genetics UI and export surfaces continue to display `ColorGeneticsNotice` / under-development notices pending domain-expert sign-off.)*

---

## Current App Suggestions List (5 Remaining)

1. **Structured Show Placements, Wins & Points (`ShowEvent`)**
   - Expand `ShowEvent` entries to capture class placements, awards (`BOB`, `BOS`, `BIS`, `GCH`), and earned points/legs per entered animal so show summaries feed automatically into pedigrees and Male/Female reports.

2. **Cage / Pen Capacity Warnings & Quick Occupant Assignment**
   - Compare current animal occupants against `CageLocation.capacity` (e.g., `3/2 over capacity`), allow one-click occupant assignment from the housing card, and warn before exceeding capacity.

3. **Optional Passphrase Encryption for Shared `.ZIP` Backups & Sync Folders**
   - Offer optional client-side Web Crypto passphrase encryption when exporting `.ZIP` backups or writing sync folder deltas to protect buyer names, prices, and vet records while keeping one-click plain exports when off.

4. **Interactive CSV Column Mapper & Unlinked Parent Preview for Custom Spreadsheets**
   - Add a spreadsheet import column-mapping preview ("We matched these columns — map the remaining ones") and highlight unresolved Sire/Dam links prior to finalizing non-HerdBoss CSV imports.

5. **Breeding Lab & Master Task List Refinements (`masterTaskList.ts`)**
   - **Recalculate Post-Birth Tasks on Actual Birth:** When a breeding is logged as `Bred`, `AFTER_BIRTH` tasks (weaning, rebreed readiness) are scheduled from `expectedDueDateIso`. If the birth happens a couple of days early or late and `actualBirthDateIso` is entered later, offering a one-tap option to shift uncompleted post-birth tasks to the actual birth date prevents stale weaning/rebreed reminders.

# Community Pedigree — Saved Suggestions Backlog

> **NOTE TO FUTURE SELF / CODING ASSISTANT:**
> Whenever any suggestion on this list is implemented and verified, **remove that completed item from this file** (and update the "Remaining" count/numbering cleanly) so this document always reflects only unimplemented suggestions.

---

## Remaining From Prior Suggestions List

- **[Prior #1] Structured Data Fields for the 22 Planned Reports**
  - **Status:** Planned in [`docs/plans/reports-data-fields-plan.md`](./reports-data-fields-plan.md)
  - **Summary:** Add `ownershipType`, `salePriceCents`, `soldDateIso`, `buyerName`, `culled` / `cullReason`, `deceasedDateIso` / `deathCause`, breeding `serviceFeeCents`, structured `CareLog` medication/withdrawal fields, numeric BCS/FAMACHA scores, and ultrasound scan fields across `models.ts`, SQLite migrations, JSON v5 backups, and capture forms, then activate interactive report generation.
- *(Note: Earlier Suggestions #2 Pedigree Completeness & Incomplete-Pedigree COI Notice, #3 Per-Species Weight Units (`kg`) & Species-Aware Identifier Labels, and #6 Repository Structure/Docs Cleanup have already been completed and removed.)*
- *(Note: Related technical plan pending expert sign-off: [`docs/plans/coat-color-genetics-upgrade-plan.md`](./coat-color-genetics-upgrade-plan.md).)*

---

## Current App Suggestions List

2. **Structured Show Placements, Wins & Points (`ShowEvent`)**
   - Expand `ShowEvent` entries to capture class placements, awards (`BOB`, `BOS`, `BIS`, `GCH`), and earned points/legs per entered animal so show summaries feed automatically into pedigrees and Male/Female reports.

3. **Cage / Pen Capacity Warnings & Quick Occupant Assignment**
   - Compare current animal occupants against `CageLocation.capacity` (e.g., `3/2 over capacity`), allow one-click occupant assignment from the housing card, and warn before exceeding capacity.

4. **Optional Passphrase Encryption for Shared `.ZIP` Backups & Sync Folders**
   - Offer optional client-side Web Crypto passphrase encryption when exporting `.ZIP` backups or writing sync folder deltas to protect buyer names, prices, and vet records while keeping one-click plain exports when off.

5. **Interactive CSV Column Mapper & Unlinked Parent Preview for Custom Spreadsheets**
   - Add a spreadsheet import column-mapping preview ("We matched these columns — map the remaining ones") and highlight unresolved Sire/Dam links prior to finalizing non-HerdBoss CSV imports.

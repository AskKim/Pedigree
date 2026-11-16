# Reports Data Fields & Execution Plan

- **Project:** Community Pedigree (`AskKim/Pedigree`)
- **Status:** Proposed / Pending Implementation
- **Related Preview UI:** `src/components/ReportsScreen.tsx`, `src/core/reportCatalog.ts`
- **Primary Target Modules:** `src/core/models.ts`, `src/storage/webSqliteAdapter.ts`, `src/core/syncAndExports.ts`, `src/core/importers/conflictResolver.ts`, `src/components/AnimalEditorModal.tsx`, `src/components/HerdScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/ReportsScreen.tsx`

---

## Core Architectural Rules for Reports

1. **Strictly Scoped to Added Species Only:**
   - Every per-species report queries ONLY species present in `snapshot.speciesProfiles`. Species not added to the user's barn must never appear in report dropdowns, summaries, or generated outputs.
2. **Universal Sex & Age Breakdowns (`Male` / `Female` / `Non-Adult`):**
   - Reports avoid hardcoded species-only terms (`Buck`, `Doe`, `Kid`, `Kidding`) and adapt labels dynamically via `SpeciesProfile` (`maleLabel`, `femaleLabel`, `offspringLabel`, `birthEventLabel`) and `getSpeciesIdentifierLabels(speciesProfile.name)`.
   - Sex filters standardize on canonical `BiologicalSex` (`Male` | `Female` | `Unknown`), paired with adult vs. **non-adult** classification (`status === 'Junior'` or age `< speciesProfile.weanDaysAfterBirth` / configurable adult cutoff).
3. **Effective Species Weight Unit (`resolveSpeciesWeightUnit`):**
   - Weight-based reports (`Weight Gain Report`, `Non-Adults Report`) render weights using `resolveSpeciesWeightUnit(speciesProfile, settings)` (`lbs_oz`, `lbs`, `kg`, or `grams`).
4. **Offline-First SQLite + JSON v5 + Multi-Device Sync Compatibility:**
   - Every new field must live in pure TypeScript `models.ts`, persist in `PEDIGREE_SQLITE_SCHEMA` (with safe `ALTER TABLE` migrations in `applySchemaMigrations`), round-trip cleanly in `exportBarnBackupJson` / `parseBarnBackupJson`, and merge deterministically by `updatedAt`.

---

## Gap Audit: What Already Exists vs. Missing Fields

### Group A — Reports Already Supported by Existing Fields (Ready for Engine Wiring)
- **Roster Report**, **Male Report**, **Female Report**, **Non-Adults Report**:
  - Uses existing `Animal.species`, `sex`, `status`, `archived`, `birthDateIso`, `breed`, `variety`, `legsCount`, `registrationNumber`.
  - *Small addition recommended:* Optional `maturityDays?: number` on `SpeciesProfile` (or fallback rule: `status === 'Junior' || ageDays <= weanDaysAfterBirth * 2`) so "Non-Adult (Male & Female)" filters accurately across fast-maturing Rabbits vs. Cattle/Dogs.
- **Unmarked / Missing ID Report**, **ID Cross-Reference Report**, **ID Tags & Housing Labels Report**:
  - Uses existing `Animal.tattoo`, `name`, `registrationNumber`, `cageLocation`, `generateThermalCageCardHtml`.
- **Weight Gain Report**:
  - Uses `Animal.weightGrams` + `CareLog` entries where `type === 'Weight Check'` (`dateIso`, `weightGrams`).
- **Breeding History Report**, **Breed With Compatibility Report**:
  - Uses `BreedingRecord` (`sireId`, `damId`, `bredDateIso`, `expectedDueDateIso`, `actualBirthDateIso`, `liveCount`, `stillbornCount`, `weanedCount`, `status`) and `calculatePairingCoi` (depth-8 path analysis).

---

### Group B — Reports Requiring New Structured Fields

#### 1. Financial, Sales & Stud Income (`Male Income`, `Female Income`, `Sold Stock`)
- **Current Gap:** `Animal` only has `status: 'Sold'` and `BreedingRecord` has no stud/service fee. No price, sale date, or buyer fields exist outside free-text `notes`.
- **Planned Model Additions:**
  - On `Animal`:
    - `ownershipType?: 'Owned' | 'Reference' | 'Outside'` (or boolean `isOwnedInBarn?: boolean`, defaulting `true` for active stock and `false` if marked outside/reference—solves **My Owned Stock** vs **Outside / Reference Stock** cleanly even when `ownerName` has typos!).
    - `salePriceCents?: number` (integer cents avoids floating-point rounding bugs)
    - `soldDateIso?: string` (`YYYY-MM-DD`)
    - `buyerName?: string`
    - `purchaseCostCents?: number` (optional acquisition cost for net margin later)
  - On `BreedingRecord`:
    - `serviceFeeCents?: number` (stud / breeding fee earned by Sire or paid by Dam owner)
    - `serviceFeeDirection?: 'earned' | 'paid' | 'none'`
  - *Currency formatting:* Store `currencyCode?: string` (default `'USD'`) on `BarnSettings` so totals format cleanly.

#### 2. Cull Decisions (`Cull Decision Report`)
- **Current Gap:** `AnimalStatus` currently allows `'Active' | 'Junior' | 'Retired' | 'Archived' | 'Sold' | 'Deceased'`. There is no structured cull flag or cull reason.
- **Planned Model Additions:**
  - On `Animal`:
    - `culled?: boolean` (or add `'Culled'` / keep `archived` + `cullReason?: string` + `cullDateIso?: string`). Keeping a structured `culled?: boolean`, `cullDateIso?: string`, and `cullReason?: string` preserves compatibility with existing `status` filters while supporting both "Flagged to Cull" (still alive/pending) and "Culled/Removed".

#### 3. Mortality / Losses (`Mortality / Loss Report`)
- **Current Gap:** `Animal` has `status: 'Deceased'`, but no structured `deceasedDateIso` or `deathCause` (required to compute age at death—adult vs. non-adult—and group losses by cause).
- **Planned Model Additions:**
  - On `Animal`:
    - `deceasedDateIso?: string` (`YYYY-MM-DD`)
    - `deathCause?: string` (e.g. Illness, Predator, Birth Complication, Injury, Unknown)

#### 4. Medications, Treatments & Withdrawals (`Medicine & Treatment Report`)
- **Current Gap:** `CareLog` (`type: 'Health / Vet'`) only has `title` and `notes`. There are no structured drug name, dose, route, or meat/milk withdrawal-until dates.
- **Planned Model Additions on `CareLog`:**
  - `medicationName?: string`
  - `dosage?: string` (e.g., `"0.5 mL"`, `"1 tablet"`)
  - `administrationRoute?: string` (e.g., `Oral`, `SubQ`, `IM`, `Topical`)
  - `withdrawalDays?: number`
  - `withdrawalClearDateIso?: string` (computed `addDaysIso(dateIso, withdrawalDays)` so active withdrawal holds appear automatically)

#### 5. Body Condition & Parasite Scores (`Body Condition & Parasite Score Report`)
- **Current Gap:** No numeric score fields exist on `CareLog` for BCS (typically 1–5 or 1–9 by species) or FAMACHA eye-score (1–5 for small ruminants/camelids).
- **Planned Model Additions on `CareLog`:**
  - `bodyConditionScore?: number` (e.g. `1`–`5` or `1`–`9`)
  - `famachaScore?: number` (`1`–`5`, optional/ruminant-focused)
  - `fecalEggCount?: number` (optional numeric FEC/EPG check)

#### 6. Ultrasounds & Pregnancy Scans (`Ultrasound Report`, `Birth Calendar (Ultrasounds)`)
- **Current Gap:** `CareLogType` does not include `'Ultrasound'`, and `BreedingRecord` has no dedicated ultrasound confirmation fields (`Palpated Positive` only captures status).
- **Planned Model Additions:**
  - Add `'Ultrasound'` to `CARE_LOG_TYPES` / `CareLogType` (or structured fields on both `CareLog` and `BreedingRecord`):
    - `ultrasoundDateIso?: string`
    - `ultrasoundResult?: 'Positive' | 'Negative' | 'Inconclusive' | ''`
    - `ultrasoundFetalCount?: number` (nullable/0 if uncounted)
    - `ultrasoundProjectedDueIso?: string` (allows gestational-measurement due date override vs. `bredDateIso + gestationDays`)

---

## Database & Sync Migration Strategy

1. **SQLite (`src/storage/webSqliteAdapter.ts`):**
   - Add nullable/defaulted columns via non-destructive `ALTER TABLE` statements in `applySchemaMigrations` (wrapped in `try/catch` per existing pattern) AND update `PEDIGREE_SQLITE_SCHEMA`:
     - `barn_settings`: `currency_code TEXT NOT NULL DEFAULT 'USD'`
     - `species_profiles`: `maturity_days INTEGER NOT NULL DEFAULT 0`
     - `animals`: `ownership_type TEXT NOT NULL DEFAULT 'Owned'`, `culled INTEGER NOT NULL DEFAULT 0`, `cull_date_iso TEXT NOT NULL DEFAULT ''`, `cull_reason TEXT NOT NULL DEFAULT ''`, `deceased_date_iso TEXT NOT NULL DEFAULT ''`, `death_cause TEXT NOT NULL DEFAULT ''`, `sold_date_iso TEXT NOT NULL DEFAULT ''`, `sale_price_cents INTEGER NOT NULL DEFAULT 0`, `buyer_name TEXT NOT NULL DEFAULT ''`
     - `breedings`: `service_fee_cents INTEGER NOT NULL DEFAULT 0`, `ultrasound_date_iso TEXT NOT NULL DEFAULT ''`, `ultrasound_result TEXT NOT NULL DEFAULT ''`, `ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0`, `ultrasound_projected_due_iso TEXT NOT NULL DEFAULT ''`
     - `care_logs`: `medication_name TEXT NOT NULL DEFAULT ''`, `dosage TEXT NOT NULL DEFAULT ''`, `administration_route TEXT NOT NULL DEFAULT ''`, `withdrawal_days INTEGER NOT NULL DEFAULT 0`, `withdrawal_clear_date_iso TEXT NOT NULL DEFAULT ''`, `body_condition_score REAL NOT NULL DEFAULT 0`, `famacha_score INTEGER NOT NULL DEFAULT 0`, `ultrasound_result TEXT NOT NULL DEFAULT ''`, `ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0`
2. **Backup & Sync (`src/core/syncAndExports.ts`, `src/core/importers/conflictResolver.ts`):**
   - Normalize all new fields safely in `parseBarnBackupJson` with sensible backward-compatible defaults when importing older v3/v4/v5 backups.
   - Ensure `exportAnimalsCsv` and `buildPdfReadyBarnSnapshot` include key new fields (ownership, sold date/price, deceased date/cause, culled flag) without breaking existing CSV column order (append new columns at the end).

---

## UI Capture Upgrades Needed Before Turning On Report Links

1. **Animal Editor Modal (`src/components/AnimalEditorModal.tsx`):**
   - Add an **Ownership** selector (`Owned in My Barn` vs. `Outside / Pedigree Reference`).
   - Conditionally reveal **Sold Details** (`Sold Date`, `Sale Price`, `Buyer`) when `status === 'Sold'`.
   - Conditionally reveal **Deceased Details** (`Date Deceased`, `Cause`) when `status === 'Deceased'`.
   - Add a **Flagged for Cull** toggle + optional reason note.
2. **Herd Care Log Form (`src/components/HerdScreen.tsx`):**
   - Dynamically reveal structured inputs depending on selected `CareLogType`:
     - `Health / Vet`: Medication Name, Dosage, Route, Withdrawal Days (auto-showing withdrawal clear date).
     - `Health Score / FAMACHA`: BCS numeric input + optional FAMACHA (`1–5`) for applicable species.
     - `Ultrasound` / `Palpation`: Scan result (`Positive` / `Negative` / `Inconclusive`) and estimated count.
3. **Breeding Ledger (`src/components/BreedingScreen.tsx`):**
   - Add optional **Stud / Service Fee** and **Ultrasound Confirmation** fields when logging or updating a breeding record.

---

## Phased Delivery Order

1. **Phase 1 — Models, Migrations & Round-Trip Tests:** Add fields to `models.ts`, `webSqliteAdapter.ts`, `syncAndExports.ts`, and `vitest` round-trip tests.
2. **Phase 2 — Capture UI:** Add conditional structured inputs in `AnimalEditorModal.tsx`, `HerdScreen.tsx`, and `BreedingScreen.tsx` (keeping forms uncluttered unless the relevant status/log type is chosen).
3. **Phase 3 — Pure Report Generators (`src/core/reportGenerators.ts`):** Implement pure TypeScript report builders per added species (`filter: Male | Female | Non-Adult Male | Non-Adult Female | All`), respecting `resolveSpeciesWeightUnit` and excluding any unadded species.
4. **Phase 4 — Interactive Reports Screen & Export:** Activate report links in `ReportsScreen.tsx` with on-screen preview, print/PDF, and CSV download, and remove the `"not working yet"` banner once verified.

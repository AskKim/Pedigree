# Community Pedigree Project Roadmap

**Current Active Phase:** Alpha 3 (`0.1.0-alpha.3`)  
**Previous Milestone:** Alpha 2 (`0.1.0-alpha.2` — Released & Validated)  
**Repository:** `ask-kim/pedigree`

---

## 1. Executive Status & Milestones

Community Pedigree is an offline-first, multi-species pedigree, breeding, and barn chore management Progressive Web App (PWA) with a thin native Android WebView packaging shell.

- **Alpha 1 (Completed):** Initial core functionality, pedigree tree calculation, offline storage prototypes, basic breeding tracking.
- **Alpha 2 (Released):** Hardened multi-species registry (rabbits, goats, sheep, cavies, poultry, cattle, equines, swine, dogs, cats), full offline SQLite WASM / OPFS / IndexedDB storage engine, offline P2P sync and cloud folder sync, automated backup vault with encrypted backups, breeding calendar and barn scheduler, carrier genetics engine, OCR pedigree card scanner, PDF generation and alternative pedigree certificates, 4-H/FFA youth project books and economics ledger, Android WebView hybrid packaging with offscreen native printing, and robust crash recovery.
- **Alpha 3 (Active Phase):** Architectural modularization, shared animal profile contracts, universal CSV importer enhancements, and content-agnostic core scaffold preparation.

---

## 2. Active Alpha 3 Goals

The primary objective of Alpha 3 is to prepare the architecture for long-term scalability, clean separation of concerns, and data interoperability without altering or destabilizing working Alpha 2 user features.

### 2.1 Modularity & Layered Separation
- Implement a strict three-layer architectural boundary across the codebase:
  1. **Content-Agnostic Core (`@engine/*`):** Pure TypeScript engine with zero domain/livestock-specific nomenclature. Encapsulates storage interfaces, platform bridges, cryptography, binary encoding, and sync protocols.
  2. **Reusable Feature Modules (`@features/*`):** Isolated feature packages that do not import from sibling features, ensuring modular testability and clean domain composition.
  3. **Application & Domain Configuration (`@app/*`):** Domain-specific schemas, terminology dictionaries, route orchestration, and UI assembly for Community Pedigree.
- Maintain decoupled path aliases (`@engine/*`, `@features/*`, `@app/*`) in `tsconfig.json` and build bundlers.

### 2.2 Shared Animal Profile Contract
- Define a canonical, schema-validated Animal Profile data contract capable of expressing:
  - Multi-species attributes (species identifier, breed, variety, registration numbers, tattoo/ear tag, microchip, RFID, color/pattern, sex, DOB, status).
  - Ancestry and lineage graph (sire ID, dam ID, extended pedigree depth, coancestry, inbreeding coefficients).
  - Phenotypic and genotypic traits (alleles, loci, carrier status, fleece/wool fiber records, physical traits).
  - Reproductive, health, weight, and production histories.
- Ensure the profile contract supports zero-loss serialization across SQLite, IndexedDB, JSON backup archives, and external exchange formats.

### 2.3 Universal CSV & Tabular Importer
- Enhance the universal CSV importer engine to provide:
  - Resilient header normalization and fuzzy column mapping for third-party herd management exports.
  - Multi-species auto-detection based on column heuristics and breed names.
  - Previewing, conflict resolution, and dry-run validation prior to database commit.
  - Robust date parsing supporting international formats and Excel serial timestamps.

### 2.4 Scaffold Preparation & Multi-Platform Native Storage Bridges
- Establish non-destructive starter directories and clean TypeScript interfaces:
  - Storage adapter abstraction (`src/engine/storage/`) for swappable backends (`SQLite WASM`, `OPFS`, `IndexedDB`, and native bridge storage) plus portable JSON/binary export and restore.
  - Platform bridge and capability detection (`src/engine/bridge/`) unifying browser, Android WebView, and future Apple/desktop shells with safe fallbacks.
  - **iOS Native SQLite Routing:** On iOS (`WKWebView` / Safari shells), WebKit purges browser-managed `IndexedDB` and `localStorage` after 7 days of inactivity or memory pressure. Persistence MUST route through `@engine/bridge/*` to native iOS `SQLite` / sandbox storage (`Documents/`).
  - Feature modularity (`src/features/`) and app composition (`src/app/`).
- Ensure all scaffolds are completely additive, with zero regressions against existing live modules.
- **Modularization Status (Alpha 3 Checkpoints 1–12 Verified):** Pure `@engine/primitives/*`, `@engine/storage/*`, `@engine/bridge/*` (Browser, Android WebView, iOS `WKWebView` SQLite reply contract, Electron/Tauri desktop delegates), six decoupled `@features/*` modules (`csv-importer`, `csv-exporter`, `backup-vault`, `document-export`, `ics-calendar`, `ocr-parser`), parameterized `android-wrapper/`, and `@app/*` composition wiring are verified cleanly while keeping standalone `engine` (`/engine`) package extraction deferred until full transfer readiness.
- **NEON Phases 1–2 Completed (Baseline Lock & Shared Module Decoupling):** Absorbed remaining hygiene tasks (`FLASH_HYGIENE_PLAN.md` not present) into `NEON_MODULAR_PLAN.md`; locked boot/entry checksums (`src/main.tsx`, `src/App.tsx`, `index.html`) in `improvementRegistry.ts`; documented 100% non-test module inventory in `EXTRACTION_INVENTORY.md`; extracted pure primitives (`qrCodec`, `themeColor`, `genericSync`, `genericRegistries`, `deviceCapabilityCore`, `pdfDocumentExtractor`, expanded `crypto` and `sanitization`) with zero-regression Alpha 2 compatibility facades; cleaned reusable `src/utils/*` helpers; and enforced automated zero-domain-term and import-direction boundary tests.

---

## 3. Branching Strategy & Repository Boundaries

### 3.1 Core Pedigree Dedicated Branch
- **Dedicated Branch in `ask-kim/pedigree`:** Core Pedigree development will reside on its dedicated branch inside the `ask-kim/pedigree` repository for the foreseeable future.
- All active Alpha 3 feature development, stabilization, and test maintenance take place within this dedicated branch.
- **Preserve Active Boot Testing:** Hydrogen is currently conducting active boot testing; do not alter active boot/entry initialization or overwrite work tied to ongoing boot testing.

### 3.2 Independent Repositories for Future Applications
- Future applications built on the underlying framework or intended for different domains will live in their own dedicated, separate repositories.
- No monorepo sprawl or unrelated domain projects will be colocated inside `ask-kim/pedigree`.

---

## 4. Future Framework Extraction Strategy

- **Defer Standalone `engine` Creation Until Full Modularity:** Standalone creation/extraction of `engine` (`/engine`) is deferred until full modularity is achieved across the codebase, ensuring `engine` is equally modular from inception, needs no later rewrite, and avoids naming collision with the upcoming Core Pedigree release.
- **Extraction Prior to Transfer:** Before any future transfer of `ask-kim/pedigree` to another maintainer, organization, or team, all shared, content-agnostic framework code will be cleanly extracted into independent packages or repositories.
- **Zero Downstream Dependency on `/pedigree`:** Other applications must never depend on the `ask-kim/pedigree` repository directly. The extracted framework will provide independent storage adapters, offline synchronization, platform bridge contracts, and PWA packaging utilities.
- **Clean Handoff:** Once extracted, `ask-kim/pedigree` will retain only the Pedigree-specific domain logic, schemas, and UI, ensuring a pristine handoff for pedigree community maintainers.

---

## 5. Explicit Guardrails: Protection of Alpha 2 Baseline Features

To ensure project stability and maintain user trust, development during Alpha 3 and beyond is subject to the following non-negotiable guardrails:

1. **No Unrequested Rewrites of Working Baseline Code:**
   - Established Alpha 2 features—including offline storage, genetics calculations, barn chores, breeding calendar, PDF/certificate generation, OCR scanning, and native Android bridges—are battle-tested and operational.
   - Refactoring working Alpha 2 code without explicit user instruction is prohibited. Architecture enhancements must be additive and phased.
2. **Never Convert Core PWA Away From React:**
   - The core PWA (`/src/`, `/index.html`, `/vite.config.ts`, `/package.json`) must remain in React + Vite + TypeScript. Android wrapper (`android-wrapper/`) is strictly a hybrid WebView shell; core application logic must never be migrated to Kotlin, Jetpack Compose, or another UI framework.
3. **Protected Staging Isolation (`/import/`):**
   - The `/import/` directory is read-only staging. Files within `/import/` must never be executed, bundled, or imported into the main application without explicit user consent.
4. **Automated Drift Verification:**
   - All code invariants registered in `src/domain/improvementRegistry.ts` must pass via `npm run verify:improvements` on every update.
5. **Zero Token Waste & Terse Engineering:**
   - Follow all token limits, circuit breakers, and strict TypeScript rules defined in `prompts/master_system_prompt.md`.

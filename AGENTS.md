# Agent Instructions: Community Pedigree Project

**Last-Edited Timestamp:** 2026-11-24

<SYSTEM_RULES_DIRECTIVE>
Before reading code, answering questions, or proposing edits, read and strictly follow all binding rules, token-spend limits, and coding invariants in `prompts/master_system_prompt.md`.
</SYSTEM_RULES_DIRECTIVE>

---

## 0. AI Studio GitHub Import Fast-Boot & Compact Output

When initializing or importing this repository into AI Studio (boot-to-ready with no requested app feature edits):
- **Keep Master Prompt Mandatory:** Always read `prompts/master_system_prompt.md` first (required).
- **Pre-Configured Runtime Facts (Skip Discovery Scans):**
  - Runtime/Stack: Web (`Node.js` + `npm` via `.npmrc` `legacy-peer-deps=true`, `audit=false`, `fund=false`). Core app is a React + Vite + TypeScript PWA (`src/main.tsx`); `android-wrapper/` is strictly a thin hybrid WebView shell.
  - Server/Env: `vite.config.ts` is already configured for `0.0.0.0:3000`, `base: '/'`, `hmr: false`, and `watch: null`. Storage uses client-side `sql.js`/IndexedDB with zero backend database and zero required env vars—do **not** scan `src/` for `process.env` or `import.meta.env` (create `.env.example` with `# No required environment variables.` only if missing).
- **Fast-Boot Skip List (Faster Working State):**
  - Do **not** read `ARCHITECTURE.md`, `ROADMAP.md`, `IMPROVEMENTS.md`, `EXTRACTION_INVENTORY.md`, `android-wrapper/`, `docs/`, `export/`, or `import/` on initial import.
  - Run **only** `install_applet_dependencies` and `compile_applet` to bring up port `3000`. Do **not** run `npm test`, `npm run lint` (`tsc --noEmit`), or `npm run verify:improvements` on import-only boot unless `compile_applet` or dev startup fails (reserve full test/lint/invariant suites for turns that modify code).
- **Minimal Initial Screen Output:**
  - Suppress multi-line migration checklists, bulleted stack summaries, and postmortems. On clean GitHub import / boot-to-ready, output **only**:
    `ALIGNED`
    `Ready: Community Pedigree (port 3000).`

---

## 1. System Rules Directive & Canonical References

- **Canonical Rules File:** `prompts/master_system_prompt.md` (do not delete, move, or edit without explicit confirmation from the user).
- **Release & Branch Context:** Alpha 2 (`0.1.0-alpha.2`) is released; current development is active Alpha 3 (`0.1.0-alpha.3`) modularity on a dedicated Core Pedigree branch inside `ask-kim/pedigree`. Unrelated future apps live in separate repositories, and shared content-agnostic framework code (`@engine/*`, reusable `@features/*`) will be extracted into standalone `engine` (`/engine`) before any future transfer of `/pedigree`. Defer creating standalone `engine` (`/engine`) until full modularity is achieved across the codebase (so `engine` is equally modular, needs no subsequent rewrite, and stays distinct from the upcoming Core Pedigree release).
- **Boot Testing & Initialization Guardrail:** Hydrogen is currently conducting boot testing after an initial boot error appeared post-Hydrogen run. Do NOT alter active boot/entry initialization or overwrite work tied to Hydrogen's boot test unless explicitly safe and isolated.
- **Architecture & Recovery Reference:** Consult `ARCHITECTURE.md`, `android-wrapper/README.md`, `ROADMAP.md`, and `IMPROVEMENTS.md` only when relevant to code-editing tasks (skip on initial AI Studio boot).
- **Token Discipline & Terse Execution:** Prioritize direct tool execution over conversational prose. Do not output verbose preambles, apologies, or speculative commentary.

---

## 2. Critical Rule: Core PWA MUST Always Stay in React

- **Never Convert PWA Away From React (Core PWA MUST Always Stay in React / Hybrid Wrapper Boundary):**
  - The core application / PWA (`/src/`, `/index.html`, `/vite.config.ts`, `/package.json`) MUST NEVER be converted, rewritten, or migrated away from **React + Vite + TypeScript**—not to Kotlin, Jetpack Compose, vanilla HTML/JS, or any other framework—even during GitHub import triage, bootability recovery, emergency fixes, or refactors.
  - `/android-wrapper/` creates a **hybrid packaging situation**: it is **ONLY a thin native Android WebView shell** (Kotlin + Gradle) that serves the compiled React PWA (`dist/` copied into `assets/www/`) and exposes narrow native bridges (printing, file export, native backup vault, back button).
  - If the app fails to boot or fails to compile after a GitHub import/upgrade, **diagnose and fix the React + Vite + TypeScript PWA directly**—NEVER recode the site in Kotlin.

---

## 3. The Three-Layer Architectural Boundary

To ensure long-term modularity, clean extraction, and test isolation, the codebase adheres to a strict three-layer boundary:

### 3.1 Content-Agnostic Core Layer
- **Location & Alias:** `src/engine/` (`@engine/*`). The word "core" is intentionally avoided in code and layer names (reserved for the upcoming Core Pedigree brand).
- **Domain Independence:** Must contain **zero livestock or pedigree terms** (no references to animals, breeds, litters, pedigrees, herds, ear tags, or barn chores).
- **Responsibilities:** Generic storage adapters, platform bridge contracts, device capability detection, binary encoding/decoding, cryptographic hashing and encryption, P2P/LAN synchronization protocols, and utility helpers.
- **Portability:** Designed to be extracted into standalone libraries without downstream dependencies on `/pedigree`.

### 3.2 Reusable Feature Modules Layer
- **Location & Alias:** `src/features/` (`@features/*`).
- **Feature Isolation:** Feature modules are self-contained business units.
- **Strict Prohibition on Cross-Feature Imports:** Feature modules must **never import directly from sibling feature modules** (`@features/feature-a` must never import from `@features/feature-b`).
- **Communication:** Cross-feature interactions must occur exclusively through `@engine/*` contracts or via composition in the application layer (`@app/*`).

### 3.3 Domain & Application Layers
- **Domain Location & Alias:** `src/domain/` (`@domain/*`) — formerly `src/core/`; houses livestock/pedigree domain logic (genetics, calendars, models, importers/exporters registrations, improvement registry). May import `@engine/*`; never imported by `@engine/*` or `@features/*`.
- **Application Location & Alias:** `src/app/` (`@app/*`).
- **Responsibilities:** Assembles the content-agnostic core (`@engine/*`) with feature modules (`@features/*`).
- **Domain Logic:** Houses livestock/pedigree domain entities, multi-species configurations, phenotype/genotype definitions, breeding calendar rules, UI routing, branding, and application-level state orchestration.

---

## 4. Platform Capability Checks & Shell Fallback Behavior

### 4.1 Browser, Android WebView, Apple & Desktop Shells
The application must execute reliably across diverse host environments:
1. **Standard Modern Browsers (Chrome, Edge, Firefox, Safari):**
   - Use standard Web APIs with robust capability sniffing (`@engine/bridge/*`).
   - Primary storage: `SQLite WASM` backed by `OPFS` when available; fallback to `IndexedDB` (`IDB`) with transactional safety, quota recovery, and portable export/restore.
   - File exports: Use Web Share API (`navigator.share`) when available, falling back to programmatic `Blob` downloads.
2. **Android WebView Hybrid Shell (APK):**
   - Detect native bridge via `window.AndroidBridge` / `window.pedigreeNative`.
   - Native printing: Forward styled HTML to `PrintBridge.kt` for high-resolution offscreen rendering and system print spooling.
   - Native backup vault: Replicate encrypted/binary snapshots to native app storage (`NativeBackupVault.kt`).
   - Hardware back button: Intercept Android system back navigation via `BackNavigationBridge.kt`.
3. **Apple (iOS / macOS) & Desktop Shells (Electron / Tauri):**
   - Provide standard bridge abstractions (`@engine/bridge/*`) that native containers implement without modifying core application code.
   - Adapt feature detection for desktop windowing, local filesystem permissions, and native menus.

### 4.2 iOS Native Bridge & Native SQLite Storage Routing Guardrail
- **WebKit Eviction Vulnerability:** On iOS (`WebKit` / Safari / PWA / `WKWebView`), browser-managed storage (`IndexedDB`, Web SQL, and `localStorage`) is subject to aggressive automated eviction:
  - Apple `WebKit` automatically purges all client-side storage for sites not visited within 7 days under Intelligent Tracking Prevention (`ITP`).
  - Storage is also aggressively discarded during device memory or disk space pressure.
- **Mandatory iOS Native SQLite Routing:**
  - In any native Apple `WKWebView` wrapper or hybrid shell, persistence **must be routed through a native bridge** (`@engine/bridge/*` -> `IStorageAdapter`) to native iOS `SQLite` / app sandbox storage (`Documents/` or Application Support container) rather than relying on evictable `WebKit` storage.
  - The `@engine/storage/` adapter layer must support bridge-delegated persistence so offline registries and records survive OS eviction policies permanently.

---

## 5. Guardrails to Preserve Working Builds & Prevent Unrequested Rewrites

### 5.1 Protection of Working Alpha 2 Baseline Features
- Alpha 2 represents a tested, production-grade baseline.
- **Strict Prohibition on Unrequested Refactoring:** Agents must never refactor, restructure, or rewrite existing working modules in `src/components/`, `src/domain/`, `src/storage/`, `src/hooks/`, or `android-wrapper/` unless explicitly instructed for a specific task.
- **Additive Scaffolding:** Architectural improvements, stubs, and interfaces must be strictly additive and non-destructive.

### 5.2 Protected Staging and Isolation Policies for /import/
- **Read-Only Staging:** Agents and tooling may read from `/import/`, but MUST NEVER execute, test, serve, bundle, or import files from `/import/` without explicit user confirmation.
- **Isolation:** Contents in `/import/` are excluded from `tsconfig.json`, `vitest.config.ts`, and `vite.config.ts` so they cannot interfere with compilation or runtime execution.

### 5.3 Strict TypeScript Verification and Drift Invariants
- **No Type Escapes:** Never silence TypeScript compiler errors with `as any`, `@ts-ignore`, or `@ts-expect-error`. Resolve root types cleanly.
- **Automated Invariant Verification:** Every file modification must preserve existing invariants verified by `npm run verify:improvements`.
- **Pre-Completion Build Verification:** Run type checks (`tsc --noEmit`), test suite (`npm test`), and production build verification (`npm run build`) before declaring tasks complete.

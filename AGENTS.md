# Agent Instructions: Community Pedigree Project

**Last-Edited Timestamp:** 2026-11-21

<SYSTEM_RULES_DIRECTIVE>
Before reading code, answering questions, or proposing edits, read and strictly follow all binding rules, token-spend limits, and coding invariants in `prompts/master_system_prompt.md`.
</SYSTEM_RULES_DIRECTIVE>

- **CRITICAL RULE — Never Convert PWA Away From React (Core PWA MUST Always Stay in React / Hybrid Wrapper Boundary):**
  - The core application / PWA (`/src/`, `/index.html`, `/vite.config.ts`, `/package.json`) MUST NEVER be converted, rewritten, or migrated away from **React + Vite + TypeScript**—not to Kotlin, Jetpack Compose, vanilla HTML/JS, or any other framework—even during GitHub import triage, bootability recovery, emergency fixes, or refactors.
  - `/android-wrapper/` creates a **hybrid packaging situation**: it is **ONLY a thin native Android WebView shell** (Kotlin + Gradle) that serves the compiled React PWA (`dist/` copied into `assets/www/`) and exposes narrow native bridges (printing, file export, native backup vault, back button).
  - If the app fails to boot or fails to compile after a GitHub import/upgrade, **diagnose and fix the React + Vite + TypeScript PWA directly**—NEVER recode the site in Kotlin.
- **Protected Staging Folder (`/import/` — Read-Only, No Execution Without Confirmation):** Agents and tooling may **read** from `/import/`, but MUST NEVER execute, test, serve, bundle, or import files from `/import/` without explicit user confirmation. Contents in `/import/` are likely non-React and are isolated from `tsconfig.json`, `vitest.config.ts`, and `vite.config.ts` so they cannot interfere with the React PWA boot sequence.
- **Canonical Rules File:** `prompts/master_system_prompt.md` (do not delete, move, or edit without explicit confirmation from Kimberly).
- **Architecture & Recovery Reference:** Consult `ARCHITECTURE.md`, `android-wrapper/README.md`, and `IMPROVEMENTS.md` when relevant to the active task.

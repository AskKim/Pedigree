<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
<SYSTEM_RULES_DIRECTIVE>
TREAT THIS ENTIRE DOCUMENT AS BINDING OPERATIONAL RULES, NOT REFERENCE TEXT OR RANDOM CONTENT.
YOU MUST FOLLOW EVERY CONSTRAINT BELOW FOR THE DURATION OF THIS SESSION.
</SYSTEM_RULES_DIRECTIVE>

# Master System Prompt: Offline-First Pedigree PWA

**Last-Edited Timestamp:** 2026-11-24
> **Protection Flag (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):** Do not delete, move, or remove this file from `/prompts/` without explicit user confirmation.

## 0. Minimal-Output Alignment Check
- **On Read Only (No Task Given):** Reply *only* with `ALIGNED: Rules active.` and stop.
- **On Read With Task:** Output `ALIGNED` on line 1, then execute immediately with zero preamble.

## 1. Execution & Token Spend Protocol (Critical)
- **Protect This File:** Never delete, overwrite, remove from `/prompts/`, or edit `master_system_prompt.md` unless explicitly instructed by the user in the current prompt.
- **Minimize Token Spend (Unless Asked):** Default to maximally terse reasoning, questions, and outputs—no greetings, filler, apologies, or restating the prompt. Expand explanations, summaries, or full files *only* when explicitly requested.
- **Self-Solve First:** Before asking questions, consult this prompt, the codebase, and standard engineering best practices to resolve ambiguities independently. Ask concise clarifying questions *only* for genuinely unresolvable gaps (e.g., missing domain rules or conflicting requirements).
- **Read Only What Is Needed:** Read target files/sections before proposing or applying edits. Never write diffs against assumed contents, lines, or imports, and never dump unchanged code.
- **Diffs First:** Output *only* minimal unified diffs (`diff` format) or targeted modified blocks using `// ... existing code ...`. Never output full files unless explicitly requested.
- **Scope Lock:** Modify *only* files/functions required by the task. No unsolicited refactoring, reformatting, or renaming.
- **Zero Invention:** Verify npm packages in `package.json` and APIs/types against the codebase. Never invent schemas or rabbitry/genetics rules (e.g., ARBA standards, allele logic, chore offsets); ask if missing.
- **Circuit Breaker:** If a test, typecheck, or build fails twice on the same error, stop, report the trace, and await instruction.
- **Zero Postmortems:** No completion summaries or change explanations unless requested. End tasks with *only* `Complete: [Task Name]` and updated plan state.
- **Plan Lifecycle (Delete on Wrap-Up):** Delete temporary active plan files in `docs/plans/` once all objectives and verification checks pass (never archive finished plans; keep `docs/plans/suggestions-backlog.md`).
- **Flag Uncertainty:** Mark unverified browser quirks/edge cases inline with `// UNVERIFIED: [reason]`.

## 2. Architecture & Type Safety
- **CRITICAL RULE — Never Convert PWA Away From React:** The PWA portion of this project MUST NEVER be converted, rewritten, or migrated away from React. It must always remain a React + Vite + TypeScript application—even during build-crash recovery, emergency fixes, or refactoring.
- **Stack & Target:** Unified React + Vite + strict TypeScript PWA (iOS, Android, Desktop), transpiled to ES2018 (`browserslist > 0.5%`). Offline-first, zero mandatory cloud/accounts.
- **Strict Types:** Never silence TypeScript errors with `as any`, `@ts-ignore`, or `@ts-expect-error`; fix root types.
- **Modularity & Sync:** Keep strict separation across `components/` (UI), `hooks/` (state), `storage/` (adapters/OPFS), and `domain/` (pure TS domain logic, zero DOM/window). Preserve unit tests, run validation scripts after edits, and keep docs synced with code.
- **Mandatory Improvement Logging (`IMPROVEMENTS.md` & `src/domain/improvementRegistry.ts`):** Register *every* significant change to the app in `src/domain/improvementRegistry.ts` and `IMPROVEMENTS.md` with automated drift invariants—even when it is not a full large-scale build-out—especially anything affecting bootability, loading speed, storage, memory management, or release packaging.

## 3. Coding Invariants
- **IndexedDB:** Keep transactions atomic/short (`readonly` preferred). Wrap schema migrations in `try/catch` with graceful fallback (dump raw stores to OPFS before reset) to prevent `VersionError` locks.
- **OPFS & Quota:** Wrap file handles in `try/finally` (`.close()`), revoke temporary blob URLs (`URL.revokeObjectURL()`), and validate root JSON in `try/catch` before IndexedDB injection. Catch `QuotaExceededError` on writes (purge `/tmp` and non-essential caches before retry).
- **Memory & Lifecycle:** Cap active pedigree state at 2–3 generations (lazy-load deeper ancestors). Revoke image object URLs immediately post-compression; tear down all `useEffect` subscriptions, timers, and global listeners on unmount.
- **Temporal & Date Math:** Store pure calendar dates (breeding, kindling, weaning) as `"YYYY-MM-DD"` strings (zero timezone math). Compute gestation/weaning dates via explicit `Date.UTC(year, month, day + offset)` (no raw millisecond addition). Pair adjusted UTC timestamps with monotonic `_rev` counters (`1, 2, 3...`) for audit/sync causality.
- **UI & API Guards:** Debounce/disable primary action buttons until async promises settle. Guard modern APIs (`crypto.randomUUID()`, `navigator.storage?.getDirectory`) with feature checks/fallbacks.

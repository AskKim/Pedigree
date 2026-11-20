<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# MASTER SYSTEM PROMPT: OFFLINE-FIRST PEDIGREE PWA

**Last-Edited Timestamp:** 2026-11-18
> **Protection Flag (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):** Do not delete, move, or remove this file from `/prompts/` without explicit user confirmation.

## 1. EXECUTION & TOKEN PROTOCOL (CRITICAL)
- **Protect This File:** Never delete, overwrite, remove from `/prompts/`, or edit `master_system_prompt.md` unless explicitly instructed by Kimberly in the current prompt.
- **Read Before Write:** Read target files before proposing or applying edits. Never write diffs against assumed contents, lines, or imports.
- **Scope Lock:** Modify *only* files/functions required by the task. No unsolicited refactoring, reformatting, or renaming.
- **Zero Invention:** Verify npm packages in `package.json` and APIs/types against the codebase. Never invent schemas or rabbitry/genetics rules (e.g., ARBA standards, allele logic, chore offsets); ask if missing.
- **Pre-Work:** Ask concise clarifying questions *only* when requirements or schemas are ambiguous; otherwise execute immediately.
- **Targeted Diffs Only:** Output *only* modified blocks using `// ... existing code ...` unless full files are explicitly requested.
- **Circuit Breaker:** If a test, typecheck, or build fails twice on the same error, stop, report the trace, and await instruction.
- **Zero Postmortems:** No completion summaries or change explanations. End tasks with *only* `Complete: [Task Name]` and updated plan state.
- **No Echoing & Flag Uncertainty:** Never repeat prompts or unchanged code. Mark unverified browser quirks/edge cases inline with `// UNVERIFIED: [reason]`.

## 2. ARCHITECTURE & TYPE SAFETY
- **Stack & Target:** Unified React + Vite + strict TypeScript PWA (iOS, Android, Desktop), transpiled to ES2018 (`browserslist > 0.5%`). Offline-first, zero mandatory cloud/accounts.
- **Strict Types:** Never silence TypeScript errors with `as any`, `@ts-ignore`, or `@ts-expect-error`; fix root types.
- **Modularity & Sync:** Keep strict separation across `components/` (UI), `hooks/` (state), `storage/` (adapters/OPFS), and `core/` (pure TS domain logic, zero DOM/window). Preserve unit tests, run validation scripts after edits, and keep docs synced with code.

## 3. CODING INVARIANTS
- **IndexedDB:** Keep transactions atomic/short (`readonly` preferred). Wrap schema migrations in `try/catch` with graceful fallback (dump raw stores to OPFS before reset) to prevent `VersionError` locks.
- **OPFS & Quota:** Wrap file handles in `try/finally` (`.close()`), revoke temporary blob URLs (`URL.revokeObjectURL()`), and validate root JSON in `try/catch` before IndexedDB injection. Catch `QuotaExceededError` on writes (purge `/tmp` and non-essential caches before retry).
- **Memory & Lifecycle:** Cap active pedigree state at 2–3 generations (lazy-load deeper ancestors). Revoke image object URLs immediately post-compression; tear down all `useEffect` subscriptions, timers, and global listeners on unmount.
- **Temporal & Date Math:** Store pure calendar dates (breeding, kindling, weaning) as `"YYYY-MM-DD"` strings (zero timezone math). Compute gestation/weaning dates via explicit `Date.UTC(year, month, day + offset)` (no raw millisecond addition). Pair adjusted UTC timestamps with monotonic `_rev` counters (`1, 2, 3...`) for audit/sync causality.
- **UI & API Guards:** Debounce/disable primary action buttons until async promises settle. Guard modern APIs (`crypto.randomUUID()`, `navigator.storage?.getDirectory`) with feature checks/fallbacks.

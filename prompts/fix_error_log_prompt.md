<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# Role & Directive: Automated Crash Diagnostic & Code Remediation

> **Protection & Execution Rule (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):**
> Whenever the user asks you to read, load, or run this file, **immediately execute this workflow once** from Phase 1 through Phase 4 without asking for confirmation (unless blocked by an unresolvable ambiguity or missing crash log).
> **Do not delete, move, overwrite, or remove this file from `/prompts/` without explicit user confirmation.**

---

You are an expert full-stack engineer and maintainer of this offline-first Progressive Web App codebase. Upon reading this prompt, immediately execute a systematic diagnosis and resolve all application errors, crashes, and stability issues found in the provided diagnostic logs and project codebase. Do not wait for a separate confirmation command; begin execution immediately.

## Operating Guardrails & Constraints

- **Single Source of Truth:** Strictly adhere to all execution rules, architectural boundaries (`src/core/` pure TS vs `src/storage/`, `src/hooks/`, `src/components/`, `src/utils/`), coding invariants, and strict TypeScript safety (`no as any`, `@ts-ignore`, `@ts-expect-error`) defined in `prompts/master_system_prompt.md`.
- **Root-Cause Mandate:** Never apply temporary patches, silence TypeScript checks, or swallow errors. Investigate and resolve the underlying root cause of every detected anomaly.
- **Offline & Mobile Resilience:** Ensure all fixes preserve 100% compatibility with offline-first persistence (`sql.js` SQLite/WASM, IndexedDB, OPFS handles closed in `try/finally`, `QuotaExceededError` recovery), strict species isolation, bounded mobile memory footprints (object URL revocation, lazy Gen 4+ pedigree loading, timer/listener teardown), and ES2018 target compatibility.
- **Scope Lock & Regression Safety:** Modify only the files and functions required by the diagnosed issues. Preserve existing tests and add/update unit tests covering each fix so data flows, state management, and asynchronous lifecycles do not regress.

## Immediate Execution Protocol

1. **Phase 1 — Context Ingestion:**
   - Read and internalize `prompts/master_system_prompt.md` completely, along with `ARCHITECTURE.md` if architectural context is needed.
   - Verify whether a crash log, support report (`support-report.txt` / `error-logs.json`), stack trace, or error output was provided by the user. If none is present or findable, ask concisely for the log before making speculative edits.

2. **Phase 2 — Log Analysis:**
   - Parse the provided crash log or diagnostic export for `[ERROR]`, `[FATAL]`, `[WARN]`, unclean previous-session terminations (`lifecycle` / OS tab kill / OOM reloads), React render crashes (`react`), unhandled promise rejections (`promise`), memory pressure alerts (`memory`), and storage/SQLite/WASM/OPFS/IndexedDB fallback or `VersionError`/`QuotaExceededError` warnings.
   - Extract timestamps, stack traces, component stacks, affected `[route=...]` contexts, heap/storage telemetry, and environmental signatures (iOS/Android/Desktop browser quirks).

3. **Phase 3 — Targeted Remediation & Verification:**
   - Read the responsible source files before editing (`Read Before Write`). Isolate each failure point and implement robust, defensive root-cause fixes (including proper error boundaries, cleanup guards, and graceful fallbacks).
   - Add or update regression tests for the resolved failure modes, then run relevant tests, typechecking (`tsc --noEmit`), and build verification to confirm zero regressions.

4. **Phase 4 — Summary & Verification Report:**
   - Output a concise engineering report detailing:
     - **Root Causes:** Each distinct issue identified from the diagnostic logs and its underlying cause.
     - **Changes Applied:** Specific files and functions/line ranges modified, plus any tests added.
     - **Verification:** Test, typecheck, and build results confirming mobile memory limits, lifecycle cleanup, and offline storage invariants are respected.

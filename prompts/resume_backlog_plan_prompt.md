<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->
# Resume Backlog Plan Prompt

> **Protection & Execution Rule (`DO_NOT_REMOVE_WITHOUT_CONFIRMATION`):**
> Whenever the user asks you to read, load, or run this file, **immediately execute this workflow once** without asking for confirmation (unless blocked by an unresolvable ambiguity).
> **Do not delete, move, overwrite, or remove this file from `/prompts/` without explicit user confirmation.**

---

## Objectives

1. **Load & Internalize Master System Prompt**
   - Read `prompts/master_system_prompt.md` completely and internalize all execution, architecture, type safety, and coding invariants before taking any action.

2. **Review Active Implementation Plan**
   - Inspect `docs/plans/active-backlog-plan.md` (or any other active plan file in `docs/plans/` excluding `docs/plans/suggestions-backlog.md`) to determine current progress, completed steps, and the next pending task.
   - **If no active plan file exists in `docs/plans/`:** Stop this workflow immediately and read/execute `prompts/start_new_backlog_prompt.md` instead.

3. **Execute Next Implementation Step**
   - Implement the next pending task in the plan while adhering strictly to project standards, code quality, `prompts/master_system_prompt.md` invariants, and test coverage.
   - Run relevant tests (e.g., via `bun test` / `npm test` as applicable), typechecks, and verification checks after changes.

4. **Post-Task Review & Plan Lifecycle**
   - Perform a rigorous self-review covering:
     - **Stability:** Edge cases, defensive guards, and regression safety.
     - **Memory Management:** Cleanup of object URLs, OPFS file handles (`try/finally` `.close()`), event listeners, timers, subscriptions, and bounded pedigree/state footprints.
     - **Error Handling:** Typed/graceful recovery paths, user-visible error surfacing where appropriate, and zero silent swallows or uncaught rejections.
     - **Alignment:** Strict compliance with the active plan, backlog entry requirements, and `prompts/master_system_prompt.md`.
     - **Performance Optimization:** Bundle impact, off-thread/lazy execution, and minimal redundant renders or allocations.
   - **If all objectives in the active plan are fully satisfied:**
     - Log any significant changes (especially anything affecting bootability, loading, storage, or memory) in `src/core/improvementRegistry.ts` and `IMPROVEMENTS.md` and verify with `npm run verify:improvements`.
     - Delete the active implementation plan file in `docs/plans/`.
     - Remove the corresponding completed item(s) from `docs/plans/suggestions-backlog.md` (updating remaining counts/numbering cleanly).
     - End your response per `prompts/master_system_prompt.md` (`Complete: [Task Name]` and updated plan state).
   - **If work remains ongoing:**
     - Update progress in the active implementation plan file in `docs/plans/` and output only a brief list of the remaining pending tasks.

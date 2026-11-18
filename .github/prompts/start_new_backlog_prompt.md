# Start New Backlog Item Prompt

> **Protection & Execution Rule:**
> Whenever the user asks you to read, load, or run this file, **immediately execute this workflow once** from Step 1 through Step 6 without asking for confirmation (unless blocked by an unresolvable ambiguity).
> **Never delete, overwrite, or remove this file** unless explicitly instructed to do so.

---

## Objectives

1. **Load & Internalize Master System Prompt**
   - Read `docs/prompts/master_system_prompt.md` completely and internalize all execution, architecture, type safety, and coding invariants before taking any action.

2. **Select First Priority Backlog Entry**
   - Open `docs/plans/suggestions-backlog.md` and select the first (highest-priority) remaining entry.

3. **Develop Implementation Plan**
   - Draft a concrete implementation plan at `docs/plans/active-backlog-plan.md` for the selected backlog entry.
   - If any architectural blocks or ambiguities arise that cannot be resolved using `docs/prompts/master_system_prompt.md` or industry best practices, use the interactive questions dialog (`ask_question`) to clarify with the user.
   - Do **not** pause for plan confirmation before proceeding when no unresolvable blocks exist.

4. **Execute Implementation Plan**
   - Implement the plan end-to-end while adhering strictly to all rules in `docs/prompts/master_system_prompt.md` (including Read-Before-Write, Scope Lock, strict TypeScript, offline-first invariants, and preserving/updating tests).

5. **Rigorous Post-Completion Review**
   - Once implementation is complete, perform a thorough audit across all five dimensions and verify with tests, typecheck, and build:
     - **Stability:** Error handling, edge cases, recovery paths, and zero uncaught rejections or UI wedges.
     - **Optimization:** Bundle size, off-thread/lazy loading, rendering efficiency, and minimal redundant work.
     - **Sanity:** Schema/type consistency, clean modular boundaries (`core/` vs `storage/` vs `hooks/` vs `components/`), and adherence to existing conventions.
     - **Memory Management:** Cleanup of object URLs, OPFS file handles (`try/finally` `.close()`), event listeners, timers, subscriptions, and bounded pedigree/state footprints.
     - **Objective Alignment:** Full satisfaction of the selected backlog item's requirements and zero unintended scope drift.

6. **Finalize & Clean Up**
   - Once all objectives and verification checks pass:
     - Delete `docs/plans/active-backlog-plan.md`.
     - Remove the completed item(s) from `docs/plans/suggestions-backlog.md` (updating remaining counts/numbering cleanly).
     - End your response per `docs/prompts/master_system_prompt.md` (`Complete: [Task Name]` and updated plan state).

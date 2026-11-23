<!-- READ_ONLY_NO_EXECUTE_WITHOUT_CONFIRMATION: true -->
<IMPORT_FOLDER_DIRECTIVE>
READ-ONLY STAGING DIRECTORY — DO NOT EXECUTE WITHOUT EXPLICIT CONFIRMATION.
</IMPORT_FOLDER_DIRECTIVE>

# `/import/` — Read-Only Staging Folder

**Status Flag:** `READ_ALLOWED` | `EXECUTE_REQUIRES_CONFIRMATION`

## Policy
1. **Reading Allowed:** Humans and agents may read, inspect, and reference files inside `/import/` (for example, to port domain logic or inspect reference implementations).
2. **No Execution Without Explicit Confirmation:** Do **NOT** execute, run, test, eval, compile, bundle, serve, or import anything from `/import/` (including shell scripts, Node/Python/Bun scripts, binaries, HTML entrypoints, or JS/TS modules) unless the user gives explicit confirmation in the current prompt.
3. **Non-React / Boot Sequence Isolation:** Contents placed in `/import/` are likely **not React** and must **never** be wired into `index.html`, `src/main.tsx`, Vite module resolution, TypeScript compilation (`tsconfig.json`), or Vitest test discovery (`vitest.config.ts`). The live PWA boot sequence must remain strictly the React + Vite + TypeScript app in `/src/`.

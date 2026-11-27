# Reusable Pre-Flight Pre-Release Accessibility Check

**Last Updated:** November 25, 2026, 10:55 PM CST **Execution & Standalone Mode:** Phase A (AI Studio) \[REUSABLE\] in pf-launcher-uni.md; runnable standalone.

- **Step ID:** a11y-check  
- **Phase & Lifecycle:** Phase A (ai-studio) \[REUSABLE\]  
- **Allowed Diff Scope:** Changed UI/ARIA/CSS/HTML diff files only (bounded-read \<= 256 KB/file; never scan full trees)  
- **Companion Readme:** `prompts/preflight/run-uni/read/a11y-check-readme.md`  
- **Log Entry:** `{ "step_id": "a11y-check", "branch": "<branch-name>", "version": "<version-tag>", "head_sha": "<HEAD|sandbox-uncommitted>", "platform": "ai-studio", "status": "completed", "completed_at": "<YYYY-MM-DDTHH:MM:SSZ>", "touched_files": [] }`

# 1\. Pre-Flight & Pre-Release Accessibility Verification

- **Document, Landmarks & Headings:** Verify `<html lang>`, route `<title>`, `<header>`/`<nav>`/`<main>`/`<footer>`, `#main-content` skip link, sequential `<h1>`–`<h6>` order, semantic lists (`<ul>`/`<ol>`), and `aria-labelledby` regions.  
- **Native Controls & Keyboard Flow:** Native `<button type="button">`, `<a href>`, `<input>`, `<select>` (zero `<div onClick>` or `href="#"`), `Tab`/`Shift+Tab`/`Enter`/`Space`/`Escape` order, and zero positive `tabIndex`.  
- **Focus, ARIA, Forms & Live Regions:** High-contrast `:focus-visible` rings, modal/drawer focus trap and trigger restoration, accessible names (`aria-label`/visible text), decorative icons `aria-hidden="true" focusable="false"`, `<label for>` \+ `aria-describedby`/`aria-invalid`, and polite `aria-live="polite"` / `role="status"` announcements without focus theft.  
- **Contrast, Touch Targets, Reflow & Print:** WCAG AA contrast \+ `@media (forced-colors: active)`, \>=44×44px touch targets, non-color status cues, meaningful `alt` text \+ `aria-expanded`/`aria-selected` tree states, 320px/200% zoom reflow without horizontal scroll, `@media (prefers-reduced-motion: reduce)`, and `@media print` layout.  
- **Diff-Scoped Execution & Sandbox Fallback:** Inspect `git diff --stat <release-branch>..<branch-name>` and read only changed UI/ARIA/CSS hunks (skipping files \> 256 KB). If in browser-based AI Studio without CLI or live `<live-url>` access, inspect active changed source files directly and defer live-URL viewport/zoom checks to Phase B (`release-check-p2` / `release-plan`).  
- **Atomic Logging & Exit Contract:** Append completion entry to `docs/handoff-state.json` (clearing `last_error: null`) and print `OK [a11y-check] files=<count>` on pass, or revert step-touched files and print `STEP_BLOCKED [a11y-check]: <1-2 line reason> | Reverted: <files> | Resume: fix issue and re-run launcher.` on fail. Keep total length compact (\<= 42 lines).  
- 
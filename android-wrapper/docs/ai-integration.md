# AI Integration & AI-Friendly Codebase Notes

## 1. Android APK (`android-wrapper/`): Zero AI SDKs

The compiled Android APK (`android-wrapper/`) includes **no AI SDKs, no network LLM calls, and no API keys**. It runs 100% offline.

## 2. AI Studio Companion Hub (`server.ts`)

During development inside AI Studio, `server.ts` provides an optional `/api/ai/generate` endpoint powered by `@google/genai` (`gemini-4-hydrogen`) so developers can draft or polish Markdown documentation in `/docs`. All calls execute server-side using `process.env.GEMINI_API_KEY` with input bounds, request deduplication, and an in-memory LRU cache.

## 3. Guidelines for AI Coding Assistants Modifying This Repo

If an AI assistant is asked to adapt or extend **PWA Wrapper**:
1. Read [`README.md`](../README.md), [`DATA_MAP.md`](../DATA_MAP.md), [`PRIVACY.md`](../PRIVACY.md), and [`docs/wrapper-scope-and-compatibility.md`](./wrapper-scope-and-compatibility.md) first.
2. Never add `addJavascriptInterface` or proprietary Google Play Services dependencies to `android-wrapper/`.
3. Never mutate `app_webview/` from Kotlin code.
4. Do not modify files under `ready for export/` unless explicitly preparing a new `AskKim/Pedigree` export; after TypeScript edits in `src/`, run `npm test && npm run lint`.

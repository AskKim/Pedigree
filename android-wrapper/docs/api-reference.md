# Bridge & Companion API Reference

This document covers both:
1. **The Native Bridge Contract (`pedigreeBridge.ts` <-> `MainActivity.kt`)** used inside the Android APK.
2. **The AI Studio Companion Docs Server (`server.ts`)** endpoints used in this workspace preview.

---

## 1. TypeScript Bridge API (`src/native/pedigreeBridge.ts`)

Import the singleton:
```ts
import { pedigreeBridge } from './native/pedigreeBridge';
```

| Method | Purpose | Native Envelope Sent | Browser Fallback |
| --- | --- | --- | --- |
| `getPlatform()` | Returns `'android' \| 'ios' \| 'web'` | — | `'web'` |
| `isNativeWrapper()` | Returns `true` when wrapped | — | `false` |
| `registerBackHandler(fn, priority)` | Registers LIFO back handler | Responds to `NATIVE_BACK` with `NATIVE_BACK_RESULT` | Use browser `popstate` |
| `exportOrShareBinary(opts)` | Saves (SAF) or shares (`FileProvider`) bytes | `BEGIN_BINARY_TRANSFER` + `ArrayBuffer` | `navigator.share` or Blob `<a download>` |
| `requestPrint()` | Prints or saves page as PDF | `REQUEST_PRINT` | `window.print()` |
| `openExternalUrl(url, purpose)` | Opens `https:` or `mailto:` safely | `OPEN_EXTERNAL_URL` | `<a target="_blank" rel="noopener noreferrer">` or `mailto:` |
| `openNativeDevPanel()` | Opens native Diagnostics Dialog | `OPEN_DEV_PANEL` | Returns `false` |
| `getNativeContainerInfo(400)` | Queries WebView version, OPFS support, vault stats | `GET_CONTAINER_INFO` -> `CONTAINER_INFO_RESULT` | Resolves `null` |
| `syncBackupSnapshotToNative(snap)` | Mirrors backup to `filesDir/pedigree-vault/` | `SYNC_BACKUP_SNAPSHOT` + `ArrayBuffer` | Resolves `false` |

---

## 2. Companion Docs Server Endpoints (`server.ts`, Dev Only)

All workspace preview endpoints are served at `https://<your-domain>/api`:

- `GET /api/docs` — Lists all markdown files in `/docs`.
- `GET /api/docs/:filename` — Reads a specific `/docs/*.md` file (path-traversal guarded).
- `POST /api/docs` — Creates or updates a markdown file in `/docs` (`{ filename, content }`).
- `DELETE /api/docs/:filename` — Deletes a markdown file in `/docs`.
- `POST /api/ai/generate` — Server-side Gemini doc generation/polishing (`{ prompt, currentContent?, mode }`).

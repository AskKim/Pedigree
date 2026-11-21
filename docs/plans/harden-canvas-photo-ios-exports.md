# Implementation Plan: Harden Canvas Dimensions, Photo Cleanup & iOS Standalone PWA Exports

**Status:** Complete  
**Created:** 2026-11-21

## Hard Exclusions (Must Preserve)
- NO server-side storage of user information.
- NO community sales board or marketplace features.
- NO new encryption features (`encryptedExport.ts` / `passphraseCrypto.ts` untouched).
- NO PDF layout redesign (`barnBinder.ts` / PDF layout geometry untouched).
- Strict TypeScript (`tsc --noEmit`, zero `as any` / `@ts-ignore` / `@ts-expect-error`).
- Keep `src/core/` 100% pure TypeScript with zero DOM/`window` dependencies.

## Progress Checklist
- [x] Step 1: Inspect `webImageOptimizer.ts`, `photoHydration.ts`, `imageOptimizationSpec.ts`, `AnimalPhotoGallery.tsx`, `webFileActions.ts`, `PrintPreviewModal.tsx`, and related canvas/share callers.
- [x] Step 2: Add pure canvas area ceiling (`<= 16,000,000` px / `<= 3,000,000` px constrained) and DPR cap (`Math.min(2, dpr)` / `1` constrained) helpers in `src/core/imageOptimizationSpec.ts`.
- [x] Step 3: Harden `src/storage/webImageOptimizer.ts` (and canvas callers `webPdfActions.ts`, `deviceCapabilityDetector.ts`, `feedTagOcr.ts`, `pedigreeOcrScanner.ts`) with `probeOffscreenCanvas2dSupport()` (`typeof OffscreenCanvas !== 'undefined'` + `new OffscreenCanvas(1, 1).getContext('2d')`) + main-thread fallback, `releaseCanvas` in `finally` blocks (`width = 1; height = 1; clearRect(0, 0, 1, 1); width = 0; height = 0`), area ceiling enforcement, and sequential photo compression.
- [x] Step 4: Harden `src/storage/photoHydration.ts` and `src/components/AnimalPhotoGallery.tsx` with sequential photo hydration, `blob:` URL revocation on replacement/trim/delete/animal-switch/unmount, and visible error handling instead of unhandled rejections or silent catches.
- [x] Step 5: Harden `src/utils/webFileActions.ts`, `src/storage/localSyncChannels.ts`, `src/components/PrintPreviewModal.tsx`, and callers for iOS/standalone PWA exports (`navigator.canShare({ files: [file] })` + `navigator.share({ files: [file] })` without `title`/`text`/`url`, clean `AbortError` handling, safe delay before `blob:` URL revocation on anchor fallback, and visible error surfacing).
- [x] Step 6: Add/update unit tests and run `npm test` and `npm run lint`.

## Verification Results
- `npm run lint` (`tsc --noEmit`): 0 errors.
- `npm test`: 64/65 files passed, 406/407 tests passed (including all `imageOptimizationSpec.test.ts`, `photoHydrationAndWorker.test.ts`, `printPreviewFileActions.test.ts`, `deviceCapability.test.ts`); 1 pre-existing unrelated failure in `src/core/__tests__/p2pSyncProtocol.test.ts`.


# Deployment & APK Build Guide

## 1. Building Android APKs via GitHub Actions (Recommended)

The CI workflow `.github/workflows/build-android-apk.yml` builds both the PWA bundle and the Android Debug & Release APKs automatically on Ubuntu runners:

1. Runs `npm ci`, `npm test`, `npm run lint`, and `npm run build`.
2. Copies `dist/` into `android-wrapper/app/src/main/assets/www/`.
3. Decodes the release keystore if GitHub Secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) are configured.
4. Runs `gradle assembleDebug assembleRelease --no-daemon` inside `android-wrapper/`.
5. Uploads `community-pedigree-debug-apk` and `community-pedigree-release-apk` artifacts.

For step-by-step release keystore setup and real-device testing checklists, see [Beginner Phase 5 Implementation Plan](./beginner-phase-5-implementation-plan.md).

---

## 2. Running the AI Studio Companion Docs Hub

To build and run the AI Studio companion documentation preview (`server.ts` + `src/App.tsx`):

```bash
npm run build
npm start
```

### Environment Variables (`.env.example`)
- `GEMINI_API_KEY`: Optional; only used by `server.ts` `/api/ai/generate` in the AI Studio preview. Never bundled into `android-wrapper/`.
- `PORT`: Optional server port (defaults to `3000`).

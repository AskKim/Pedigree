# How to Create a GitHub Release (Now & After Updating)

> **Golden Rule:** You do **not** need to rename your `release` branch to create a release.
> - A **branch** (like `main` or `release`) is a moving line of work.
> - A **tag / GitHub Release** (like `v0.1.0-alpha.1`) is a permanent frozen snapshot of a branch at one moment in time. Even after you update the `release` branch later, your saved release stays frozen forever under **Releases**.

---

## Part 1: Creating a Release RIGHT NOW (Before Updating an Older Branch)

Use this method when the branch you want to freeze (for example, an older `release` branch holding Alpha.1) does **not** yet have the newer `.github/workflows/release.yml` workflow file on it.

1. Open your repository on GitHub (`AskKim/Pedigree`).
2. On the right-hand sidebar, click **Releases** (or go to the **Releases** tab), then click **Draft a new release**.
3. Click **Choose a tag**.
4. Type the version name — for example: **`v0.1.0-alpha.1`** — and click **Create new tag: v0.1.0-alpha.1 on publish**.
5. Right next to the tag box, click **Target** and change it from `main` to **`release`** *(or whichever branch you want to snapshot)*.
   - *Double-check this dropdown!* Setting **Target** to `release` ensures GitHub snapshots the `release` branch, not `main`.
6. Enter a **Release title** (for example: `Community Pedigree v0.1.0-alpha.1`).
7. *(Optional)* Click **Generate release notes** to auto-fill a list of changes, or write a short note of your own.
8. If this is an alpha, beta, or test version, check **Set as a pre-release** near the bottom.
9. Click the green **Publish release** button.

Your Alpha.1 version is now permanently saved on GitHub's **Releases** page with downloadable source `.zip` / `.tar.gz` archives!

---

## Part 2: Creating a Release AFTER Updating (Automated Workflow Method)

Once a branch has `.github/workflows/release.yml` (which `main` already has, and `release` will have after you update it from `main`), GitHub Actions automatically verifies cross-file version alignment, runs tests/lint/builds, packages **both** the PWA `.zip` + `.sha256` and the thin Android WebView `.apk` + `.sha256` files, creates the tag, and publishes them together on the GitHub Release.

### Option A: One-Click Release From Any Branch (Recommended — No Terminal Needed)
1. Open your repository on GitHub and click the **Actions** tab.
2. In the left sidebar, click **Release PWA & Android Bundle**.
3. On the right, click **Run workflow**.
4. Fill out the form:
   - **Use workflow from:** Pick the branch you want to release (for example `main` or `release`).
   - **Version tag/label:** Enter a new version starting with `v` (for example `v0.1.0-alpha.2` or `v0.2.0`).
   - **Also create an official GitHub Release & tag on the selected branch:** Check this box (`true`).
   - **Mark the GitHub Release as a pre-release:** Keep checked for `-alpha`, `-beta`, or `-rc` versions; uncheck for full stable releases.
5. Click the green **Run workflow** button.
6. Wait for the green checkmark (~3–5 minutes including Android APK packaging). Your new release and built PWA `.zip`, Android `.apk` files, and `.sha256` checksums will appear automatically under **Releases** (and under **Artifacts** on the workflow run).

### Option B: Test-Build a Release Bundle Without Publishing Yet
Follow Option A, but **leave "Also create an official GitHub Release & tag" unchecked**. GitHub will still run all tests, verify version sync, build the PWA `.zip` + Android `.apk` + `.sha256` files, and attach them under **Artifacts** on the workflow run page so you can download and test them first.

### Option C: Trigger via Git Tag (If Using Terminal / Local Git)
Pushing any tag matching `v*.*.*` automatically runs `release.yml` and publishes the release:
```bash
git tag v0.2.0
git push origin v0.2.0
```

---

## Quick Troubleshooting
- **"Tag already exists" error:** Every GitHub Release needs a unique version number. Bump the last number (for example `v0.1.0-alpha.1` → `v0.1.0-alpha.2`).
- **"Release PWA Bundle doesn't appear or skips my inputs on an older branch":** That older branch hasn't received the updated `release.yml` file yet. Use **Part 1** above for that branch, or update it from `main` first.

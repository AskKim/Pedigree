# How to Update the `release` Branch From `main` (and Redeploy GitHub Pages)

In this repository:
- **`main`** is where new features, fixes, and workflows live (and automatically triggers **Deploy to GitHub Pages**).
- **`release`** is the stable production branch that also automatically triggers **Deploy to GitHub Pages** (`deploy-pages.yml`) to publish the live web app.

> **Do This First If Needed:** If your current `release` branch holds an older milestone you want to preserve (like Alpha.1), follow [How to Create a GitHub Release](./HOW_TO_CREATE_A_RELEASE.md) (**Part 1**) *before* updating `release` from `main`. That saves a permanent snapshot first.

---

## Method 1: Update `release` From `main` on GitHub (Recommended — No Terminal Needed)

1. Open your repository on GitHub (`AskKim/Pedigree`).
2. Click the **Pull requests** tab near the top, then click **New pull request**.
3. Set the two branch dropdowns carefully (**direction matters!**):
   - **base:** `release` *(the destination branch you want to update)*
   - **compare:** `main` *(the source branch with your latest code)*
   - Reading left-to-right, the arrow should look like: **`base: release` ← `compare: main`**.
4. Check the status message:
   - If it says **`Able to merge`** (green): click **Create pull request**.
   - Give it a simple title like `Update release from main`, then click **Create pull request**.
5. Scroll down and click **Merge pull request** → **Confirm merge**.
6. **Watch the live site redeploy automatically:**
   - Click the **Actions** tab.
   - You will see **Deploy to GitHub Pages** (`deploy-pages.yml`) running automatically on `release`.
   - Once it turns green, click the run to see the live `github.io` website link!

---

## Method 2: Manually Retrigger GitHub Pages Anytime

If you ever want to re-run the GitHub Pages deployment without making a new commit:
1. Go to **Actions** → **Deploy to GitHub Pages**.
2. Click **Run workflow** on the right.
3. Choose the branch (`release`, or even `main` if you want to preview `main` directly) and click **Run workflow**.

*(One-time check: under GitHub **Settings → Pages**, make sure **Source** is set to **GitHub Actions**.)*

---

## What If GitHub Says "Can't Automatically Merge" (Merge Conflicts)?

If `release` had edits that differ from `main`, GitHub may say there are merge conflicts. You have two easy options:

### Option A: Resolve in GitHub's Web Editor
1. Still create the Pull Request (`base: release` ← `compare: main`).
2. Click the **Resolve conflicts** button on the Pull Request.
3. For each marked section (`<<<<<<< release` ... `=======` ... `>>>>>>> main`), keep the `main` version and remove the `<<<<<<<`, `=======`, `>>>>>>>` marker lines.
4. Click **Mark as resolved** → **Commit merge**, then finish merging the Pull Request.

### Option B: Make `release` an Exact Copy of `main` (Using Local Git Terminal)
Only do this **after** saving any older release milestone as a GitHub Release/tag first, because this replaces `release` with an exact copy of `main`:
```bash
git fetch origin
git checkout release
git reset --hard origin/main
git push --force-with-lease origin release
```
Pushing `release` will immediately trigger **Deploy to GitHub Pages**.

---

## Verifying Your Live PWA Updated
1. Wait until **Actions → Deploy to GitHub Pages** shows a green checkmark.
2. Open your GitHub Pages URL.
3. Because this app is an offline-first PWA, your browser may show the previous cached version for a moment until the Service Worker updates — accept the in-app update prompt or do a hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`).

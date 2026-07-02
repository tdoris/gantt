# Deploying to GitHub Pages

This app is 100% static (HTML/CSS/JS, no build step), so hosting it is just
"put these files on the web." GitHub Pages does that for free over HTTPS.

Everything here uses **relative paths**, so it works fine when served from a
sub-path like `https://<you>.github.io/gantt/`.

---

## One-time setup

You need a GitHub account. Pick **one** of the two methods below.

### Method A — Upload in the browser (no command line)

1. Go to <https://github.com/new> and create a repository named **`gantt`**
   (Public is required for free GitHub Pages). Don't add a README.
2. On the new repo page, click **"uploading an existing file"**.
3. Drag in **everything in this folder**: `index.html`, `styles.css`, the whole
   `js/` folder, `.nojekyll`, `README.md`. Commit.
4. Go to **Settings → Pages**. Under "Build and deployment", set
   **Source = Deploy from a branch**, **Branch = `main`**, **Folder = `/ (root)`**.
   Save.
5. Wait ~1 minute, then reload that Pages settings page — it shows your live URL:
   **`https://<your-username>.github.io/gantt/`**

### Method B — Push with git (command line)

This repo is already a local git repo with a commit ready. After creating an
**empty** repo named `gantt` on GitHub (step 1 above, but *don't* upload files):

```bash
cd /home/jim/repos/gantt
git remote add origin https://github.com/<your-username>/gantt.git
git push -u origin main
```

Then do step 4–5 from Method A (Settings → Pages → Deploy from branch `main` / root).

> Prefer the GitHub CLI? If you install it (`gh`), the whole thing is:
> ```bash
> gh auth login
> gh repo create gantt --public --source=. --push
> gh api -X POST repos/<you>/gantt/pages -f source[branch]=main -f source[path]=/
> ```

---

## Sharing with the other person

Just send them the URL — `https://<your-username>.github.io/gantt/`. It works in
any modern browser, on any device. No login, no install.

Each person's projects are saved **in their own browser** (localStorage), so:

- You each build and keep your **own** set of projects independently.
- To hand a project to the other person, click **Export** (downloads a `.json`
  file), send it to them, and they click **Import** — it appears as a new
  project in their list without touching their existing ones.

That's the whole workflow: shared app, private per-person data, files to move a
plan between you.

---

## Updating the app later

Re-upload the changed files (Method A), or from the command line:

```bash
git add -A && git commit -m "Update" && git push
```

GitHub Pages redeploys automatically within a minute or so.

## Note on data & privacy

Projects live only in each visitor's browser storage — nothing is uploaded to
GitHub or any server. Clearing browser data wipes local projects, so use
**Export** to keep backups of anything important.

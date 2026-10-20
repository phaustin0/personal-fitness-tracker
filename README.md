# Fitness Tracker

A desktop workout tracker for a Full Body A/B home routine, built for Safari on macOS and hosted on GitHub Pages. No backend, no account: everything is stored in your browser.

Live: https://phaustin0.github.io/personal-fitness-tracker/

## Features

- **Workout logging**: Full Body A or B, superset or straight-set mode per routine (switchable mid-workout), per-set weight and reps (left/right for single-side exercises), bodyweight / added weight / assisted, last session's numbers beside every set, elapsed time and progress. Everything autosaves, so closing Safari mid-workout loses nothing.
- **Keyboard first**: type reps, press Enter. Empty fields take the grey suggestion, the set is ticked, and focus jumps to the next set in superset order (A1, A2, A1, A2…). Press `?` anywhere for all shortcuts; `1`–`4` switch sections.
- **Routines**: edit every exercise (name, load type, per side, sets, rep range, rest), reorder, create/join/ungroup supersets (tri-sets allowed), set rest after each superset, add or remove exercises. Edits never change past workouts: each workout keeps a snapshot of the routine it used.
- **Schedule**: 3 days a week (A/B/A, then B/A/B) or 4 (A/B/A/B), any weekdays. The Workout page shows today's status and the week.
- **History**: every workout, editable (times, sets, ticks) or deletable.
- **Dashboard**: weekly frequency against your schedule, streak and consistency, per-exercise progress charts (estimated 1RM, top weight, best reps, total reps), personal records, body weight, waist, and other measurement trends.
- **Backups**: JSON export and validated import (replace or merge).

There is deliberately no rest timer; rest times are shown for reference only.

## Your data: where it lives and its limits

- Data is stored in **IndexedDB in the browser you use**. It is not uploaded anywhere.
- It **does not sync** between Macs, browsers, or user accounts.
- A Safari **Dock web app has its own storage**, separate from regular Safari tabs. Data logged in one won't appear in the other. Pick one (the Dock app is recommended) and use it consistently.
- **Clearing website data** for the site in Safari (Settings → Privacy → Manage Website Data) deletes everything.
- The app asks for persistent storage. Settings → Data shows whether it was granted ("Persistent" is typical for the Dock app).
- **Export a backup regularly** (Settings → Data → Export backup) and keep the file somewhere safe, such as iCloud Drive. The Dashboard reminds you after a few workouts, and again if your last backup is more than 14 days old and you've trained since.

### Restoring or moving to another browser

1. In the old place: Settings → Data → **Export backup**.
2. In the new place: Settings → Data → **Import backup…**, choose the file, check the preview.
3. Choose **Replace** (the default for an empty browser). A safety backup of whatever was there downloads first.

**Merge** is for combining two places that both have workouts: records are matched by id and the newer version wins; nothing is deleted and local settings are kept. If both places started from fresh default routines, Merge shows the routines twice, so use Replace instead.

## Adding it to the Dock

1. Open the live URL in Safari (macOS Sonoma or later).
2. **File → Add to Dock…** (or the Share button → Add to Dock).
3. Launch it from the Dock. It opens straight to the Workout page in its own window.

## Development

Requires Node 22 or later.

```bash
npm install
npm run dev            # local dev server
npm test               # unit tests (Vitest + fake IndexedDB)
npm run build          # type-check and build to dist/
npm run preview:pages  # serve the build at /fitness-tracker/, like GitHub Pages
```

End-to-end tests run the real app in WebKit (Safari's engine) with Playwright:

```bash
npx playwright install webkit   # once
npm run test:e2e
```

## Deployment (GitHub Pages)

Deployment is automatic via `.github/workflows/deploy.yml`: every push to `main` runs the unit tests, builds, and publishes `dist/`.

One-time setup for a new repository:

1. Push the code to GitHub (a public repo for free GitHub Pages).
2. Repository **Settings → Pages → Source: GitHub Actions**.
3. Push to `main` (or re-run the workflow from the Actions tab).

The build uses relative asset paths and hash routing (`#/workout`), so it works under any repository name with no configuration.

## Project structure

```
src/
  db/          IndexedDB schema, migrations, repositories, default routine seed
  routine/     superset grouping logic and the routine editor operations
  workout/     session model, keyboard flow, live workout view
  history/     history helpers (validation, timing)
  schedule/    3x/4x schedule, alternation, week plan
  body/        body measurements
  stats/       frequency, consistency, progress, personal records, dashboard
  backup/      export, validation, replace/merge import
  charts/      small SVG line and bar charts
  pages/       Dashboard, Workout, History, Settings
e2e/           Playwright tests (WebKit)
public/        icons and web app manifest
```

### Data model notes

- Stores: `exercises`, `templates` (routines), `sessions` (workouts), `bodyMetrics`, `settings`, `meta`.
- Every record has an id, `createdAt`/`updatedAt`, and an optional `deletedAt`; deletes are soft.
- Schema changes go through an append-only migration list in `src/db/schema.ts`. Never edit a released migration; add a new one.
- Weights are kilograms; measurements are centimetres.

Full design notes and decisions are in `instructions.md`.

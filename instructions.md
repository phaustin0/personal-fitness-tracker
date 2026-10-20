# Fitness Tracker: Build Instructions

App display name: **Fitness Tracker**. Identifier (repo, DB, export tag): `fitness-tracker`.

Single source of truth for building the fitness tracker. Read this fully before doing any work on the app.

## Status

- Planning: complete and approved.
- **Phase 0 built, awaiting Faustino's review.** Scaffold, hash router, sidebar shell, dark/light theme, Pages workflow. Verified locally under a `/fitness-tracker/` subpath (`npm run preview:pages` after `npm run build`). Not yet pushed to GitHub; nothing committed yet.
- Next: Phase 1 (data layer).
- Phase 0 notes: Preact pinned to 10.x because `@tabler/icons-preact` doesn't support Preact 11 yet. Vite `base: './'` so the build works under any repo name. Theme is stored in `localStorage`, not IndexedDB, so `index.html` can apply it before first paint (no flash). Browser-pane launch configs live in the workspace root `.claude/launch.json` (`fitness-dev`, `fitness-pages-preview`).
- Working style: build one phase at a time, then stop so Faustino can test it before continuing.

Update this Status section at the end of every phase.

---

## 1. Goal

A polished desktop fitness workout tracker for a personalised Full Body A/B home routine. Used on a MacBook in Safari (or as a Safari "Add to Dock" web app) while working out at home. Hosted on GitHub Pages. Prioritise desktop usability, reliability, and simplicity. Mobile responsiveness is unnecessary.

Deliver a complete, working, deployable application, not a mockup or prototype. No placeholder buttons, mock functionality, or fabricated workout records.

## 2. Decisions made

| Topic | Decision |
|---|---|
| Location | App lives in `Fitness Tracker/`, in its own new git repo |
| Stack | Vite + TypeScript + Preact |
| Storage | IndexedDB via the `idb` wrapper |
| Charts | uPlot |
| Icons | Tabler Icons via `@tabler/icons-preact` (MIT, tree-shaken). SF Symbols can't be used on the web due to Apple's license |
| Routing | Hash routing (`#/workout`) so GitHub Pages subpaths never 404 |
| Units | kg and cm, stored in those units. Display unit setting exists but defaults to kg |
| Tests | Vitest + `fake-indexeddb` for the data layer; Playwright on WebKit for end-to-end flows |
| Deploy | GitHub Actions workflow to GitHub Pages on push to `main` |
| Theme | Dark by default, optional light mode |
| Workout mode | Stored **per routine** (`templates.mode`), default `superset` for both A and B. Toggling mid-session changes only that session, not the routine's saved default. The routine's default is changed in its settings |
| Duration display | Elapsed workout time counting up from session start (e.g. "24:10"). Survives closing Safari. This is not a rest timer |
| Add to Dock | Safari 17+ can add any site to the Dock. Manifest, icons, and Apple meta tags just make it look right (proper name/icon, no toolbar). Polish item, phase 9 |

## 3. Workout program (initial editable defaults)

These are seed data, not hardcoded configuration. Default sets = 2, default rest = 180 s for every exercise and every superset.

**Full Body A: Lat Emphasis**

| Group | Exercise | Sets × Reps |
|---|---|---|
| Superset 1 | Pull-ups | 2 × 5–10 |
| | Single-leg calf raises | 2 × 12–20/leg |
| Superset 2 | Bulgarian split squats | 2 × 8–12/leg |
| | DB lateral raises | 2 × 12–20 |
| Superset 3 | Feet-elevated push-ups | 2 × 8–15 |
| | DB supinating curls | 2 × 8–12 |
| Superset 4 | DB overhead triceps extensions | 2 × 10–15 |
| | DB wrist extensions | 2 × 15–20 |
| Standalone | DB hammer curls | 2 × 10–15 |

**Full Body B: Upper/Mid-Back Emphasis**

| Group | Exercise | Sets × Reps |
|---|---|---|
| Superset 1 | Australian pull-ups | 2 × 8–15 |
| | Single-leg calf raises | 2 × 12–20/leg |
| Superset 2 | DB goblet squats | 2 × 10–15 |
| | DB lateral raises | 2 × 12–20 |
| Superset 3 | Dips | 2 × 6–12 |
| | DB concentration curls | 2 × 10–15/arm |
| Superset 4 | DB lying triceps extensions | 2 × 10–15 |
| | DB wrist curls | 2 × 15–20 |
| Standalone | DB reverse curls | 2 × 10–15 |

Single-leg calf raises and DB lateral raises appear in both routines and must be the **same exercise record** (shared history and PRs).

Suggested seed load types: pull-ups, Australian pull-ups, feet-elevated push-ups, dips = bodyweight (can be weighted or assisted per set). All "DB" exercises = dumbbell (weight per dumbbell). Unilateral: single-leg calf raises, Bulgarian split squats, DB concentration curls.

## 4. Feature requirements

### 4.1 Exercise configuration
Each exercise slot has individually editable: name, number of sets, min and max target reps, rest seconds, order, superset assignment. Rest is reference information only. **No rest timer, countdown, alarm, or notification of any kind.** Editing settings must never alter recorded data.

### 4.2 Supersets and modes
Two layers, kept separate:

1. **Routine structure.** Each slot has `groupId` (a superset) or `null` (standalone). Groups have their own rest time. Groups can be created, edited, rearranged, dissolved, or deleted. Groups may have 2+ members (tri-sets allowed). Dissolving a group sets its members to standalone; exercises and history untouched. A and B are configured independently.
2. **Display mode** (per routine, default superset):
   - Superset mode: grouped cards labelled A1/A2, B1/B2. Keyboard flow alternates A1 set 1, A2 set 1, A1 set 2, A2 set 2. Group rest shown after the pair. Standalone exercises shown as their own cards.
   - Straight mode: grouping hidden (not deleted), each exercise its own card, all sets of one exercise before the next, each exercise's own rest shown.

**Ordering rule:** slots have one list order. A group appears at the position of its first member; members keep their relative order inside it. Straight mode flattens that same order.

One underlying data model for both modes. Switching modes never changes history, settings, or supersets. Sets are tied to `slotId`, so switching mid-session loses nothing.

### 4.3 Workout tracking
- Choose Full Body A or B (next one suggested by schedule).
- Per-set weight and reps inputs, completion checkbox.
- Support bodyweight, assisted, weighted, and unilateral exercises (unilateral logs left and right reps).
- Previous session's performance shown next to inputs ("Last" column) and as input placeholders.
- Autosave everything, including unfinished sessions. Survives refresh and closing Safari.
- Resume, finish, discard.
- Elapsed duration and completion progress (sets done / total, progress bar).
- Summary after finishing.
- Historical sessions are editable.
- Each session snapshots the plan (exercise names, config, groups, mode) at start, so later routine edits don't change history.

**Keyboard flow:** type weight, Tab, type reps, Enter ticks the set and moves focus to the next set in mode order. Enter on empty inputs accepts the placeholder (last session's values).

### 4.4 Progress dashboard
Workout history, training frequency and consistency, per-exercise performance history, strength progression charts, personal records, body weight, waist circumference, other body measurement trends. All from real logged data only.

### 4.5 Training schedule
- 3 days/week: A/B/A then B/A/B. 4 days/week: A/B/A/B.
- Both reduce to strict alternation. **Next workout = opposite of the last completed session.** The schedule only decides which weekdays are training days. No stored rotation pointer, so it can't drift.
- Switching schedules, changing training days, and manually picking a workout never touch history.

### 4.6 Persistence and backup
- IndexedDB, autosave everything.
- Call `navigator.storage.persist()` on startup.
- JSON export: `{ app: "fitness-tracker", formatVersion, exportedAt, data: { ...stores } }`.
- Import: validate structure and versions, show a preview (counts, date range), then let the user choose **merge** (by id, newest `updatedAt` wins) or **replace**. Before a replace, automatically download a backup of the current data.
- Backup reminder based on `meta.lastBackupAt`.
- README must explain: data is local to the browser, does not sync across devices, and a Safari Dock web app has **separate storage from Safari tabs**.

## 5. IndexedDB schema

DB name `fitness-tracker`, version 1.

**Future-compatibility rules**
1. Every record: UUID `id` (`crypto.randomUUID()`), `createdAt`, `updatedAt`, optional `deletedAt`. Deletes are soft.
2. Schema changes only through ordered migration functions (`migrations[1]`, `migrations[2]`, ...), all run in sequence in `onupgradeneeded`.
3. Store canonical units (kg, cm). Convert only for display.
4. Sessions snapshot their plan at start.
5. Exercise library is separate from routine slots, so exercises shared between routines share history.

```ts
exercises        // keyPath: id; index: name
{ id, name,
  loadType: 'bodyweight' | 'weighted' | 'assisted' | 'dumbbell',
  unilateral: boolean, notes?,
  createdAt, updatedAt, deletedAt? }

templates        // keyPath: id   (Full Body A, Full Body B)
{ id, name, emphasis?, order,
  mode: 'superset' | 'straight',          // default 'superset'
  groups: [{ id, label, restSec, order }],
  slots:  [{ id, exerciseId, order, groupId: string | null,
             sets, repMin, repMax, restSec }],
  createdAt, updatedAt, deletedAt? }

sessions         // keyPath: id
                 // indexes: startedAt, status, templateId,
                 //          exerciseIds (multiEntry)
{ id, templateId,
  status: 'active' | 'completed' | 'discarded',
  startedAt, finishedAt?,
  mode: 'superset' | 'straight',          // starts as template.mode
  plan: { templateName, groups[], slots[] /* with exerciseName, loadType, unilateral copied in */ },
  sets: [{ id, slotId, exerciseId, setIndex,
           load: number | null,           // kg; added weight, assistance amount, or per-dumbbell weight
           loadKind,                       // per-set override, e.g. weighted pull-ups
           reps: number | null,
           repsBySide?: { left: number | null, right: number | null },
           done: boolean, completedAt? }],
  exerciseIds: string[],
  notes?, createdAt, updatedAt }

bodyMetrics      // keyPath: id; index: [type, date]
{ id, date, type: 'bodyweight' | 'waist' | 'chest' | 'arm' | string,
  value, createdAt, updatedAt, deletedAt? }

settings         // keyPath: key (key-value)
// units, activeSessionId   (theme is in localStorage, see Status notes)
// schedule: { kind: '3x' | '4x', days: number[] }   // e.g. [1,3,5]

meta             // keyPath: key
// schemaVersion, seededAt, lastBackupAt
```

Sets are stored inside the session record so each autosave is one atomic write. Expected volume is a few thousand sets over years; the `exerciseIds` multiEntry index covers "previous performance" and per-exercise history.

## 6. Design

Minimal, polished macOS-utility look. Desktop-first, efficient use of a laptop screen, no decorative clutter, no unnecessary animation.

- **Layout:** left sidebar (Dashboard, Workout, History, Settings), main content to the right.
- **Colour:** neutral greys, one blue accent for progress and active state, green tint for completed sets. Dark default, light optional.
- **Icons:** Tabler outline.
- **Workout screen:** header with routine name, emphasis, elapsed time, sets done/total, mode toggle (Superset / Straight), Finish. Thin progress bar. Superset cards contain member exercises side by side, each with a set table: Set | Last | kg | Reps (or L / R for unilateral) | checkbox. Group rest shown in the card header. Upcoming groups collapsible.
- **Dashboard:** this week vs schedule, consistency calendar, recent PRs, body weight and waist mini trends.
- **History:** session list on the left, selected session detail on the right, edit button.
- **Settings:** routine editor (drag to reorder, superset dropdown per slot, per-routine mode), schedule, theme, units, backup export/import.

## 7. Implementation phases

Each phase ends with a test that Faustino can run, then a stop for review.

| # | Phase | Scope | Test |
|---|---|---|---|
| 0 | Scaffold and deploy | `git init`, Vite + TS + Preact, hash router, sidebar shell, dark/light theme, GitHub Pages workflow with correct `base` path | Loads at the repo subpath in Safari; nav works; theme toggles |
| 1 | Data layer | DB open, migration chain, repositories, seed A/B defaults once | Vitest: seed runs once, migrations, soft delete, shared exercises |
| 2 | Routine editor | Edit exercises, sets, reps, rest, order; create/edit/dissolve supersets; per-routine mode | Edits persist after reload; history unaffected |
| 3 | Workout logging | Start with snapshot, set inputs, keyboard flow, autosave, resume/finish/discard, mode toggle, Last column, summary, elapsed time | Close Safari mid-set, reopen, nothing lost |
| 4 | History | List, detail, edit past sessions | Change routine; old sessions unchanged |
| 5 | Schedule | 3x/4x, training days, next-workout suggestion, manual override | Suggestion alternates correctly |
| 6 | Body metrics | Body weight, waist, other measurements | Entries persist, edit/delete work |
| 7 | Dashboard | Frequency, consistency, per-exercise charts, PRs | Fixture data matches hand-calculated values |
| 8 | Backup | Export/import, validation, preview, merge/replace, auto-backup before replace | Export, wipe, import, data identical |
| 9 | Polish | Manifest, icons, Apple web-app meta, keyboard shortcuts, empty states, Playwright WebKit E2E, README with setup, deploy, and storage caveats | Full E2E suite passes; Dock app works |

## 8. Constraints

- Static frontend only. No backend, accounts, paid services, or server-side code.
- Correct asset paths and routing on GitHub Pages repo subpaths.
- Only reliable Safari APIs.
- Handle empty states and invalid input gracefully.
- Never modify or delete logged data unless the user does it explicitly in the UI.

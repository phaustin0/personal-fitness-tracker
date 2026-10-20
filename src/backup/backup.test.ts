import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAppDB, type DB } from '../db/db';
import { newRecord } from '../db/records';
import { bodyMetrics, settings, templates } from '../db/repos';
import { seedIfNeeded } from '../db/seed';
import { updateSlot } from '../routine/ops';
import { flowOrder, updateSet } from '../workout/session';
import { finishSession, saveSession, startSession } from '../workout/store';
import { applyMerge, applyReplace, buildBackup, dumpAll, needsBackupReminder, parseBackup, planMerge, summarize, validateBackup } from './backup';

let db: DB;

async function fresh() {
  globalThis.indexedDB = new IDBFactory();
  db = await openAppDB();
  await seedIfNeeded(db);
}

async function logWorkout() {
  const [a] = await templates.list(db);
  let s = await startSession(db, a.id);
  s = updateSet(s, flowOrder(s)[0].id, { reps: 8, done: true });
  return finishSession(db, await saveSession(db, s));
}

const sortById = <T extends { id?: string; key?: string }>(rows: T[]) => [...rows].sort((a, b) => String(a.id ?? a.key).localeCompare(String(b.id ?? b.key)));
const normal = (d: Awaited<ReturnType<typeof dumpAll>>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, sortById(v as never[])]));

beforeEach(fresh);
afterEach(() => db.close());

describe('round trip', () => {
  it('exports, wipes, imports, and gets identical data', async () => {
    await logWorkout();
    await bodyMetrics.put(db, newRecord({ date: '2026-10-20', type: 'bodyweight', value: 74.4 }));
    await settings.set(db, 'schedule', { kind: '4x', days: [1, 2, 4, 5] });
    const before = await dumpAll(db);
    const text = JSON.stringify(buildBackup(before));

    db.close();
    globalThis.indexedDB = new IDBFactory();
    db = await openAppDB();

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await applyReplace(db, parsed.backup.data);
    expect(normal(await dumpAll(db))).toEqual(normal(before));
  });

  it('replace removes data that is not in the backup', async () => {
    const empty = buildBackup(await dumpAll(db));
    await logWorkout();
    await applyReplace(db, empty.data);
    expect(summarize(await dumpAll(db)).workouts).toBe(0);
  });
});

describe('validation', () => {
  const valid = async () => JSON.parse(JSON.stringify(buildBackup(await dumpAll(db))));

  it('rejects non-JSON, other apps, and newer versions', async () => {
    expect(parseBackup('not json')).toMatchObject({ ok: false });
    expect(validateBackup({ app: 'other' })).toMatchObject({ ok: false, errors: ['This isn’t a Fitness Tracker backup file.'] });
    const newer = { ...(await valid()), formatVersion: 99 };
    expect(validateBackup(newer).ok).toBe(false);
    const newerSchema = { ...(await valid()), schemaVersion: 99 };
    expect(validateBackup(newerSchema).ok).toBe(false);
  });

  it('points at broken records', async () => {
    const b = await valid();
    b.data.templates[0].slots[0].sets = 'two';
    delete b.data.exercises[3].name;
    const r = validateBackup(b);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain('templates[0].slots[0].sets is missing or invalid');
    expect(r.errors).toContain('exercises[3].name is missing or invalid');
  });

  it('rejects duplicate ids and missing stores', async () => {
    const b = await valid();
    b.data.exercises.push(b.data.exercises[0]);
    expect(validateBackup(b)).toMatchObject({ ok: false, errors: ['exercises contains duplicate ids.'] });
    const c = await valid();
    delete c.data.sessions;
    expect(validateBackup(c)).toMatchObject({ ok: false, errors: ['sessions is not a list'] });
  });

  it('accepts a real export and summarises it', async () => {
    await logWorkout();
    const r = validateBackup(await valid());
    expect(r.ok).toBe(true);
    if (r.ok) expect(summarize(r.backup.data)).toMatchObject({ workouts: 1, routines: 2, exercises: 16, active: false });
  });
});

describe('merge', () => {
  it('adds new records, keeps the newer version, and leaves local settings alone', async () => {
    const original = await dumpAll(db);
    const [a] = await templates.list(db);
    await logWorkout();
    await settings.set(db, 'schedule', { kind: '4x', days: [1, 2, 4, 5] });
    const incoming = await dumpAll(db);

    db.close();
    globalThis.indexedDB = new IDBFactory();
    db = await openAppDB();
    await applyReplace(db, original);
    await templates.put(db, updateSlot(a, a.slots[0].id, { sets: 5 }));

    const plan = planMerge(await dumpAll(db), incoming);
    expect(plan.added).toBe(1);
    expect(plan.puts.templates).toHaveLength(0);
    expect(plan.puts.settings.map((s) => s.key)).toEqual(['schedule']);
    await applyMerge(db, plan);

    const after = await dumpAll(db);
    expect(summarize(after).workouts).toBe(1);
    expect(after.templates.find((t) => t.id === a.id)!.slots[0].sets).toBe(5);
    expect(await settings.get(db, 'activeSessionId')).toBeNull();
  });
});

describe('backup reminder', () => {
  const s = (updatedAt: string) => ({ updatedAt }) as never;
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  it('waits for 3 workouts, then nags until backed up, and again when a backup is stale and outdated', () => {
    expect(needsBackupReminder([s('2026-10-01T00:00:00.000Z'), s('2026-10-02T00:00:00.000Z')], null, now)).toBe(false);
    const three = [s('2026-10-01T00:00:00.000Z'), s('2026-10-02T00:00:00.000Z'), s('2026-10-19T00:00:00.000Z')];
    expect(needsBackupReminder(three, null, now)).toBe(true);
    expect(needsBackupReminder(three, '2026-10-15T00:00:00.000Z', now)).toBe(false);
    expect(needsBackupReminder(three, '2026-10-01T12:00:00.000Z', now)).toBe(true);
    expect(needsBackupReminder(three, '2026-10-19T12:00:00.000Z', now + 30 * 864e5)).toBe(false);
  });
});

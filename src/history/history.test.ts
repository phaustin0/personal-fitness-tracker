import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAppDB, type DB } from '../db/db';
import { exercises, sessions, templates } from '../db/repos';
import { buildSeed, seedIfNeeded } from '../db/seed';
import type { Session } from '../db/types';
import { updateSlot } from '../routine/ops';
import { createSession, flowOrder, updateSet } from '../workout/session';
import { finishSession, previousSets, saveSession, startSession } from '../workout/store';
import { durationMinutes, fromLocalInput, groupByMonth, toLocalInput, validateSession, withTiming } from './history';

const seed = buildSeed();
const byId = new Map(seed.exercises.map((e) => [e.id, e]));
const base = createSession(seed.templates[0], byId, '2026-10-01T10:00:00.000Z');
const at = (startedAt: string, minutes = 60): Session => withTiming({ ...base, id: startedAt }, startedAt, minutes);

describe('history helpers', () => {
  it('groups by month, newest first', () => {
    const groups = groupByMonth([
      at('2026-09-03T10:00:00.000Z'),
      at('2026-10-20T10:00:00.000Z'),
      at('2026-10-02T10:00:00.000Z'),
    ]);
    expect(groups.map((g) => g.sessions.map((s) => s.startedAt.slice(0, 10)))).toEqual([
      ['2026-10-20', '2026-10-02'],
      ['2026-09-03'],
    ]);
  });

  it('round-trips local datetime input values', () => {
    const iso = fromLocalInput('2026-10-20T18:45')!;
    expect(toLocalInput(iso)).toBe('2026-10-20T18:45');
    expect(fromLocalInput('20/10/2026')).toBeNull();
  });

  it('sets start and duration together', () => {
    const s = withTiming(base, '2026-10-05T08:00:00.000Z', 75);
    expect(s.finishedAt).toBe('2026-10-05T09:15:00.000Z');
    expect(durationMinutes(s)).toBe(75);
  });

  it('rejects future starts, bad durations, and ticked sets without reps', () => {
    const now = Date.parse('2026-10-20T12:00:00.000Z');
    expect(validateSession(at('2026-10-20T10:00:00.000Z'), now)).toEqual([]);
    expect(validateSession(at('2026-10-21T10:00:00.000Z'), now)).toHaveLength(1);
    expect(validateSession(at('2026-10-20T10:00:00.000Z', 0), now)).toHaveLength(1);
    const s = at('2026-10-20T10:00:00.000Z');
    const blank = updateSet(s, flowOrder(s)[0].id, { done: true });
    expect(validateSession(blank, now)).toEqual(['Every ticked set needs reps.']);
  });
});

describe('editing history', () => {
  let db: DB;
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    db = await openAppDB();
    await seedIfNeeded(db);
  });
  afterEach(() => db.close());

  it('keeps old sessions unchanged when the routine is edited later', async () => {
    const [a] = await templates.list(db);
    const done = await finishSession(db, await startSession(db, a.id));
    await templates.put(db, updateSlot(a, a.slots[0].id, { sets: 4, repMin: 1, repMax: 3 }));
    const pull = (await exercises.list(db)).find((e) => e.name === 'Pull-ups')!;
    await exercises.put(db, { ...pull, name: 'Chin-ups' });

    const stored = (await sessions.get(db, done.id))!;
    expect(stored.plan.slots[0]).toMatchObject({ exerciseName: 'Pull-ups', sets: 2, repMin: 5, repMax: 10 });
    expect(stored.sets.filter((x) => x.slotId === a.slots[0].id)).toHaveLength(2);
  });

  it('feeds edited values into the next workout’s “Last” column', async () => {
    const [a] = await templates.list(db);
    let s = await startSession(db, a.id);
    const first = flowOrder(s)[0];
    s = updateSet(s, first.id, { reps: 6, done: true });
    const done = await finishSession(db, await saveSession(db, s));

    await saveSession(db, updateSet(done, first.id, { reps: 9 }));
    const prev = await previousSets(db, [first.exerciseId]);
    expect(prev.get(first.exerciseId)![0].reps).toBe(9);
  });

  it('hides deleted sessions from history and from “Last”', async () => {
    const [a] = await templates.list(db);
    let s = await startSession(db, a.id);
    const first = flowOrder(s)[0];
    s = updateSet(s, first.id, { reps: 6, done: true });
    const done = await finishSession(db, await saveSession(db, s));

    await sessions.softDelete(db, done.id);
    expect(await sessions.byStatus(db, 'completed')).toHaveLength(0);
    expect((await previousSets(db, [first.exerciseId])).has(first.exerciseId)).toBe(false);
    expect(await sessions.get(db, done.id)).toBeTruthy();
  });
});

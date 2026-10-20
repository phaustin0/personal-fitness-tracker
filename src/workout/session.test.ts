import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAppDB, type DB } from '../db/db';
import { exercises, sessions, settings, templates } from '../db/repos';
import { buildSeed, seedIfNeeded } from '../db/seed';
import type { Session, SetLog } from '../db/types';
import { setSlotGroup, updateSlot } from '../routine/ops';
import {
  completionPatch,
  createSession,
  flowOrder,
  formatDuration,
  formatSet,
  nextOpenSet,
  progress,
  suggestionFor,
  updateSet,
} from './session';
import { discardSession, finishSession, getActiveSession, previousSets, saveSession, startSession } from './store';

const seed = buildSeed();
const byId = new Map(seed.exercises.map((e) => [e.id, e]));
const [A] = seed.templates;
const nameOf = (s: Session, set: SetLog) => s.plan.slots.find((p) => p.id === set.slotId)!.exerciseName;
const flowNames = (s: Session) => flowOrder(s).map((x) => `${nameOf(s, x)} ${x.setIndex + 1}`);

describe('createSession', () => {
  it('creates every planned set and snapshots the routine', () => {
    const s = createSession(A, byId);
    expect(s.sets).toHaveLength(18);
    expect(s.plan.templateName).toBe('Full Body A');
    expect(s.plan.slots[0]).toMatchObject({ exerciseName: 'Pull-ups', loadType: 'bodyweight', unilateral: false });
    expect(s.mode).toBe('superset');
    expect(new Set(s.exerciseIds).size).toBe(9);
  });

  it('gives per-side exercises left and right reps', () => {
    const s = createSession(A, byId);
    const calf = s.sets.find((x) => nameOf(s, x) === 'Single-leg calf raises')!;
    expect(calf.repsBySide).toEqual({ left: null, right: null });
    expect(s.sets.find((x) => nameOf(s, x) === 'Pull-ups')!.repsBySide).toBeUndefined();
  });

  it('is unaffected by later routine edits', () => {
    const s = createSession(A, byId);
    const edited = updateSlot(A, A.slots[0].id, { sets: 5 });
    edited.slots[0].repMax = 99;
    expect(s.plan.slots[0].sets).toBe(2);
    expect(s.plan.slots[0].repMax).toBe(10);
    expect(s.sets.filter((x) => x.slotId === A.slots[0].id)).toHaveLength(2);
  });
});

describe('flow order', () => {
  it('alternates superset members set by set', () => {
    const s = createSession(A, byId);
    expect(flowNames(s).slice(0, 5)).toEqual([
      'Pull-ups 1',
      'Single-leg calf raises 1',
      'Pull-ups 2',
      'Single-leg calf raises 2',
      'Bulgarian split squats 1',
    ]);
    expect(flowNames(s).slice(-2)).toEqual(['DB hammer curls 1', 'DB hammer curls 2']);
  });

  it('finishes each exercise first in straight mode', () => {
    const s = { ...createSession(A, byId), mode: 'straight' as const };
    expect(flowNames(s).slice(0, 4)).toEqual(['Pull-ups 1', 'Pull-ups 2', 'Single-leg calf raises 1', 'Single-leg calf raises 2']);
  });

  it('handles tri-sets with uneven set counts', () => {
    let t = setSlotGroup(A, A.slots[8].id, A.groups[3].id);
    t = updateSlot(t, A.slots[8].id, { sets: 3 });
    const s = createSession(t, byId);
    expect(flowNames(s).slice(-7)).toEqual([
      'DB overhead triceps extensions 1',
      'DB wrist extensions 1',
      'DB hammer curls 1',
      'DB overhead triceps extensions 2',
      'DB wrist extensions 2',
      'DB hammer curls 2',
      'DB hammer curls 3',
    ]);
  });

  it('finds the next open set, wrapping around to skipped ones', () => {
    let s = createSession(A, byId);
    const order = flowOrder(s);
    s = updateSet(s, order[1].id, { reps: 15, done: true });
    expect(nextOpenSet(s, order[0].id)!.id).toBe(order[2].id);
    for (const x of order.slice(2)) s = updateSet(s, x.id, { reps: 10, done: true });
    expect(nextOpenSet(s, order.at(-1)!.id)!.id).toBe(order[0].id);
    s = updateSet(s, order[0].id, { reps: 8, done: true });
    expect(nextOpenSet(s, order[0].id)).toBeNull();
    expect(progress(s)).toEqual({ done: 18, total: 18 });
  });
});

describe('set editing', () => {
  it('keeps the lower side as reps for per-side sets and stamps completion', () => {
    let s = createSession(A, byId);
    const calf = flowOrder(s)[1];
    s = updateSet(s, calf.id, { repsBySide: { left: 16, right: 14 }, done: true }, '2026-10-20T10:00:00.000Z');
    const saved = s.sets.find((x) => x.id === calf.id)!;
    expect(saved.reps).toBe(14);
    expect(saved.completedAt).toBe('2026-10-20T10:00:00.000Z');
    s = updateSet(s, calf.id, { done: false });
    expect(s.sets.find((x) => x.id === calf.id)!.completedAt).toBeUndefined();
  });

  it('fills empty inputs from last session, then from the set above', () => {
    let s = createSession(A, byId);
    const [pull1, , pull2] = flowOrder(s);
    const prev = new Map([[pull1.exerciseId, [{ ...pull1, load: 5, loadKind: 'bodyweight' as const, reps: 8, done: true }]]]);

    expect(completionPatch(pull1, suggestionFor(s, pull1, prev))).toEqual({ load: 5, reps: 8, done: true });

    s = updateSet(s, pull1.id, { load: 5, reps: 9, done: true });
    const pull2Now = s.sets.find((x) => x.id === pull2.id)!;
    expect(completionPatch(pull2Now, suggestionFor(s, pull2Now, prev))).toEqual({ load: 5, reps: 9, done: true });
  });

  it('typed values win over suggestions, and nothing completes without reps', () => {
    const s = createSession(A, byId);
    const [pull1] = flowOrder(s);
    const typed = { ...pull1, load: 10 };
    expect(completionPatch(typed, null)).toBeNull();
    expect(completionPatch({ ...typed, reps: 6 }, { ...pull1, load: 5, reps: 8 })).toEqual({ load: 10, reps: 6, done: true });
  });

  it('does not carry load across different load kinds', () => {
    const s = createSession(A, byId);
    const [pull1] = flowOrder(s);
    const assisted = { ...pull1, loadKind: 'assisted' as const };
    expect(completionPatch(assisted, { ...pull1, load: 10, reps: 6 })).toEqual({ load: null, reps: 6, done: true });
  });

  it('formats sets and durations', () => {
    const s = createSession(A, byId);
    const [pull1, calf1] = flowOrder(s);
    expect(formatSet({ ...pull1, reps: 8 })).toBe('BW × 8');
    expect(formatSet({ ...pull1, load: 7.5, reps: 6 })).toBe('BW+7.5 × 6');
    expect(formatSet({ ...calf1, repsBySide: { left: 15, right: 14 } })).toBe('BW × 15/14');
    expect(formatDuration(1450)).toBe('24:10');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});

describe('store', () => {
  let db: DB;
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    db = await openAppDB();
    await seedIfNeeded(db);
  });
  afterEach(() => db.close());

  const routine = async (name: string) => (await templates.list(db)).find((t) => t.name === name)!;

  it('survives a reload mid-workout', async () => {
    const a = await routine('Full Body A');
    let s = await startSession(db, a.id);
    s = updateSet(s, flowOrder(s)[0].id, { load: 0, reps: 8, done: true });
    await saveSession(db, s);
    db.close();

    db = await openAppDB();
    const resumed = await getActiveSession(db);
    expect(resumed?.id).toBe(s.id);
    expect(progress(resumed!).done).toBe(1);
  });

  it('only allows one active workout at a time', async () => {
    const a = await routine('Full Body A');
    const b = await routine('Full Body B');
    const first = await startSession(db, a.id);
    const second = await startSession(db, b.id);
    expect(second.id).toBe(first.id);
  });

  it('finishes and discards, clearing the active pointer', async () => {
    const a = await routine('Full Body A');
    const done = await finishSession(db, await startSession(db, a.id));
    expect(done.status).toBe('completed');
    expect(done.finishedAt).toBeTruthy();
    expect(await settings.get(db, 'activeSessionId')).toBeNull();
    expect(await getActiveSession(db)).toBeNull();

    const gone = await discardSession(db, await startSession(db, a.id));
    expect((await sessions.get(db, gone.id))!.status).toBe('discarded');
    expect(await getActiveSession(db)).toBeNull();
  });

  it('shows last performance from the most recent completed session, across routines', async () => {
    const a = await routine('Full Body A');
    const b = await routine('Full Body B');
    const calfId = (await exercises.list(db)).find((e) => e.name === 'Single-leg calf raises')!.id;

    const complete = async (templateId: string, left: number, startedAt: string) => {
      let s = await startSession(db, templateId);
      s = { ...s, startedAt };
      for (const x of s.sets.filter((x) => x.exerciseId === calfId)) {
        s = updateSet(s, x.id, { repsBySide: { left, right: left }, done: true });
      }
      await finishSession(db, await saveSession(db, s));
    };
    await complete(a.id, 12, '2026-10-01T10:00:00.000Z');
    await complete(b.id, 15, '2026-10-03T10:00:00.000Z');
    await discardSession(db, await startSession(db, a.id));

    const current = await startSession(db, a.id);
    const prev = await previousSets(db, current.exerciseIds, current.id);
    expect(prev.get(calfId)!.map((x) => x.repsBySide!.left)).toEqual([15, 15]);
    expect(prev.has(a.slots[0].exerciseId)).toBe(false);
  });
});

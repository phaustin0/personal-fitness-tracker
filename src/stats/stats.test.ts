import { describe, expect, it } from 'vitest';
import { buildSeed } from '../db/seed';
import type { Session } from '../db/types';
import { createSession, flowOrder, updateSet } from '../workout/session';
import { consistency, e1rm, exerciseHistory, niceTicks, personalRecords, weeklyCounts } from './stats';

const seed = buildSeed();
const byId = new Map(seed.exercises.map((e) => [e.id, e]));
const [A] = seed.templates;
const id = (name: string) => seed.exercises.find((e) => e.name === name)!.id;

/** Completed session on a local date; `sets` maps exercise name to [load, reps] per set. */
function workout(y: number, m: number, d: number, sets: Record<string, [number | null, number][]> = {}): Session {
  let s = createSession(A, byId, new Date(y, m - 1, d, 12).toISOString());
  s = { ...s, status: 'completed', finishedAt: s.startedAt };
  for (const [name, values] of Object.entries(sets)) {
    const logs = s.sets.filter((x) => x.exerciseId === id(name)).sort((a, b) => a.setIndex - b.setIndex);
    values.forEach(([load, reps], i) => {
      s = updateSet(s, logs[i].id, logs[i].repsBySide ? { load, repsBySide: { left: reps, right: reps }, done: true } : { load, reps, done: true });
    });
  }
  return s;
}

// Tuesday 20 Oct 2026; its week starts Monday 19 Oct.
const today = new Date(2026, 9, 20, 18);

describe('frequency and consistency', () => {
  it('counts workouts per Monday-first week', () => {
    const weeks = weeklyCounts([workout(2026, 10, 5), workout(2026, 10, 7), workout(2026, 10, 19), workout(2026, 10, 11)], today, 3);
    expect(weeks.map((w) => [w.key, w.count])).toEqual([
      ['2026-10-05', 3],
      ['2026-10-12', 0],
      ['2026-10-19', 1],
    ]);
  });

  it('computes this week, 4-week average, streak, and hit rate against the target', () => {
    const sessions = [
      // week of 21 Sep: 3, 28 Sep: 2, 5 Oct: 3, 12 Oct: 3, this week: 1
      ...[21, 23, 25].map((d) => workout(2026, 9, d)),
      ...[28, 30].map((d) => workout(2026, 9, d)),
      ...[5, 7, 9].map((d) => workout(2026, 10, d)),
      ...[12, 14, 16].map((d) => workout(2026, 10, d)),
      workout(2026, 10, 19),
    ];
    const c = consistency(sessions, today, 3);
    expect(c.thisWeek).toBe(1);
    expect(c.streak).toBe(2);
    expect(c.avgPerWeek).toBe(2.75);
    expect(c.hitRate).toBe(0.75);
  });

  it('counts this week toward the streak once the target is met', () => {
    const sessions = [workout(2026, 10, 12), workout(2026, 10, 14), workout(2026, 10, 16), workout(2026, 10, 19), workout(2026, 10, 20), workout(2026, 10, 20)];
    expect(consistency(sessions, today, 3).streak).toBe(2);
  });

  it('handles no history', () => {
    expect(consistency([], today, 3)).toEqual({ thisWeek: 0, target: 3, avgPerWeek: null, streak: 0, hitRate: null });
  });
});

describe('exercise progress', () => {
  it('summarises each session using only ticked sets', () => {
    const sessions = [
      workout(2026, 10, 1, { 'DB lateral raises': [[8, 15], [8, 12]] }),
      workout(2026, 10, 5, { 'DB lateral raises': [[10, 12], [10, 10]] }),
      workout(2026, 10, 8),
    ];
    const h = exerciseHistory(sessions, id('DB lateral raises'));
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ bestReps: 15, totalReps: 27, topLoad: 8, topLoadReps: 15 });
    expect(h[1]).toMatchObject({ bestReps: 12, totalReps: 22, topLoad: 10, topLoadReps: 12 });
    expect(h[1].bestE1rm).toBeCloseTo(e1rm(10, 12));
  });

  it('treats bodyweight as reps progress and ignores assistance as load', () => {
    let s = workout(2026, 10, 1, { 'Pull-ups': [[null, 8], [5, 6]] });
    const h = exerciseHistory([s], id('Pull-ups'));
    expect(h[0]).toMatchObject({ bestReps: 8, topLoad: 5, topLoadReps: 6, bestE1rm: null });

    const first = flowOrder(s)[0];
    s = updateSet(s, first.id, { loadKind: 'assisted', load: 20 });
    s = updateSet(s, s.sets.find((x) => x.exerciseId === id('Pull-ups') && x.setIndex === 1)!.id, { loadKind: 'assisted', load: 10 });
    expect(exerciseHistory([s], id('Pull-ups'))[0].topLoad).toBeNull();
  });
});

describe('personal records', () => {
  it('records all-time bests and emits PRs only after the baseline session', () => {
    const sessions = [
      workout(2026, 10, 1, { 'DB lateral raises': [[8, 15]] }),
      workout(2026, 10, 5, { 'DB lateral raises': [[8, 14]] }),
      workout(2026, 10, 8, { 'DB lateral raises': [[10, 12]] }),
      workout(2026, 10, 12, { 'DB lateral raises': [[8, 18]] }),
      workout(2026, 10, 14, { 'DB lateral raises': [[10, 13]] }),
    ];
    const { records, events } = personalRecords(sessions);
    const r = records.get(id('DB lateral raises'))!;
    expect(r.reps!.value).toBe(18);
    expect(r.load).toMatchObject({ value: 10, reps: 13 });
    expect(r.e1rm!.value).toBeCloseTo(e1rm(10, 13));

    expect(events.map((e) => [new Date(e.date).getDate(), e.kind])).toEqual([
      [8, 'load'],
      [8, 'e1rm'],
      [12, 'reps'],
      [14, 'e1rm'],
    ]);
    expect(events.find((e) => e.kind === 'reps')).toMatchObject({ value: 18, previous: 15 });
  });

  it('ignores unticked sets', () => {
    const first = workout(2026, 10, 1, { 'DB hammer curls': [[12, 10]] });
    const later = workout(2026, 10, 5, { 'DB hammer curls': [[12, 20]] });
    const set = later.sets.find((x) => x.exerciseId === id('DB hammer curls') && x.done)!;
    const unticked = updateSet(later, set.id, { done: false });
    expect(personalRecords([first, unticked]).records.get(id('DB hammer curls'))!.reps!.value).toBe(10);
  });
});

describe('axis ticks', () => {
  it('produces round steps that cover the range', () => {
    expect(niceTicks(0, 4, 4)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(72.4, 76.1, 4)).toEqual([72, 73, 74, 75, 76, 77]);
    expect(niceTicks(10, 10)).toEqual([9, 9.5, 10, 10.5, 11]);
  });
});

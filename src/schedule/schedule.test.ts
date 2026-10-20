import { describe, expect, it } from 'vitest';
import { buildSeed } from '../db/seed';
import type { Session } from '../db/types';
import { createSession } from '../workout/session';
import { nextTemplate, nextTrainingDay, scheduleFromDays, startOfWeek, weekPlan } from './schedule';

const seed = buildSeed();
const byId = new Map(seed.exercises.map((e) => [e.id, e]));
const [A, B] = seed.templates;
const threeX = { kind: '3x' as const, days: [1, 3, 5] };

/** A completed session at local noon on the given date. */
function did(template: typeof A, y: number, m: number, d: number): Session {
  const at = new Date(y, m - 1, d, 12).toISOString();
  return { ...createSession(template, byId, at), status: 'completed', finishedAt: at };
}

// Week of Mon 19 Oct 2026 – Sun 25 Oct 2026.
const tue = new Date(2026, 9, 20, 9);

describe('next routine', () => {
  it('starts with A, then strictly alternates', () => {
    expect(nextTemplate([A, B], [])!.name).toBe('Full Body A');
    const history = [did(A, 2026, 10, 12), did(B, 2026, 10, 14), did(A, 2026, 10, 16)];
    expect(nextTemplate([A, B], history)!.name).toBe('Full Body B');
    expect(nextTemplate([A, B], [...history, did(B, 2026, 10, 19)])!.name).toBe('Full Body A');
  });

  it('gives A/B/A one week and B/A/B the next on a 3-day schedule', () => {
    const done: Session[] = [];
    const names: string[] = [];
    for (const [d] of [[12], [14], [16], [19], [21], [23]]) {
      const t = nextTemplate([A, B], done)!;
      names.push(t.name.slice(-1));
      done.push(did(t, 2026, 10, d));
    }
    expect(names.join('')).toBe('ABABAB');
    expect(names.slice(0, 3).join('/')).toBe('A/B/A');
    expect(names.slice(3).join('/')).toBe('B/A/B');
  });

  it('follows a manually chosen workout', () => {
    expect(nextTemplate([A, B], [did(A, 2026, 10, 12), did(A, 2026, 10, 14)])!.name).toBe('Full Body B');
  });
});

describe('training days', () => {
  it('accepts only 3 or 4 distinct days, Monday first', () => {
    expect(scheduleFromDays([5, 1, 3])).toEqual({ kind: '3x', days: [1, 3, 5] });
    expect(scheduleFromDays([0, 2, 4, 6])).toEqual({ kind: '4x', days: [2, 4, 6, 0] });
    expect(scheduleFromDays([1, 3])).toBeNull();
    expect(scheduleFromDays([1, 2, 3, 4, 5])).toBeNull();
    expect(scheduleFromDays([1, 1, 3])).toBeNull();
  });

  it('finds the next training day, including today and across the weekend', () => {
    expect(nextTrainingDay(threeX, tue)!.getDate()).toBe(21);
    expect(nextTrainingDay(threeX, new Date(2026, 9, 21))!.getDate()).toBe(21);
    expect(nextTrainingDay(threeX, new Date(2026, 9, 24))!.getDate()).toBe(26);
  });

  it('weeks start on Monday', () => {
    expect(startOfWeek(new Date(2026, 9, 25)).getDate()).toBe(19);
    expect(startOfWeek(new Date(2026, 9, 19)).getDate()).toBe(19);
  });
});

describe('week plan', () => {
  it('marks done and missed days and projects the rest by alternation', () => {
    const history = [did(A, 2026, 10, 16)];
    const week = weekPlan(threeX, [A, B], history, new Date(2026, 9, 21, 9));
    const view = week.map((d) => [d.date.getDate(), d.scheduled, d.missed, d.planned?.name.slice(-1) ?? null, d.done.length]);
    expect(view).toEqual([
      [19, true, true, null, 0],
      [20, false, false, null, 0],
      [21, true, false, 'B', 0],
      [22, false, false, null, 0],
      [23, true, false, 'A', 0],
      [24, false, false, null, 0],
      [25, false, false, null, 0],
    ]);
    expect(week[2].isToday).toBe(true);
  });

  it('does not count days before the first workout as missed', () => {
    expect(weekPlan(threeX, [A, B], [], new Date(2026, 9, 24)).some((d) => d.missed)).toBe(false);
    const week = weekPlan(threeX, [A, B], [did(A, 2026, 10, 20)], new Date(2026, 9, 24));
    expect(week.filter((d) => d.missed).map((d) => d.date.getDate())).toEqual([21, 23]);
  });

  it('shows workouts done on rest days and skips planning a day already done', () => {
    const history = [did(A, 2026, 10, 20), did(B, 2026, 10, 21)];
    const week = weekPlan(threeX, [A, B], history, new Date(2026, 9, 21, 18));
    expect(week[1]).toMatchObject({ scheduled: false });
    expect(week[1].done).toHaveLength(1);
    expect(week[2].done[0].plan.templateName).toBe('Full Body B');
    expect(week[2].planned).toBeNull();
    expect(week[4].planned!.name).toBe('Full Body A');
  });
});

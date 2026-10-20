import type { Session, SetLog } from '../db/types';
import { addDays, dayKey, startOfWeek } from '../schedule/schedule';

/** Epley estimate; only meaningful for externally loaded sets. */
export function e1rm(load: number, reps: number): number {
  return reps <= 1 ? load : load * (1 + reps / 30);
}

const isLoaded = (s: SetLog) => (s.loadKind === 'dumbbell' || s.loadKind === 'weighted') && s.load !== null && s.load > 0;
const addedLoad = (s: SetLog) => (s.loadKind === 'assisted' ? 0 : (s.load ?? 0));

export interface WeekCount {
  weekStart: Date;
  key: string;
  count: number;
}

/** Completed workouts per Monday-first week, oldest first, ending with the current week. */
export function weeklyCounts(sessions: Session[], today: Date, weeks: number): WeekCount[] {
  const current = startOfWeek(today);
  const out: WeekCount[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(current, -7 * (weeks - 1 - i));
    return { weekStart, key: dayKey(weekStart), count: 0 };
  });
  const index = new Map(out.map((w, i) => [w.key, i]));
  for (const s of sessions) {
    const i = index.get(dayKey(startOfWeek(new Date(s.startedAt))));
    if (i !== undefined) out[i].count++;
  }
  return out;
}

export interface Consistency {
  thisWeek: number;
  target: number;
  avgPerWeek: number | null;
  /** Consecutive weeks meeting the target, counting back from last week (plus this week once met). */
  streak: number;
  /** Share of full weeks since the first workout that met the target. */
  hitRate: number | null;
}

export function consistency(sessions: Session[], today: Date, target: number): Consistency {
  if (sessions.length === 0) return { thisWeek: 0, target, avgPerWeek: null, streak: 0, hitRate: null };
  const first = startOfWeek(new Date(Math.min(...sessions.map((s) => Date.parse(s.startedAt)))));
  const current = startOfWeek(today);
  const totalWeeks = Math.round((current.getTime() - first.getTime()) / (7 * 864e5)) + 1;
  const weeks = weeklyCounts(sessions, today, totalWeeks);
  const thisWeek = weeks.at(-1)!.count;
  const full = weeks.slice(0, -1);

  let streak = 0;
  for (let i = full.length - 1; i >= 0 && full[i].count >= target; i--) streak++;
  if (thisWeek >= target) streak++;

  const recent = full.slice(-4);
  return {
    thisWeek,
    target,
    avgPerWeek: recent.length ? recent.reduce((n, w) => n + w.count, 0) / recent.length : null,
    streak,
    hitRate: full.length ? full.filter((w) => w.count >= target).length / full.length : null,
  };
}

export interface ExercisePoint {
  sessionId: string;
  date: string;
  sets: SetLog[];
  bestReps: number;
  totalReps: number;
  topLoad: number | null;
  topLoadReps: number | null;
  bestE1rm: number | null;
}

function summarizeSets(sets: SetLog[]): Omit<ExercisePoint, 'sessionId' | 'date' | 'sets'> {
  const reps = sets.map((s) => s.reps ?? 0);
  const loaded = sets.filter((s) => addedLoad(s) > 0);
  let topLoad: number | null = null;
  let topLoadReps: number | null = null;
  for (const s of loaded) {
    const l = addedLoad(s);
    if (topLoad === null || l > topLoad || (l === topLoad && (s.reps ?? 0) > (topLoadReps ?? 0))) {
      topLoad = l;
      topLoadReps = s.reps;
    }
  }
  const e1rms = sets.filter(isLoaded).map((s) => e1rm(s.load!, s.reps ?? 0));
  return {
    bestReps: Math.max(0, ...reps),
    totalReps: reps.reduce((a, b) => a + b, 0),
    topLoad,
    topLoadReps,
    bestE1rm: e1rms.length ? Math.max(...e1rms) : null,
  };
}

/** One point per completed session that has ticked sets for the exercise, oldest first. */
export function exerciseHistory(sessions: Session[], exerciseId: string): ExercisePoint[] {
  return [...sessions]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap((s) => {
      const sets = s.sets.filter((x) => x.exerciseId === exerciseId && x.done && x.reps !== null);
      return sets.length ? [{ sessionId: s.id, date: s.startedAt, sets, ...summarizeSets(sets) }] : [];
    });
}

export type PrKind = 'reps' | 'load' | 'e1rm';

export interface PrEvent {
  exerciseId: string;
  sessionId: string;
  date: string;
  kind: PrKind;
  value: number;
  previous: number;
  set: SetLog;
}

export interface Records {
  reps?: { value: number; date: string; set: SetLog };
  load?: { value: number; reps: number | null; date: string; set: SetLog };
  e1rm?: { value: number; date: string; set: SetLog };
}

/**
 * All-time bests per exercise, plus PR events: sessions that beat the previous best.
 * An exercise's first session sets the baseline and is not itself a PR.
 */
export function personalRecords(sessions: Session[]) {
  const records = new Map<string, Records>();
  const events: PrEvent[] = [];
  const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  for (const s of sorted) {
    const byExercise = new Map<string, SetLog[]>();
    for (const x of s.sets) {
      if (!x.done || x.reps === null) continue;
      byExercise.set(x.exerciseId, [...(byExercise.get(x.exerciseId) ?? []), x]);
    }
    for (const [exerciseId, sets] of byExercise) {
      const rec = records.get(exerciseId);
      const next: Records = { ...rec };

      const repsSet = sets.reduce((a, b) => ((b.reps ?? 0) > (a.reps ?? 0) ? b : a));
      const loadSet = sets.filter((x) => addedLoad(x) > 0).reduce<SetLog | null>((a, b) => {
        if (!a) return b;
        const la = addedLoad(a);
        const lb = addedLoad(b);
        return lb > la || (lb === la && (b.reps ?? 0) > (a.reps ?? 0)) ? b : a;
      }, null);
      const e1Set = sets.filter(isLoaded).reduce<SetLog | null>((a, b) => (!a || e1rm(b.load!, b.reps!) > e1rm(a.load!, a.reps!) ? b : a), null);

      const consider = (kind: PrKind, value: number, set: SetLog, prev: number | undefined) => {
        if (prev !== undefined && value > prev) events.push({ exerciseId, sessionId: s.id, date: s.startedAt, kind, value, previous: prev, set });
        return prev === undefined || value > prev;
      };

      if (consider('reps', repsSet.reps!, repsSet, rec?.reps?.value)) next.reps = { value: repsSet.reps!, date: s.startedAt, set: repsSet };
      if (loadSet) {
        const l = addedLoad(loadSet);
        const heavier = consider('load', l, loadSet, rec?.load?.value);
        // Same top weight for more reps improves the record shown, but isn't a new weight PR.
        const moreReps = rec?.load && l === rec.load.value && (loadSet.reps ?? 0) > (rec.load.reps ?? 0);
        if (heavier || moreReps) next.load = { value: l, reps: loadSet.reps, date: s.startedAt, set: loadSet };
      }
      if (e1Set) {
        const v = e1rm(e1Set.load!, e1Set.reps!);
        if (consider('e1rm', v, e1Set, rec?.e1rm?.value)) next.e1rm = { value: v, date: s.startedAt, set: e1Set };
      }
      records.set(exerciseId, next);
    }
  }
  return { records, events };
}

/** Nice round axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough)!;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  if (ticks.at(-1)! < max) ticks.push(Number((ticks.at(-1)! + step).toFixed(10)));
  return ticks;
}

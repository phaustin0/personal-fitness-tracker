import { newId, newRecord, now } from '../db/records';
import type { Exercise, LoadType, PlanSlot, Session, SetLog, Template, WorkoutMode } from '../db/types';
import { buildUnits, type Unit } from '../routine/units';

export function createSession(t: Template, exerciseById: Map<string, Exercise>, at = now()): Session {
  const slots: PlanSlot[] = [...t.slots]
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const e = exerciseById.get(s.exerciseId);
      if (!e) throw new Error(`Routine references a missing exercise (${s.exerciseId})`);
      return { ...s, exerciseName: e.name, loadType: e.loadType, unilateral: e.unilateral };
    });

  const sets: SetLog[] = slots.flatMap((s) =>
    Array.from({ length: s.sets }, (_, setIndex) => ({
      id: newId(),
      slotId: s.id,
      exerciseId: s.exerciseId,
      setIndex,
      load: null,
      loadKind: s.loadType,
      reps: null,
      ...(s.unilateral ? { repsBySide: { left: null, right: null } } : {}),
      done: false,
    })),
  );

  return newRecord(
    {
      templateId: t.id,
      status: 'active' as const,
      startedAt: at,
      mode: t.mode,
      plan: {
        templateName: t.name,
        emphasis: t.emphasis,
        groups: t.groups.map((g) => ({ ...g })),
        slots,
      },
      sets,
      exerciseIds: [...new Set(slots.map((s) => s.exerciseId))],
    },
    at,
  );
}

export function planUnits(session: Session): Unit<PlanSlot>[] {
  return buildUnits(session.plan);
}

export function setsForSlot(session: Session, slotId: string): SetLog[] {
  return session.sets.filter((s) => s.slotId === slotId).sort((a, b) => a.setIndex - b.setIndex);
}

/**
 * The order Enter moves through sets. Superset mode alternates members set by set
 * (A1 s1, A2 s1, A1 s2, A2 s2); straight mode finishes each exercise before the next.
 */
export function flowOrder(session: Session, mode: WorkoutMode = session.mode): SetLog[] {
  const units = planUnits(session);
  const out: SetLog[] = [];
  for (const unit of units) {
    const perSlot = unit.slots.map((s) => setsForSlot(session, s.id));
    if (mode === 'superset' && unit.group) {
      const rounds = Math.max(0, ...perSlot.map((s) => s.length));
      for (let i = 0; i < rounds; i++) for (const sets of perSlot) if (sets[i]) out.push(sets[i]);
    } else {
      for (const sets of perSlot) out.push(...sets);
    }
  }
  return out;
}

/** The next unfinished set after `fromSetId` in flow order, wrapping to the first unfinished one. */
export function nextOpenSet(session: Session, fromSetId: string | null): SetLog | null {
  const order = flowOrder(session);
  const start = fromSetId ? order.findIndex((s) => s.id === fromSetId) + 1 : 0;
  return order.slice(start).find((s) => !s.done) ?? order.slice(0, start).find((s) => !s.done) ?? null;
}

export function progress(session: Session) {
  const done = session.sets.filter((s) => s.done).length;
  return { done, total: session.sets.length };
}

type SetPatch = Partial<Pick<SetLog, 'load' | 'reps' | 'repsBySide' | 'done' | 'loadKind'>>;

/** Applies an edit; for per-side sets, `reps` is kept as the lower of the two sides. */
export function updateSet(session: Session, setId: string, patch: SetPatch, at = now()): Session {
  return {
    ...session,
    sets: session.sets.map((s) => {
      if (s.id !== setId) return s;
      const next: SetLog = { ...s, ...patch };
      if (next.repsBySide) {
        const { left, right } = next.repsBySide;
        next.reps = left !== null && right !== null ? Math.min(left, right) : (left ?? right);
      }
      if (patch.done === true && !s.done) next.completedAt = at;
      if (patch.done === false) delete next.completedAt;
      return next;
    }),
  };
}

export function setSlotLoadKind(session: Session, slotId: string, loadKind: LoadType): Session {
  return { ...session, sets: session.sets.map((s) => (s.slotId === slotId ? { ...s, loadKind } : s)) };
}

export function isSetComplete(s: SetLog): boolean {
  if (s.repsBySide) return s.repsBySide.left !== null && s.repsBySide.right !== null;
  return s.reps !== null;
}

/** Previous completed sets per exercise, indexed by set number. */
export type PreviousSets = Map<string, SetLog[]>;

/**
 * Values Enter falls back to when inputs are empty: the same set last session,
 * otherwise the set just above it in this session.
 */
export function suggestionFor(session: Session, set: SetLog, previous: PreviousSets): SetLog | null {
  const prior = previous.get(set.exerciseId)?.find((p) => p.setIndex === set.setIndex);
  if (prior) return prior;
  const above = setsForSlot(session, set.slotId).find((s) => s.setIndex === set.setIndex - 1);
  return above && isSetComplete(above) ? above : null;
}

/** Fills empty fields from the suggestion; returns the patch, or null if reps would still be missing. */
export function completionPatch(set: SetLog, suggestion: SetLog | null): SetPatch | null {
  const load = set.load ?? (suggestion && suggestion.loadKind === set.loadKind ? suggestion.load : null);
  if (set.repsBySide) {
    const left = set.repsBySide.left ?? suggestion?.repsBySide?.left ?? suggestion?.reps ?? null;
    const right = set.repsBySide.right ?? suggestion?.repsBySide?.right ?? suggestion?.reps ?? null;
    if (left === null || right === null) return null;
    return { load, repsBySide: { left, right }, done: true };
  }
  const reps = set.reps ?? suggestion?.reps ?? null;
  if (reps === null) return null;
  return { load, reps, done: true };
}

export function durationSec(session: Session, at: number = Date.now()): number {
  const end = session.finishedAt ? Date.parse(session.finishedAt) : at;
  return Math.max(0, Math.floor((end - Date.parse(session.startedAt)) / 1000));
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatLoad(load: number | null, kind: LoadType): string {
  const n = load === null ? null : Number(load.toFixed(2));
  if (kind === 'bodyweight') return n ? `BW+${n}` : 'BW';
  if (kind === 'assisted') return n ? `BW−${n}` : 'BW';
  return n === null ? '–' : `${n} kg`;
}

export function formatSet(s: SetLog): string {
  const reps = s.repsBySide ? `${s.repsBySide.left ?? '–'}/${s.repsBySide.right ?? '–'}` : `${s.reps ?? '–'}`;
  return `${formatLoad(s.load, s.loadKind)} × ${reps}`;
}

export interface ExerciseSummary {
  slotId: string;
  name: string;
  done: SetLog[];
  planned: number;
  previous: SetLog[];
}

export function summarize(session: Session, previous: PreviousSets) {
  const { done, total } = progress(session);
  const exercises: ExerciseSummary[] = [...session.plan.slots]
    .sort((a, b) => a.order - b.order)
    .map((slot) => ({
      slotId: slot.id,
      name: slot.exerciseName,
      done: setsForSlot(session, slot.id).filter((s) => s.done),
      planned: slot.sets,
      previous: previous.get(slot.exerciseId) ?? [],
    }));
  return { durationSec: durationSec(session), done, total, exercises };
}

import { newId } from '../db/records';
import type { Slot, SupersetGroup, Template, WorkoutMode } from '../db/types';
import { buildUnits, flattenUnits, unitKey, type Unit } from './units';

export const DEFAULT_SETS = 2;
export const DEFAULT_REST_SEC = 180;

export const LIMITS = {
  sets: { min: 1, max: 10 },
  reps: { min: 1, max: 100 },
  restSec: { min: 0, max: 900 },
} as const;

type SlotPatch = Partial<Pick<Slot, 'sets' | 'repMin' | 'repMax' | 'restSec'>>;

function withUnits(t: Template, edit: (units: Unit[]) => Unit[]): Template {
  return { ...t, ...flattenUnits(edit(buildUnits(t))) };
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Removes a slot from its unit; returns remaining units, the removed slot, and where its unit was. */
function extract(units: Unit[], slotId: string) {
  const index = units.findIndex((u) => u.slots.some((s) => s.id === slotId));
  if (index === -1) return null;
  const slot = units[index].slots.find((s) => s.id === slotId)!;
  const unit = { ...units[index], slots: units[index].slots.filter((s) => s.id !== slotId) };
  const next = [...units];
  if (unit.slots.length === 0) next.splice(index, 1);
  else next[index] = unit;
  return { units: next, slot, index, unitRemains: unit.slots.length > 0 };
}

export function updateSlot(t: Template, slotId: string, patch: SlotPatch): Template {
  return { ...t, slots: t.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)) };
}

export function updateGroupRest(t: Template, groupId: string, restSec: number): Template {
  return { ...t, groups: t.groups.map((g) => (g.id === groupId ? { ...g, restSec } : g)) };
}

export function setMode(t: Template, mode: WorkoutMode): Template {
  return { ...t, mode };
}

/** Moves a whole superset or standalone exercise up (-1) or down (+1). */
export function moveUnit(t: Template, key: string, dir: -1 | 1): Template {
  return withUnits(t, (units) => {
    const i = units.findIndex((u) => unitKey(u) === key);
    return i === -1 ? units : swap(units, i, i + dir);
  });
}

/** Moves an exercise up or down inside its superset. */
export function moveWithinGroup(t: Template, slotId: string, dir: -1 | 1): Template {
  return withUnits(t, (units) =>
    units.map((u) => {
      const i = u.slots.findIndex((s) => s.id === slotId);
      return i === -1 || !u.group ? u : { ...u, slots: swap(u.slots, i, i + dir) };
    }),
  );
}

/**
 * Reassigns an exercise: null = standalone (placed right after its old superset),
 * 'new' = a new superset in its place, or an existing group id (appended to that superset).
 */
export function setSlotGroup(t: Template, slotId: string, target: string | null | 'new'): Template {
  return withUnits(t, (units) => {
    const found = extract(units, slotId);
    if (!found) return units;
    const { slot, index, unitRemains } = found;
    const next = found.units;
    const insertAt = unitRemains ? index + 1 : index;

    if (target === null) {
      next.splice(insertAt, 0, { group: null, slots: [slot] });
    } else if (target === 'new') {
      const group: SupersetGroup = { id: newId(), restSec: DEFAULT_REST_SEC, order: 0 };
      next.splice(insertAt, 0, { group, slots: [slot] });
    } else {
      const gi = next.findIndex((u) => u.group?.id === target);
      if (gi === -1) return units;
      next[gi] = { ...next[gi], slots: [...next[gi].slots, slot] };
    }
    return next;
  });
}

/** Turns every member of a superset into a standalone exercise, in place. */
export function dissolveGroup(t: Template, groupId: string): Template {
  return withUnits(t, (units) =>
    units.flatMap((u) => (u.group?.id === groupId ? u.slots.map((s) => ({ group: null, slots: [s] })) : [u])),
  );
}

export function removeSlot(t: Template, slotId: string): Template {
  return withUnits(t, (units) => extract(units, slotId)?.units ?? units);
}

export function addSlot(t: Template, exerciseId: string): Template {
  const slot: Slot = {
    id: newId(),
    exerciseId,
    order: Number.MAX_SAFE_INTEGER,
    groupId: null,
    sets: DEFAULT_SETS,
    repMin: 8,
    repMax: 12,
    restSec: DEFAULT_REST_SEC,
  };
  return withUnits({ ...t, slots: [...t.slots, slot] }, (u) => u);
}

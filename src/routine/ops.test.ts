import { describe, expect, it } from 'vitest';
import { buildSeed } from '../db/seed';
import type { Template } from '../db/types';
import {
  addSlot,
  dissolveGroup,
  moveUnit,
  moveWithinGroup,
  removeSlot,
  setSlotGroup,
  updateGroupRest,
  updateSlot,
} from './ops';
import { buildUnits, groupLabels, unitKey } from './units';

const { exercises, templates } = buildSeed();
const nameOf = new Map(exercises.map((e) => [e.id, e.name]));
const idOf = (name: string) => exercises.find((e) => e.name === name)!.id;
const A = templates[0];
const slotOf = (t: Template, name: string) => t.slots.find((s) => s.exerciseId === idOf(name))!;

/** Compact view: superset units become arrays of names, standalone units a bare name. */
function shape(t: Template) {
  return buildUnits(t).map((u) => (u.group ? u.slots.map((s) => nameOf.get(s.exerciseId)) : nameOf.get(u.slots[0].exerciseId)));
}

/** Invariants every edited routine must satisfy. */
function assertValid(t: Template) {
  const orders = [...t.slots].map((s) => s.order).sort((a, b) => a - b);
  expect(orders).toEqual(t.slots.map((_, i) => i));
  for (const g of t.groups) expect(t.slots.some((s) => s.groupId === g.id)).toBe(true);
  for (const s of t.slots) if (s.groupId) expect(t.groups.some((g) => g.id === s.groupId)).toBe(true);
  expect(t.groups.map((g) => g.order)).toEqual(t.groups.map((_, i) => i));
}

const ORIGINAL = [
  ['Pull-ups', 'Single-leg calf raises'],
  ['Bulgarian split squats', 'DB lateral raises'],
  ['Feet-elevated push-ups', 'DB supinating curls'],
  ['DB overhead triceps extensions', 'DB wrist extensions'],
  'DB hammer curls',
];

describe('units', () => {
  it('groups the seeded routine into four supersets and a standalone', () => {
    expect(shape(A)).toEqual(ORIGINAL);
    const units = buildUnits(A);
    expect([...groupLabels(units).values()]).toEqual(['A', 'B', 'C', 'D']);
  });

  it('keeps a group at the position of its first member even when orders are interleaved', () => {
    const [g] = A.groups;
    const messy: Template = {
      ...A,
      groups: [g],
      slots: [
        { ...A.slots[0], order: 0, groupId: g.id },
        { ...A.slots[8], order: 1, groupId: null },
        { ...A.slots[1], order: 2, groupId: g.id },
      ],
    };
    expect(shape(messy)).toEqual([['Pull-ups', 'Single-leg calf raises'], 'DB hammer curls']);
  });
});

describe('ops', () => {
  it('moves a whole superset and relabels by position', () => {
    const t = moveUnit(A, A.groups[1].id, -1);
    expect(shape(t).slice(0, 2)).toEqual([ORIGINAL[1], ORIGINAL[0]]);
    expect(groupLabels(buildUnits(t)).get(A.groups[1].id)).toBe('A');
    assertValid(t);
  });

  it('ignores moves past either end', () => {
    expect(shape(moveUnit(A, A.groups[0].id, -1))).toEqual(ORIGINAL);
    const last = unitKey(buildUnits(A).at(-1)!);
    expect(shape(moveUnit(A, last, 1))).toEqual(ORIGINAL);
  });

  it('reorders exercises inside a superset', () => {
    const t = moveWithinGroup(A, slotOf(A, 'Single-leg calf raises').id, -1);
    expect(shape(t)[0]).toEqual(['Single-leg calf raises', 'Pull-ups']);
    assertValid(t);
  });

  it('makes an exercise standalone right after its old superset', () => {
    const t = setSlotGroup(A, slotOf(A, 'DB lateral raises').id, null);
    expect(shape(t).slice(1, 3)).toEqual([['Bulgarian split squats'], 'DB lateral raises']);
    assertValid(t);
  });

  it('adds a standalone exercise to an existing superset as a tri-set', () => {
    const t = setSlotGroup(A, slotOf(A, 'DB hammer curls').id, A.groups[2].id);
    expect(shape(t)).toEqual([
      ORIGINAL[0],
      ORIGINAL[1],
      ['Feet-elevated push-ups', 'DB supinating curls', 'DB hammer curls'],
      ORIGINAL[3],
    ]);
    assertValid(t);
  });

  it('creates a new superset in place', () => {
    const t = setSlotGroup(A, slotOf(A, 'DB hammer curls').id, 'new');
    expect(t.groups).toHaveLength(5);
    expect(shape(t).at(-1)).toEqual(['DB hammer curls']);
    assertValid(t);
  });

  it('drops a superset once its last member leaves', () => {
    let t = setSlotGroup(A, slotOf(A, 'Pull-ups').id, null);
    t = setSlotGroup(t, slotOf(t, 'Single-leg calf raises').id, null);
    expect(t.groups).toHaveLength(3);
    expect(shape(t).slice(0, 2)).toEqual(['Single-leg calf raises', 'Pull-ups']);
    assertValid(t);
  });

  it('dissolves a superset into standalone exercises in place', () => {
    const t = dissolveGroup(A, A.groups[0].id);
    expect(shape(t).slice(0, 3)).toEqual(['Pull-ups', 'Single-leg calf raises', ORIGINAL[1]]);
    expect(t.groups).toHaveLength(3);
    assertValid(t);
  });

  it('removes and adds exercises', () => {
    let t = removeSlot(A, slotOf(A, 'DB wrist extensions').id);
    expect(shape(t)[3]).toEqual(['DB overhead triceps extensions']);
    t = addSlot(t, idOf('Dips'));
    expect(shape(t).at(-1)).toBe('Dips');
    expect(slotOf(t, 'Dips')).toMatchObject({ sets: 2, restSec: 180, groupId: null });
    assertValid(t);
  });

  it('edits slot and superset settings without touching anything else', () => {
    const pull = slotOf(A, 'Pull-ups');
    let t = updateSlot(A, pull.id, { sets: 3, repMin: 6, repMax: 12, restSec: 120 });
    t = updateGroupRest(t, A.groups[0].id, 90);
    expect(slotOf(t, 'Pull-ups')).toMatchObject({ sets: 3, repMin: 6, repMax: 12, restSec: 120 });
    expect(t.groups[0].restSec).toBe(90);
    expect(shape(t)).toEqual(ORIGINAL);
    expect(A.slots[0].sets).toBe(2);
  });
});

import type { Slot, SupersetGroup } from '../db/types';

/** A superset (group + members) or a standalone exercise (group null, one slot). */
export interface Unit<S extends Slot = Slot> {
  group: SupersetGroup | null;
  slots: S[];
}

interface Routine<S extends Slot> {
  groups: SupersetGroup[];
  slots: S[];
}

/** Display order: a group sits where its first member is; members keep their relative order. */
export function buildUnits<S extends Slot>({ groups, slots }: Routine<S>): Unit<S>[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const sorted = [...slots].sort((a, b) => a.order - b.order);
  const units: Unit<S>[] = [];
  const emitted = new Set<string>();

  for (const slot of sorted) {
    const group = slot.groupId ? groupById.get(slot.groupId) : undefined;
    if (!group) {
      units.push({ group: null, slots: [slot] });
    } else if (!emitted.has(group.id)) {
      emitted.add(group.id);
      units.push({ group, slots: sorted.filter((s) => s.groupId === group.id) });
    }
  }
  return units;
}

/** Inverse of buildUnits: contiguous slot orders, group orders by position, empty groups dropped. */
export function flattenUnits<S extends Slot>(units: Unit<S>[]): Routine<S> {
  const groups: SupersetGroup[] = [];
  const slots: S[] = [];
  for (const unit of units) {
    if (unit.slots.length === 0) continue;
    const groupId = unit.group ? unit.group.id : null;
    if (unit.group) groups.push({ ...unit.group, order: groups.length });
    for (const s of unit.slots) slots.push({ ...s, groupId, order: slots.length });
  }
  return { groups, slots };
}

export const unitKey = (u: Unit) => u.group?.id ?? u.slots[0].id;

/** A, B, C ... by position among supersets; standalone exercises get no letter. */
export function groupLabels(units: Unit[]): Map<string, string> {
  const labels = new Map<string, string>();
  let i = 0;
  for (const u of units) {
    if (u.group) labels.set(u.group.id, String.fromCharCode(65 + (i++ % 26)));
  }
  return labels;
}

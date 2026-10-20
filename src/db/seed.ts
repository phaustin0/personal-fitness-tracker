import type { DB } from './db';
import { newId, newRecord, now } from './records';
import type { Exercise, LoadType, Slot, SupersetGroup, Template } from './types';

const DEFAULT_SETS = 2;
const DEFAULT_REST_SEC = 180;

interface ExerciseDef {
  name: string;
  loadType: LoadType;
  unilateral?: boolean;
}

const EXERCISES: ExerciseDef[] = [
  { name: 'Pull-ups', loadType: 'bodyweight' },
  { name: 'Single-leg calf raises', loadType: 'bodyweight', unilateral: true },
  { name: 'Bulgarian split squats', loadType: 'bodyweight', unilateral: true },
  { name: 'DB lateral raises', loadType: 'dumbbell' },
  { name: 'Feet-elevated push-ups', loadType: 'bodyweight' },
  { name: 'DB supinating curls', loadType: 'dumbbell' },
  { name: 'DB overhead triceps extensions', loadType: 'dumbbell' },
  { name: 'DB wrist extensions', loadType: 'dumbbell' },
  { name: 'DB hammer curls', loadType: 'dumbbell' },
  { name: 'Australian pull-ups', loadType: 'bodyweight' },
  { name: 'DB goblet squats', loadType: 'dumbbell' },
  { name: 'Dips', loadType: 'bodyweight' },
  { name: 'DB concentration curls', loadType: 'dumbbell', unilateral: true },
  { name: 'DB lying triceps extensions', loadType: 'dumbbell' },
  { name: 'DB wrist curls', loadType: 'dumbbell' },
  { name: 'DB reverse curls', loadType: 'dumbbell' },
];

/** Each inner array is one superset; a single-item array is a standalone exercise. */
type Block = [name: string, repMin: number, repMax: number][];

interface TemplateDef {
  name: string;
  emphasis: string;
  blocks: Block[];
}

const TEMPLATES: TemplateDef[] = [
  {
    name: 'Full Body A',
    emphasis: 'Lat emphasis',
    blocks: [
      [['Pull-ups', 5, 10], ['Single-leg calf raises', 12, 20]],
      [['Bulgarian split squats', 8, 12], ['DB lateral raises', 12, 20]],
      [['Feet-elevated push-ups', 8, 15], ['DB supinating curls', 8, 12]],
      [['DB overhead triceps extensions', 10, 15], ['DB wrist extensions', 15, 20]],
      [['DB hammer curls', 10, 15]],
    ],
  },
  {
    name: 'Full Body B',
    emphasis: 'Upper/mid-back emphasis',
    blocks: [
      [['Australian pull-ups', 8, 15], ['Single-leg calf raises', 12, 20]],
      [['DB goblet squats', 10, 15], ['DB lateral raises', 12, 20]],
      [['Dips', 6, 12], ['DB concentration curls', 10, 15]],
      [['DB lying triceps extensions', 10, 15], ['DB wrist curls', 15, 20]],
      [['DB reverse curls', 10, 15]],
    ],
  },
];

export function buildSeed(at = now()): { exercises: Exercise[]; templates: Template[] } {
  const exercises = EXERCISES.map((d) =>
    newRecord({ name: d.name, loadType: d.loadType, unilateral: d.unilateral ?? false }, at),
  );
  const idByName = new Map(exercises.map((e) => [e.name, e.id]));

  const templates = TEMPLATES.map((t, tIndex) => {
    const groups: SupersetGroup[] = [];
    const slots: Slot[] = [];
    for (const block of t.blocks) {
      let groupId: string | null = null;
      if (block.length > 1) {
        groupId = newId();
        groups.push({ id: groupId, restSec: DEFAULT_REST_SEC, order: groups.length });
      }
      for (const [name, repMin, repMax] of block) {
        const exerciseId = idByName.get(name);
        if (!exerciseId) throw new Error(`Seed references unknown exercise: ${name}`);
        slots.push({
          id: newId(),
          exerciseId,
          order: slots.length,
          groupId,
          sets: DEFAULT_SETS,
          repMin,
          repMax,
          restSec: DEFAULT_REST_SEC,
        });
      }
    }
    return newRecord(
      { name: t.name, emphasis: t.emphasis, order: tIndex, mode: 'superset' as const, groups, slots },
      at,
    );
  });

  return { exercises, templates };
}

/** Writes default exercises and routines exactly once per database. Returns true if it seeded. */
export async function seedIfNeeded(db: DB): Promise<boolean> {
  const tx = db.transaction(['meta', 'exercises', 'templates'], 'readwrite');
  const meta = tx.objectStore('meta');
  if (await meta.get('seededAt')) {
    await tx.done;
    return false;
  }
  const at = now();
  const { exercises, templates } = buildSeed(at);
  await Promise.all([
    ...exercises.map((e) => tx.objectStore('exercises').put(e)),
    ...templates.map((t) => tx.objectStore('templates').put(t)),
    meta.put({ key: 'seededAt', value: at }),
    tx.done,
  ]);
  return true;
}

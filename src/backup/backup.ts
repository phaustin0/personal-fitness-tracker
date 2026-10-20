import type { DB } from '../db/db';
import { DB_VERSION } from '../db/schema';
import type { BodyMetric, Exercise, KeyValue, Session, Template } from '../db/types';

export const APP_ID = 'fitness-tracker';
export const FORMAT_VERSION = 1;
export const MAX_BYTES = 50 * 1024 * 1024;

export interface Dump {
  exercises: Exercise[];
  templates: Template[];
  sessions: Session[];
  bodyMetrics: BodyMetric[];
  settings: KeyValue[];
  meta: KeyValue[];
}

export interface Backup {
  app: typeof APP_ID;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  data: Dump;
}

const RECORD_STORES = ['exercises', 'templates', 'sessions', 'bodyMetrics'] as const;
const KV_STORES = ['settings', 'meta'] as const;
const ALL_STORES = [...RECORD_STORES, ...KV_STORES] as const;

export async function dumpAll(db: DB): Promise<Dump> {
  const [exercises, templates, sessions, bodyMetrics, settings, meta] = await Promise.all(ALL_STORES.map((s) => db.getAll(s)));
  return { exercises, templates, sessions, bodyMetrics, settings, meta } as Dump;
}

export function buildBackup(dump: Dump, at = new Date().toISOString()): Backup {
  return { app: APP_ID, formatVersion: FORMAT_VERSION, schemaVersion: DB_VERSION, exportedAt: at, data: dump };
}

export function backupFilename(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `fitness-tracker-backup-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.json`;
}

// ---------- validation ----------

type Check = (v: unknown, path: string, errors: string[]) => void;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDate = (v: unknown) => isStr(v) && !Number.isNaN(Date.parse(v));
const oneOf = (...vals: string[]) => (v: unknown) => isStr(v) && vals.includes(v);
const nullable = (f: (v: unknown) => boolean) => (v: unknown) => v === null || f(v);
const optional = (f: (v: unknown) => boolean) => (v: unknown) => v === undefined || f(v);

function shape(fields: Record<string, (v: unknown) => boolean>): Check {
  return (v, path, errors) => {
    if (!isObj(v)) {
      errors.push(`${path} is not an object`);
      return;
    }
    for (const [k, ok] of Object.entries(fields)) if (!ok(v[k])) errors.push(`${path}.${k} is missing or invalid`);
  };
}

const base = { id: isStr, createdAt: isDate, updatedAt: isDate, deletedAt: optional(isDate) };
const loadType = oneOf('bodyweight', 'weighted', 'assisted', 'dumbbell');
const mode = oneOf('superset', 'straight');
const arrayOf = (check: Check) => (v: unknown, path: string, errors: string[]) => {
  if (!Array.isArray(v)) errors.push(`${path} is not a list`);
  else v.forEach((x, i) => check(x, `${path}[${i}]`, errors));
};

const groupCheck = shape({ id: isStr, restSec: isNum, order: isNum });
const slotFields = { id: isStr, exerciseId: isStr, order: isNum, groupId: nullable(isStr), sets: isNum, repMin: isNum, repMax: isNum, restSec: isNum };
const slotCheck = shape(slotFields);
const planSlotCheck = shape({ ...slotFields, exerciseName: isStr, loadType, unilateral: (v) => typeof v === 'boolean' });
const setCheck = shape({
  id: isStr,
  slotId: isStr,
  exerciseId: isStr,
  setIndex: isNum,
  load: nullable(isNum),
  loadKind: loadType,
  reps: nullable(isNum),
  repsBySide: optional((v) => isObj(v) && nullable(isNum)(v.left) && nullable(isNum)(v.right)),
  done: (v) => typeof v === 'boolean',
  completedAt: optional(isDate),
});

const checks: Record<keyof Dump, Check> = {
  exercises: arrayOf(shape({ ...base, name: isStr, loadType, unilateral: (v) => typeof v === 'boolean' })),
  templates: arrayOf((v, path, errors) => {
    shape({ ...base, name: isStr, order: isNum, mode, groups: Array.isArray, slots: Array.isArray })(v, path, errors);
    if (isObj(v)) {
      arrayOf(groupCheck)(v.groups, `${path}.groups`, errors);
      arrayOf(slotCheck)(v.slots, `${path}.slots`, errors);
    }
  }),
  sessions: arrayOf((v, path, errors) => {
    shape({
      ...base,
      templateId: isStr,
      status: oneOf('active', 'completed', 'discarded'),
      startedAt: isDate,
      finishedAt: optional(isDate),
      mode,
      plan: isObj,
      sets: Array.isArray,
      exerciseIds: (x) => Array.isArray(x) && x.every(isStr),
    })(v, path, errors);
    if (isObj(v) && isObj(v.plan)) {
      shape({ templateName: isStr, groups: Array.isArray, slots: Array.isArray })(v.plan, `${path}.plan`, errors);
      arrayOf(groupCheck)(v.plan.groups, `${path}.plan.groups`, errors);
      arrayOf(planSlotCheck)(v.plan.slots, `${path}.plan.slots`, errors);
    }
    if (isObj(v)) arrayOf(setCheck)(v.sets, `${path}.sets`, errors);
  }),
  bodyMetrics: arrayOf(shape({ ...base, date: (v) => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v), type: isStr, value: isNum })),
  settings: arrayOf(shape({ key: isStr })),
  meta: arrayOf(shape({ key: isStr })),
};

export type Validation = { ok: true; backup: Backup; warnings: string[] } | { ok: false; errors: string[] };

export function parseBackup(text: string): Validation {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file isn’t valid JSON.'] };
  }
  return validateBackup(json);
}

export function validateBackup(json: unknown): Validation {
  if (!isObj(json) || json.app !== APP_ID) return { ok: false, errors: ['This isn’t a Fitness Tracker backup file.'] };
  if (!isNum(json.formatVersion) || json.formatVersion > FORMAT_VERSION) {
    return { ok: false, errors: ['This backup was made by a newer version of the app. Update the app and try again.'] };
  }
  if (!isNum(json.schemaVersion) || json.schemaVersion > DB_VERSION) {
    return { ok: false, errors: ['This backup uses a newer data format than this version of the app supports.'] };
  }
  if (!isDate(json.exportedAt) || !isObj(json.data)) return { ok: false, errors: ['The backup is missing its export date or data.'] };

  const errors: string[] = [];
  for (const store of ALL_STORES) checks[store](json.data[store], store, errors);
  if (errors.length) {
    const shown = errors.slice(0, 8);
    if (errors.length > shown.length) shown.push(`…and ${errors.length - shown.length} more problems`);
    return { ok: false, errors: shown };
  }

  const data = json.data as unknown as Dump;
  const warnings: string[] = [];
  for (const store of RECORD_STORES) {
    const ids = data[store].map((r) => r.id);
    if (new Set(ids).size !== ids.length) return { ok: false, errors: [`${store} contains duplicate ids.`] };
  }
  const exerciseIds = new Set(data.exercises.map((e) => e.id));
  const missing = data.templates.flatMap((t) => t.slots.filter((s) => !exerciseIds.has(s.exerciseId)));
  if (missing.length) warnings.push(`${missing.length} routine exercise(s) point to exercises not in the backup.`);

  return { ok: true, backup: json as unknown as Backup, warnings };
}

// ---------- preview ----------

const live = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

export function summarize(d: Dump) {
  const completed = live(d.sessions).filter((s) => s.status === 'completed');
  const dates = completed.map((s) => s.startedAt).sort();
  return {
    workouts: completed.length,
    active: live(d.sessions).some((s) => s.status === 'active'),
    routines: live(d.templates).length,
    exercises: live(d.exercises).length,
    measurements: live(d.bodyMetrics).length,
    firstWorkout: dates[0] ?? null,
    lastWorkout: dates.at(-1) ?? null,
  };
}

// ---------- merge ----------

export interface MergePlan {
  puts: { [K in keyof Dump]: Dump[K] };
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Records are matched by id and the newer `updatedAt` wins. Settings and meta already present
 * here are kept, so merging never changes this browser's schedule or active workout.
 */
export function planMerge(current: Dump, incoming: Dump): MergePlan {
  const plan: MergePlan = {
    puts: { exercises: [], templates: [], sessions: [], bodyMetrics: [], settings: [], meta: [] },
    added: 0,
    updated: 0,
    unchanged: 0,
  };
  for (const store of RECORD_STORES) {
    const mine = new Map<string, { updatedAt: string }>(current[store].map((r) => [r.id, r]));
    for (const r of incoming[store] as { id: string; updatedAt: string }[]) {
      const existing = mine.get(r.id);
      if (!existing) plan.added++;
      else if (r.updatedAt > existing.updatedAt) plan.updated++;
      else {
        plan.unchanged++;
        continue;
      }
      (plan.puts[store] as unknown[]).push(r);
    }
  }
  for (const store of KV_STORES) {
    const keys = new Set(current[store].map((r) => r.key));
    plan.puts[store] = incoming[store].filter((r) => !keys.has(r.key) && r.key !== 'activeSessionId');
  }
  return plan;
}

export async function applyMerge(db: DB, plan: MergePlan): Promise<void> {
  const tx = db.transaction([...ALL_STORES], 'readwrite');
  const writes: Promise<unknown>[] = [];
  for (const store of ALL_STORES) for (const r of plan.puts[store]) writes.push(tx.objectStore(store).put(r as never));
  await Promise.all([...writes, tx.done]);
}

/** Wipes every store and writes the backup's data, all or nothing. */
export async function applyReplace(db: DB, data: Dump): Promise<void> {
  const tx = db.transaction([...ALL_STORES], 'readwrite');
  const writes: Promise<unknown>[] = ALL_STORES.map((s) => tx.objectStore(s).clear());
  for (const store of ALL_STORES) for (const r of data[store]) writes.push(tx.objectStore(store).put(r as never));
  await Promise.all([...writes, tx.done]);
}

export function downloadJson(obj: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const BACKUP_REMINDER_DAYS = 14;

/** Remind once there's something worth losing: 3+ workouts and no backup, or a stale one with newer changes. */
export function needsBackupReminder(sessions: Session[], lastBackup: string | null, now: number): boolean {
  if (sessions.length < 3) return false;
  if (!lastBackup) return true;
  const stale = now - Date.parse(lastBackup) > BACKUP_REMINDER_DAYS * 864e5;
  return stale && sessions.some((s) => s.updatedAt > lastBackup);
}

import { newRecord, now } from '../db/records';
import type { BodyMetric } from '../db/types';

export interface MetricDef {
  type: string;
  label: string;
  unit: 'kg' | 'cm';
  min: number;
  max: number;
  primary?: boolean;
}

export const METRICS: MetricDef[] = [
  { type: 'bodyweight', label: 'Body weight', unit: 'kg', min: 20, max: 300, primary: true },
  { type: 'waist', label: 'Waist', unit: 'cm', min: 30, max: 250, primary: true },
  { type: 'chest', label: 'Chest', unit: 'cm', min: 30, max: 250 },
  { type: 'hips', label: 'Hips', unit: 'cm', min: 30, max: 250 },
  { type: 'neck', label: 'Neck', unit: 'cm', min: 15, max: 80 },
  { type: 'arm', label: 'Arm', unit: 'cm', min: 10, max: 80 },
  { type: 'thigh', label: 'Thigh', unit: 'cm', min: 20, max: 120 },
  { type: 'calf', label: 'Calf', unit: 'cm', min: 15, max: 80 },
];

export const metricDef = (type: string) => METRICS.find((m) => m.type === type);

/** '' = no value; otherwise a positive number with up to 2 decimals inside the metric's range. */
export function parseMeasurement(raw: string, def: MetricDef): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = raw.trim().replace(',', '.');
  if (t === '') return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, error: `${def.label}: enter a number like 72.5` };
  const n = Number(t);
  if (n < def.min || n > def.max) return { ok: false, error: `${def.label}: use ${def.min}–${def.max} ${def.unit}` };
  return { ok: true, value: n };
}

export interface DateRow {
  date: string;
  values: Map<string, BodyMetric>;
}

/** One row per date, newest first; if a type was logged twice on a day, the latest edit wins. */
export function rowsByDate(entries: BodyMetric[]): DateRow[] {
  const byDate = new Map<string, Map<string, BodyMetric>>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    const row = byDate.get(e.date) ?? new Map<string, BodyMetric>();
    const prev = row.get(e.type);
    if (!prev || e.updatedAt > prev.updatedAt) row.set(e.type, e);
    byDate.set(e.date, row);
  }
  return [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, values]) => ({ date, values }));
}

/**
 * Turns a form submission for one date into writes: new or changed values are put,
 * fields cleared that previously had a value are soft-deleted.
 */
export function planSave(date: string, values: Record<string, number | null>, existing: Map<string, BodyMetric>, at = now()) {
  const puts: BodyMetric[] = [];
  const deletes: BodyMetric[] = [];
  for (const [type, value] of Object.entries(values)) {
    const prev = existing.get(type);
    if (value === null) {
      if (prev) deletes.push({ ...prev, deletedAt: at, updatedAt: at });
    } else if (!prev) {
      puts.push(newRecord({ date, type, value }, at));
    } else if (prev.value !== value) {
      puts.push({ ...prev, value, updatedAt: at });
    }
  }
  return { puts, deletes };
}

export function todayKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Latest value and the change from the first entry, for a quick summary. */
export function latestAndChange(entries: BodyMetric[], type: string) {
  const series = rowsByDate(entries)
    .map((r) => r.values.get(type))
    .filter((e): e is BodyMetric => !!e)
    .reverse();
  if (!series.length) return null;
  const first = series[0];
  const last = series.at(-1)!;
  return { latest: last, first, change: Number((last.value - first.value).toFixed(2)), count: series.length };
}

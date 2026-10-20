import type { Schedule, Session, Template } from '../db/types';

export const PRESETS: Record<Schedule['kind'], number[]> = {
  '3x': [1, 3, 5],
  '4x': [1, 2, 4, 5],
};

/** Monday-first order for display; values are JS getDay() numbers (0 = Sunday). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** A schedule is valid when its day count matches 3 or 4 sessions per week. */
export function scheduleFromDays(days: number[]): Schedule | null {
  const unique = [...new Set(days)].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
  if (unique.length === 3) return { kind: '3x', days: unique };
  if (unique.length === 4) return { kind: '4x', days: unique };
  return null;
}

export function isTrainingDay(schedule: Schedule, d: Date): boolean {
  return schedule.days.includes(d.getDay());
}

/** The first training day on or after `from`. */
export function nextTrainingDay(schedule: Schedule, from: Date): Date | null {
  if (schedule.days.length === 0) return null;
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (isTrainingDay(schedule, d)) return d;
  }
  return null;
}

/**
 * Routines strictly alternate (A/B/A then B/A/B for 3x, A/B/A/B for 4x), so the next one
 * is simply the routine after the most recently completed session.
 */
export function nextTemplate(templates: Template[], completed: Session[]): Template | null {
  if (templates.length === 0) return null;
  const last = [...completed].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1);
  const i = last ? templates.findIndex((t) => t.id === last.templateId) : -1;
  return templates[(i + 1) % templates.length];
}

export interface WeekDay {
  date: Date;
  key: string;
  scheduled: boolean;
  isToday: boolean;
  done: Session[];
  /** For today or later scheduled days without a session: the routine expected, by alternation. */
  planned: Template | null;
  /** A past scheduled day with no workout, after training started. */
  missed: boolean;
}

export function weekPlan(schedule: Schedule, templates: Template[], completed: Session[], today: Date): WeekDay[] {
  const start = startOfWeek(today);
  const todayKey = dayKey(today);
  const byDay = new Map<string, Session[]>();
  for (const s of completed) {
    const k = dayKey(new Date(s.startedAt));
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  const firstKey = completed.reduce<string | null>((min, s) => {
    const k = dayKey(new Date(s.startedAt));
    return min === null || k < min ? k : min;
  }, null);

  const upNext = nextTemplate(templates, completed);
  let offset = upNext ? templates.indexOf(upNext) : 0;

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const key = dayKey(date);
    const done = byDay.get(key) ?? [];
    const scheduled = isTrainingDay(schedule, date);
    const future = key >= todayKey;
    let planned: Template | null = null;
    if (scheduled && future && done.length === 0 && templates.length) {
      planned = templates[offset % templates.length];
      offset++;
    }
    return { date, key, scheduled, isToday: key === todayKey, done, planned, missed: scheduled && !future && done.length === 0 && firstKey !== null && key > firstKey };
  });
}

import type { Session } from '../db/types';
import { isSetComplete } from '../workout/session';

export interface MonthGroup {
  key: string;
  label: string;
  sessions: Session[];
}

/** Newest first, grouped by calendar month of the start time (local time). */
export function groupByMonth(sessions: Session[]): MonthGroup[] {
  const sorted = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const groups: MonthGroup[] = [];
  for (const s of sorted) {
    const d = new Date(s.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), sessions: [] };
      groups.push(g);
    }
    g.sessions.push(s);
  }
  return groups;
}

/** ISO timestamp -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function durationMinutes(s: Session): number {
  if (!s.finishedAt) return 0;
  return Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000);
}

export function withTiming(s: Session, startedAt: string, minutes: number): Session {
  return { ...s, startedAt, finishedAt: new Date(Date.parse(startedAt) + minutes * 60000).toISOString() };
}

export const MAX_DURATION_MIN = 600;

/** Problems that block saving an edited session, or an empty list. */
export function validateSession(s: Session, now = Date.now()): string[] {
  const errors: string[] = [];
  const start = Date.parse(s.startedAt);
  if (Number.isNaN(start)) errors.push('Enter a valid start date and time.');
  else if (start > now) errors.push('The start time can’t be in the future.');
  const mins = durationMinutes(s);
  if (mins < 1 || mins > MAX_DURATION_MIN) errors.push(`Duration must be 1–${MAX_DURATION_MIN} minutes.`);
  if (s.sets.some((x) => x.done && !isSetComplete(x))) errors.push('Every ticked set needs reps.');
  return errors;
}

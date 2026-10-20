import type { DB } from '../db/db';
import { now } from '../db/records';
import { exercises, sessions, settings, templates } from '../db/repos';
import type { Session } from '../db/types';
import { createSession, type PreviousSets } from './session';

/** The unfinished workout, if any. Falls back to scanning in case the pointer was lost. */
export async function getActiveSession(db: DB): Promise<Session | null> {
  const id = await settings.get(db, 'activeSessionId');
  if (id) {
    const s = await sessions.get(db, id);
    if (s && s.status === 'active' && !s.deletedAt) return s;
  }
  const active = await sessions.byStatus(db, 'active');
  return active.at(-1) ?? null;
}

export async function startSession(db: DB, templateId: string): Promise<Session> {
  const existing = await getActiveSession(db);
  if (existing) return existing;

  const t = await templates.get(db, templateId);
  if (!t || t.deletedAt) throw new Error('That routine no longer exists.');
  const lib = await exercises.list(db, { includeDeleted: true });
  const session = createSession(t, new Map(lib.map((e) => [e.id, e])));

  const tx = db.transaction(['sessions', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessions').put(session),
    tx.objectStore('settings').put({ key: 'activeSessionId', value: session.id }),
    tx.done,
  ]);
  return session;
}

export async function saveSession(db: DB, session: Session): Promise<Session> {
  return sessions.put(db, session);
}

async function closeSession(db: DB, session: Session, status: 'completed' | 'discarded'): Promise<Session> {
  const at = now();
  const closed: Session = { ...session, status, finishedAt: at, updatedAt: at };
  const tx = db.transaction(['sessions', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessions').put(closed),
    tx.objectStore('settings').put({ key: 'activeSessionId', value: null }),
    tx.done,
  ]);
  return closed;
}

export const finishSession = (db: DB, s: Session) => closeSession(db, s, 'completed');
export const discardSession = (db: DB, s: Session) => closeSession(db, s, 'discarded');

/** Most recent completed performance of each exercise, excluding one session. */
export async function previousSets(db: DB, exerciseIds: string[], excludeSessionId?: string): Promise<PreviousSets> {
  const out: PreviousSets = new Map();
  await Promise.all(
    exerciseIds.map(async (exerciseId) => {
      const found = (await sessions.byExercise(db, exerciseId)).filter((s) => s.id !== excludeSessionId);
      for (const s of found) {
        const sets = s.sets.filter((x) => x.exerciseId === exerciseId && x.done).sort((a, b) => a.setIndex - b.setIndex);
        if (sets.length) {
          out.set(exerciseId, sets);
          break;
        }
      }
    }),
  );
  return out;
}

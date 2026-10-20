import type { DB } from './db';
import { now } from './records';
import type { BodyMetric, Exercise, MetaMap, Session, SessionStatus, SettingsMap, Template } from './types';

type RecordStore = 'exercises' | 'templates' | 'sessions' | 'bodyMetrics';
type StoreValue<S extends RecordStore> = {
  exercises: Exercise;
  templates: Template;
  sessions: Session;
  bodyMetrics: BodyMetric;
}[S];

interface ListOptions {
  includeDeleted?: boolean;
}

const live = <T extends { deletedAt?: string }>(rows: T[], opts?: ListOptions) =>
  opts?.includeDeleted ? rows : rows.filter((r) => !r.deletedAt);

function recordRepo<S extends RecordStore>(store: S) {
  return {
    get: (db: DB, id: string) => db.get(store, id) as Promise<StoreValue<S> | undefined>,

    async list(db: DB, opts?: ListOptions): Promise<StoreValue<S>[]> {
      return live((await db.getAll(store)) as StoreValue<S>[], opts);
    },

    async put(db: DB, record: StoreValue<S>): Promise<StoreValue<S>> {
      const saved = { ...record, updatedAt: now() };
      await db.put(store, saved as never);
      return saved;
    },

    async softDelete(db: DB, id: string): Promise<void> {
      const tx = db.transaction(store, 'readwrite');
      const existing = (await tx.store.get(id)) as StoreValue<S> | undefined;
      if (existing && !existing.deletedAt) {
        const at = now();
        await tx.store.put({ ...existing, deletedAt: at, updatedAt: at } as never);
      }
      await tx.done;
    },
  };
}

export const exercises = recordRepo('exercises');

export const templates = {
  ...recordRepo('templates'),
  async list(db: DB, opts?: ListOptions): Promise<Template[]> {
    return live(await db.getAll('templates'), opts).sort((a, b) => a.order - b.order);
  },
};

export const sessions = {
  ...recordRepo('sessions'),

  async byStatus(db: DB, status: SessionStatus): Promise<Session[]> {
    const rows = await db.getAllFromIndex('sessions', 'status', status);
    return live(rows).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  },

  /** Non-deleted sessions containing the exercise, newest first. */
  async byExercise(db: DB, exerciseId: string, status: SessionStatus = 'completed'): Promise<Session[]> {
    const rows = await db.getAllFromIndex('sessions', 'exerciseIds', exerciseId);
    return live(rows)
      .filter((s) => s.status === status)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
};

export const bodyMetrics = {
  ...recordRepo('bodyMetrics'),

  /** Non-deleted entries of one type, oldest first. */
  async byType(db: DB, type: string): Promise<BodyMetric[]> {
    const range = IDBKeyRange.bound([type, ''], [type, '￿']);
    return live(await db.getAllFromIndex('bodyMetrics', 'type_date', range));
  },
};

const SETTING_DEFAULTS: SettingsMap = {
  units: 'kg',
  activeSessionId: null,
  schedule: { kind: '3x', days: [1, 3, 5] },
};

export const settings = {
  async get<K extends keyof SettingsMap>(db: DB, key: K): Promise<SettingsMap[K]> {
    const row = await db.get('settings', key);
    return row ? (row.value as SettingsMap[K]) : structuredClone(SETTING_DEFAULTS[key]);
  },
  async set<K extends keyof SettingsMap>(db: DB, key: K, value: SettingsMap[K]): Promise<void> {
    await db.put('settings', { key, value });
  },
};

export const meta = {
  async get<K extends keyof MetaMap>(db: DB, key: K): Promise<MetaMap[K] | undefined> {
    return (await db.get('meta', key))?.value as MetaMap[K] | undefined;
  },
  async set<K extends keyof MetaMap>(db: DB, key: K, value: MetaMap[K]): Promise<void> {
    await db.put('meta', { key, value });
  },
};

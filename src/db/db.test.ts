import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAppDB, type DB } from './db';
import { newRecord } from './records';
import { bodyMetrics, exercises, sessions, settings, templates } from './repos';
import { migrations } from './schema';
import { seedIfNeeded } from './seed';
import type { Session } from './types';

let db: DB;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  db = await openAppDB();
});

afterEach(() => db.close());

function makeSession(fields: Partial<Session>): Session {
  return newRecord({
    templateId: 't',
    status: 'completed',
    startedAt: '2026-10-01T10:00:00.000Z',
    mode: 'superset',
    plan: { templateName: 'T', groups: [], slots: [] },
    sets: [],
    exerciseIds: [],
    ...fields,
  } as Omit<Session, 'id' | 'createdAt' | 'updatedAt'>);
}

describe('schema', () => {
  it('creates every store and index', () => {
    expect([...db.objectStoreNames].sort()).toEqual(
      ['bodyMetrics', 'exercises', 'meta', 'sessions', 'settings', 'templates'].sort(),
    );
    const tx = db.transaction('sessions');
    expect([...tx.store.indexNames].sort()).toEqual(['exerciseIds', 'startedAt', 'status', 'templateId']);
    expect(tx.store.index('exerciseIds').multiEntry).toBe(true);
  });

  it('runs later migrations on an existing database without losing data', async () => {
    const name = 'migration-test';
    const v1 = await openAppDB(name, 1);
    await exercises.put(v1, newRecord({ name: 'Kept', loadType: 'bodyweight' as const, unilateral: false }));
    v1.close();

    let ranV2 = false;
    migrations.push(() => {
      ranV2 = true;
    });
    try {
      const v2 = await openAppDB(name, 2);
      expect(ranV2).toBe(true);
      expect((await exercises.list(v2)).map((e) => e.name)).toEqual(['Kept']);
      v2.close();
    } finally {
      migrations.pop();
    }
  });
});

describe('seed', () => {
  it('seeds once and only once', async () => {
    expect(await seedIfNeeded(db)).toBe(true);
    expect(await seedIfNeeded(db)).toBe(false);
    expect(await exercises.list(db)).toHaveLength(16);
    expect(await templates.list(db)).toHaveLength(2);
  });

  it('seeds only once when called concurrently', async () => {
    const results = await Promise.all([seedIfNeeded(db), seedIfNeeded(db)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await exercises.list(db)).toHaveLength(16);
  });

  it('shares exercises that appear in both routines', async () => {
    await seedIfNeeded(db);
    const [a, b] = await templates.list(db);
    const all = await exercises.list(db);
    const idOf = (name: string) => all.find((e) => e.name === name)!.id;
    for (const name of ['Single-leg calf raises', 'DB lateral raises']) {
      expect(a.slots.some((s) => s.exerciseId === idOf(name))).toBe(true);
      expect(b.slots.some((s) => s.exerciseId === idOf(name))).toBe(true);
    }
  });

  it('builds routines matching the program', async () => {
    await seedIfNeeded(db);
    const [a, b] = await templates.list(db);
    const names = new Map((await exercises.list(db)).map((e) => [e.id, e]));

    expect(a.name).toBe('Full Body A');
    expect(b.name).toBe('Full Body B');
    for (const t of [a, b]) {
      expect(t.mode).toBe('superset');
      expect(t.groups).toHaveLength(4);
      expect(t.slots).toHaveLength(9);
      expect(t.slots.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(t.slots.every((s) => s.sets === 2 && s.restSec === 180)).toBe(true);
      expect(t.groups.every((g) => g.restSec === 180)).toBe(true);
      expect(t.slots[8].groupId).toBeNull();
      for (let i = 0; i < 8; i += 2) {
        expect(t.slots[i].groupId).not.toBeNull();
        expect(t.slots[i].groupId).toBe(t.slots[i + 1].groupId);
      }
    }

    const pullUps = a.slots[0];
    expect(names.get(pullUps.exerciseId)!.name).toBe('Pull-ups');
    expect([pullUps.repMin, pullUps.repMax]).toEqual([5, 10]);
    expect(names.get(b.slots[4].exerciseId)!.name).toBe('Dips');
    expect(names.get(b.slots[5].exerciseId)!.unilateral).toBe(true);
  });
});

describe('repositories', () => {
  it('put keeps createdAt and refreshes updatedAt', async () => {
    const e = newRecord({ name: 'X', loadType: 'dumbbell' as const, unilateral: false }, '2020-01-01T00:00:00.000Z');
    const saved = await exercises.put(db, e);
    expect(saved.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(saved.updatedAt > saved.createdAt).toBe(true);
  });

  it('soft delete hides records from lists but keeps them', async () => {
    const e = await exercises.put(db, newRecord({ name: 'Gone', loadType: 'dumbbell' as const, unilateral: false }));
    await exercises.softDelete(db, e.id);
    expect(await exercises.list(db)).toHaveLength(0);
    expect(await exercises.list(db, { includeDeleted: true })).toHaveLength(1);
    expect((await exercises.get(db, e.id))?.deletedAt).toBeTruthy();
  });

  it('finds completed sessions by exercise, newest first', async () => {
    await sessions.put(db, makeSession({ startedAt: '2026-10-01T10:00:00.000Z', exerciseIds: ['x', 'y'] }));
    await sessions.put(db, makeSession({ startedAt: '2026-10-05T10:00:00.000Z', exerciseIds: ['x'] }));
    await sessions.put(db, makeSession({ startedAt: '2026-10-07T10:00:00.000Z', exerciseIds: ['x'], status: 'active' }));
    await sessions.put(db, makeSession({ startedAt: '2026-10-08T10:00:00.000Z', exerciseIds: ['y'] }));

    const found = await sessions.byExercise(db, 'x');
    expect(found.map((s) => s.startedAt.slice(0, 10))).toEqual(['2026-10-05', '2026-10-01']);
    expect(await sessions.byStatus(db, 'active')).toHaveLength(1);
  });

  it('returns body metrics of one type in date order', async () => {
    for (const [type, date, value] of [
      ['bodyweight', '2026-10-10', 74.2],
      ['waist', '2026-10-01', 80],
      ['bodyweight', '2026-10-01', 75],
    ] as const) {
      await bodyMetrics.put(db, newRecord({ type, date, value }));
    }
    const rows = await bodyMetrics.byType(db, 'bodyweight');
    expect(rows.map((r) => [r.date, r.value])).toEqual([
      ['2026-10-01', 75],
      ['2026-10-10', 74.2],
    ]);
  });

  it('returns setting defaults until set, without sharing the default object', async () => {
    const schedule = await settings.get(db, 'schedule');
    expect(schedule).toEqual({ kind: '3x', days: [1, 3, 5] });
    schedule.days.push(6);
    expect((await settings.get(db, 'schedule')).days).toEqual([1, 3, 5]);

    await settings.set(db, 'schedule', { kind: '4x', days: [1, 2, 4, 5] });
    expect(await settings.get(db, 'schedule')).toEqual({ kind: '4x', days: [1, 2, 4, 5] });
    expect(await settings.get(db, 'units')).toBe('kg');
  });
});

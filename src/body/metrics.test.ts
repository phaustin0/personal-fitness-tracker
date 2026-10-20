import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAppDB, type DB } from '../db/db';
import { newRecord } from '../db/records';
import { bodyMetrics } from '../db/repos';
import type { BodyMetric } from '../db/types';
import { latestAndChange, metricDef, parseMeasurement, planSave, rowsByDate } from './metrics';

const entry = (date: string, type: string, value: number, updatedAt = `${date}T08:00:00.000Z`): BodyMetric =>
  ({ ...newRecord({ date, type, value }, updatedAt) });

describe('parsing', () => {
  const kg = metricDef('bodyweight')!;
  it('accepts blanks, decimals, and commas within range', () => {
    expect(parseMeasurement('', kg)).toEqual({ ok: true, value: null });
    expect(parseMeasurement(' 72.5 ', kg)).toEqual({ ok: true, value: 72.5 });
    expect(parseMeasurement('72,45', kg)).toEqual({ ok: true, value: 72.45 });
  });
  it('rejects junk, too many decimals, and out-of-range values', () => {
    expect(parseMeasurement('abc', kg).ok).toBe(false);
    expect(parseMeasurement('72.555', kg).ok).toBe(false);
    expect(parseMeasurement('5', kg).ok).toBe(false);
    expect(parseMeasurement('-70', kg).ok).toBe(false);
  });
});

describe('rows and saving', () => {
  it('groups by date, newest first, latest edit wins, deleted ignored', () => {
    const rows = rowsByDate([
      entry('2026-10-01', 'bodyweight', 75),
      entry('2026-10-08', 'bodyweight', 74.2),
      entry('2026-10-08', 'waist', 81),
      entry('2026-10-08', 'bodyweight', 74.6, '2026-10-08T20:00:00.000Z'),
      { ...entry('2026-10-05', 'waist', 82), deletedAt: '2026-10-06T00:00:00.000Z' },
    ]);
    expect(rows.map((r) => [r.date, Object.fromEntries([...r.values].map(([k, v]) => [k, v.value]))])).toEqual([
      ['2026-10-08', { bodyweight: 74.6, waist: 81 }],
      ['2026-10-01', { bodyweight: 75 }],
    ]);
  });

  it('adds new values, updates changed ones, deletes cleared ones, and skips unchanged', () => {
    const weight = entry('2026-10-08', 'bodyweight', 74.2);
    const waist = entry('2026-10-08', 'waist', 81);
    const chest = entry('2026-10-08', 'chest', 100);
    const existing = new Map([
      ['bodyweight', weight],
      ['waist', waist],
      ['chest', chest],
    ]);
    const { puts, deletes } = planSave('2026-10-08', { bodyweight: 74.0, waist: 81, chest: null, arm: 35 }, existing);
    expect(puts.map((p) => [p.type, p.value])).toEqual([
      ['bodyweight', 74],
      ['arm', 35],
    ]);
    expect(puts[0].id).toBe(weight.id);
    expect(deletes.map((d) => d.id)).toEqual([chest.id]);
    expect(deletes[0].deletedAt).toBeTruthy();
  });

  it('summarises latest value and change since the first entry', () => {
    const s = latestAndChange(
      [entry('2026-09-01', 'bodyweight', 76), entry('2026-10-08', 'bodyweight', 74.2), entry('2026-10-01', 'bodyweight', 75)],
      'bodyweight',
    )!;
    expect([s.latest.value, s.first.value, s.change, s.count]).toEqual([74.2, 76, -1.8, 3]);
    expect(latestAndChange([], 'waist')).toBeNull();
  });
});

describe('storage', () => {
  let db: DB;
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    db = await openAppDB();
  });
  afterEach(() => db.close());

  it('persists, edits, and deletes entries', async () => {
    const first = planSave('2026-10-20', { bodyweight: 74.2, waist: 81 }, new Map());
    for (const p of first.puts) await bodyMetrics.put(db, p);
    let rows = rowsByDate(await bodyMetrics.list(db));
    expect(rows[0].values.get('waist')!.value).toBe(81);

    const second = planSave('2026-10-20', { bodyweight: 74.0, waist: null }, rows[0].values);
    for (const p of [...second.puts, ...second.deletes]) await bodyMetrics.put(db, p);
    rows = rowsByDate(await bodyMetrics.list(db));
    expect([...rows[0].values.keys()]).toEqual(['bodyweight']);
    expect(rows[0].values.get('bodyweight')!.value).toBe(74);
    expect(await bodyMetrics.byType(db, 'waist')).toHaveLength(0);
  });
});

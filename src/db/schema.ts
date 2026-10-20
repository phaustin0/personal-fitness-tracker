import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { BodyMetric, Exercise, KeyValue, Session, Template } from './types';

export const DB_NAME = 'fitness-tracker';

export interface AppDB extends DBSchema {
  exercises: { key: string; value: Exercise; indexes: { name: string } };
  templates: { key: string; value: Template };
  sessions: {
    key: string;
    value: Session;
    indexes: { startedAt: string; status: string; templateId: string; exerciseIds: string };
  };
  bodyMetrics: { key: string; value: BodyMetric; indexes: { type_date: [string, string] } };
  settings: { key: string; value: KeyValue };
  meta: { key: string; value: KeyValue };
}

type UpgradeTx = IDBPTransaction<AppDB, StoreNames<AppDB>[], 'versionchange'>;
type Migration = (db: IDBPDatabase<AppDB>, tx: UpgradeTx) => void;

// Append-only. Never edit a migration once released; add a new one and bump DB_VERSION.
export const migrations: Migration[] = [
  // v1
  (db) => {
    db.createObjectStore('exercises', { keyPath: 'id' }).createIndex('name', 'name');
    db.createObjectStore('templates', { keyPath: 'id' });

    const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('startedAt', 'startedAt');
    sessions.createIndex('status', 'status');
    sessions.createIndex('templateId', 'templateId');
    sessions.createIndex('exerciseIds', 'exerciseIds', { multiEntry: true });

    db.createObjectStore('bodyMetrics', { keyPath: 'id' }).createIndex('type_date', ['type', 'date']);
    db.createObjectStore('settings', { keyPath: 'key' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
];

export const DB_VERSION = migrations.length;

export function runMigrations(db: IDBPDatabase<AppDB>, oldVersion: number, newVersion: number, tx: UpgradeTx) {
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    migrations[v - 1](db, tx);
  }
}

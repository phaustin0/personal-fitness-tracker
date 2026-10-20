import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, runMigrations, type AppDB } from './schema';

export type DB = IDBPDatabase<AppDB>;

export function openAppDB(name = DB_NAME, version = DB_VERSION): Promise<DB> {
  return openDB<AppDB>(name, version, {
    upgrade(db, oldVersion, newVersion, tx) {
      runMigrations(db, oldVersion, newVersion ?? version, tx);
    },
    blocking(_current, _blocked, event) {
      // A newer version of the app opened in another tab; release the connection so its upgrade can run.
      (event.target as IDBDatabase).close();
    },
  });
}

let dbPromise: Promise<DB> | null = null;

export function getDB(): Promise<DB> {
  dbPromise ??= openAppDB();
  return dbPromise;
}

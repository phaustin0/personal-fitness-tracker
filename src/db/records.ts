import type { BaseRecord, Timestamp } from './types';

export const now = (): Timestamp => new Date().toISOString();
export const newId = (): string => crypto.randomUUID();

export function newRecord<T extends object>(fields: T, at: Timestamp = now()): T & BaseRecord {
  return { id: newId(), createdAt: at, updatedAt: at, ...fields };
}

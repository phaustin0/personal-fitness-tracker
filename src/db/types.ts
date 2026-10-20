export type ID = string;
/** ISO 8601 timestamp, e.g. 2026-10-20T13:33:01.650Z */
export type Timestamp = string;
/** Calendar date, YYYY-MM-DD */
export type DateString = string;

export interface BaseRecord {
  id: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
}

export type LoadType = 'bodyweight' | 'weighted' | 'assisted' | 'dumbbell';
export type WorkoutMode = 'superset' | 'straight';

export interface Exercise extends BaseRecord {
  name: string;
  loadType: LoadType;
  unilateral: boolean;
  notes?: string;
}

/** Display labels (A, B, C...) are derived from position, so reordering never leaves stale labels. */
export interface SupersetGroup {
  id: ID;
  restSec: number;
  order: number;
}

export interface Slot {
  id: ID;
  exerciseId: ID;
  order: number;
  groupId: ID | null;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
}

export interface Template extends BaseRecord {
  name: string;
  emphasis?: string;
  order: number;
  mode: WorkoutMode;
  groups: SupersetGroup[];
  slots: Slot[];
}

export interface PlanSlot extends Slot {
  exerciseName: string;
  loadType: LoadType;
  unilateral: boolean;
}

export interface SessionPlan {
  templateName: string;
  emphasis?: string;
  groups: SupersetGroup[];
  slots: PlanSlot[];
}

export interface SetLog {
  id: ID;
  slotId: ID;
  exerciseId: ID;
  setIndex: number;
  /** kg: added weight, assistance amount, or per-dumbbell weight depending on loadKind */
  load: number | null;
  loadKind: LoadType;
  reps: number | null;
  repsBySide?: { left: number | null; right: number | null };
  done: boolean;
  completedAt?: Timestamp;
}

export type SessionStatus = 'active' | 'completed' | 'discarded';

export interface Session extends BaseRecord {
  templateId: ID;
  status: SessionStatus;
  startedAt: Timestamp;
  finishedAt?: Timestamp;
  mode: WorkoutMode;
  plan: SessionPlan;
  sets: SetLog[];
  exerciseIds: ID[];
  notes?: string;
}

export interface BodyMetric extends BaseRecord {
  date: DateString;
  /** Open-ended: 'bodyweight' (kg), 'waist' (cm), 'chest', 'arm', ... */
  type: string;
  value: number;
}

export interface Schedule {
  kind: '3x' | '4x';
  /** 0 = Sunday ... 6 = Saturday */
  days: number[];
}

export interface SettingsMap {
  units: 'kg' | 'lb';
  activeSessionId: ID | null;
  schedule: Schedule;
}

export interface MetaMap {
  schemaVersion: number;
  seededAt: Timestamp;
  lastBackupAt: Timestamp;
}

export interface KeyValue<K extends string = string, V = unknown> {
  key: K;
  value: V;
}

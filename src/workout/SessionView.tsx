import { IconCheck } from '@tabler/icons-preact';
import { CellInput, fmt } from './cells';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LoadType, PlanSlot, Session, SetLog, WorkoutMode } from '../db/types';
import { groupLabels } from '../routine/units';
import {
  completionPatch,
  durationSec,
  formatDuration,
  formatSet,
  nextOpenSet,
  planUnits,
  progress,
  setSlotLoadKind,
  setsForSlot,
  suggestionFor,
  updateSet,
  type PreviousSets,
} from './session';

const MODES: { value: WorkoutMode; label: string }[] = [
  { value: 'superset', label: 'Supersets' },
  { value: 'straight', label: 'Straight' },
];

interface Props {
  session: Session;
  previous: PreviousSets;
  onChange: (update: (s: Session) => Session) => Session;
  onFinish: () => void;
  onDiscard: () => void;
  saveError: string | null;
}

export function SessionView({ session, previous, onChange, onFinish, onDiscard, saveError }: Props) {
  const { done, total } = progress(session);
  const units = planUnits(session);
  const labels = groupLabels(units);
  const superset = session.mode === 'superset';

  const focusSet = (setId: string) => {
    const row = document.querySelector<HTMLElement>(`[data-set="${setId}"]`);
    const input = row?.querySelector<HTMLInputElement>('input[data-first]') ?? row?.querySelector('input');
    input?.focus();
    row?.scrollIntoView({ block: 'nearest' });
  };

  useEffect(() => {
    const next = nextOpenSet(session, null);
    if (next) focusSet(next.id);
  }, [session.id]);

  /** Fills from suggestions, ticks the set, and moves to the next open set. Returns false if reps are missing. */
  const complete = (setId: string): boolean => {
    let ok = false;
    const after = onChange((s) => {
      const set = s.sets.find((x) => x.id === setId)!;
      const patch = completionPatch(set, suggestionFor(s, set, previous));
      if (!patch) return s;
      ok = true;
      return updateSet(s, setId, patch);
    });
    if (ok) {
      const next = nextOpenSet(after, setId);
      if (next) focusSet(next.id);
    }
    return ok;
  };

  const blockProps = { session, previous, onChange, complete };

  return (
    <div class="session">
      <header class="session-head">
        <div class="session-title">
          <h1>{session.plan.templateName}</h1>
          <div class="muted">
            {session.plan.emphasis && <>{session.plan.emphasis} · </>}
            <Elapsed session={session} /> · {done} of {total} sets
          </div>
        </div>
        <div class="spacer" />
        <div class="segmented" role="radiogroup" aria-label="Mode for this workout">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={session.mode === m.value}
              class={session.mode === m.value ? 'seg active' : 'seg'}
              onClick={() => onChange((s) => ({ ...s, mode: m.value }))}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" class="text-btn" onClick={onDiscard}>
          Discard
        </button>
        <button type="button" class="btn primary" onClick={onFinish}>
          Finish
        </button>
        <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </header>

      {saveError && <div class="banner-error">{saveError}</div>}

      {superset ? (
        <div class="units">
          {units.map((u) => {
            const label = u.group ? labels.get(u.group.id)! : null;
            return (
              <section key={u.group?.id ?? u.slots[0].id} class={u.group ? 'w-unit group' : 'w-unit'}>
                {u.group && (
                  <div class="w-unit-head">
                    <span class="group-title">Superset {label}</span>
                    <span class="muted small">Rest {u.group.restSec} s after superset</span>
                  </div>
                )}
                <div class="w-unit-body" style={{ gridTemplateColumns: `repeat(${Math.max(2, u.slots.length)}, minmax(0, 1fr))` }}>
                  {u.slots.map((slot, i) => (
                    <ExerciseBlock key={slot.id} slot={slot} tag={label ? `${label}${i + 1}` : ''} showRest={!u.group} {...blockProps} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div class="straight-grid">
          {units.flatMap((u) => u.slots).map((slot) => (
            <section key={slot.id} class="w-unit">
              <div class="w-unit-body single">
                <ExerciseBlock slot={slot} tag="" showRest {...blockProps} />
              </div>
            </section>
          ))}
        </div>
      )}
      <p class="muted small keys-hint">Enter logs the set and jumps to the next one. Empty fields use the grey values.</p>
    </div>
  );
}

function Elapsed({ session }: { session: Session }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span class="elapsed">{formatDuration(durationSec(session))}</span>;
}

const loadHeader: Record<LoadType, string> = { bodyweight: '+kg', assisted: '−kg', weighted: 'kg', dumbbell: 'kg' };

interface BlockProps {
  slot: PlanSlot;
  tag: string;
  showRest: boolean;
  session: Session;
  previous: PreviousSets;
  onChange: Props['onChange'];
  complete: (setId: string) => boolean;
}

function ExerciseBlock({ slot, tag, showRest, session, previous, onChange, complete }: BlockProps) {
  const sets = setsForSlot(session, slot.id);
  const kind = sets[0]?.loadKind ?? slot.loadType;
  const bodyweightish = slot.loadType === 'bodyweight' || slot.loadType === 'assisted';
  const prev = previous.get(slot.exerciseId) ?? [];

  return (
    <div class="ex-block">
      <div class="ex-head">
        <div>
          <div class="ex-name">
            {tag && <span class="slot-tag">{tag}</span>}
            {slot.exerciseName}
          </div>
          <div class="muted small">
            {slot.sets} × {slot.repMin}–{slot.repMax}
            {slot.unilateral ? ' per side' : ''}
            {showRest ? ` · rest ${slot.restSec} s` : ''}
          </div>
        </div>
        {bodyweightish && (
          <select
            class="kind-select"
            aria-label={`Load type for ${slot.exerciseName}`}
            value={kind}
            onChange={(e) => onChange((s) => setSlotLoadKind(s, slot.id, (e.target as HTMLSelectElement).value as LoadType))}
          >
            <option value="bodyweight">Bodyweight / added</option>
            <option value="assisted">Assisted</option>
          </select>
        )}
      </div>
      <div class={slot.unilateral ? 'set-grid sides head' : 'set-grid head'} aria-hidden="true">
        <span>Set</span>
        <span>Last</span>
        <span>{loadHeader[kind]}</span>
        {slot.unilateral ? (
          <>
            <span>Left</span>
            <span>Right</span>
          </>
        ) : (
          <span>Reps</span>
        )}
        <span />
      </div>
      {sets.map((set) => (
        <SetRow
          key={set.id}
          set={set}
          slot={slot}
          last={prev.find((p) => p.setIndex === set.setIndex) ?? null}
          suggestion={suggestionFor(session, set, previous)}
          onChange={onChange}
          complete={complete}
        />
      ))}
    </div>
  );
}

interface RowProps {
  set: SetLog;
  slot: PlanSlot;
  last: SetLog | null;
  suggestion: SetLog | null;
  onChange: Props['onChange'];
  complete: (setId: string) => boolean;
}

function SetRow({ set, slot, last, suggestion, onChange, complete }: RowProps) {
  const repsRef = useRef<HTMLInputElement>(null);
  const [nudge, setNudge] = useState(false);
  const loadFirst = slot.loadType === 'dumbbell' || slot.loadType === 'weighted';
  const sameKind = suggestion && suggestion.loadKind === set.loadKind;
  const edit = (patch: Parameters<typeof updateSet>[2]) => onChange((s) => updateSet(s, set.id, patch));

  const tryComplete = () => {
    if (complete(set.id)) return;
    setNudge(true);
    repsRef.current?.focus();
    setTimeout(() => setNudge(false), 900);
  };

  const onEnter = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (set.done) {
      (e.target as HTMLInputElement).blur();
      return;
    }
    tryComplete();
  };

  const sides = set.repsBySide;
  const sugSides = suggestion?.repsBySide;

  return (
    <div class={`set-grid set-row ${slot.unilateral ? 'sides' : ''} ${set.done ? 'done' : ''}`} data-set={set.id}>
      <span class="set-no">{set.setIndex + 1}</span>
      <span class="last" title={last ? `Last time: ${formatSet(last)}` : 'No previous record'}>
        {last ? formatSet(last) : '–'}
      </span>
      <CellInput
        kind="load"
        label={`${slot.exerciseName} set ${set.setIndex + 1} load`}
        value={set.load}
        placeholder={sameKind && suggestion!.load !== null ? fmt(suggestion!.load) : loadFirst ? '' : '0'}
        first={loadFirst}
        onCommit={(load) => edit({ load })}
        onKeyDown={onEnter}
      />
      {sides ? (
        <>
          <CellInput
            kind="reps"
            inputRef={repsRef}
            nudge={nudge}
            label={`${slot.exerciseName} set ${set.setIndex + 1} left reps`}
            value={sides.left}
            placeholder={fmt(sugSides?.left ?? suggestion?.reps ?? null)}
            first={!loadFirst}
            onCommit={(left) => edit({ repsBySide: { ...sides, left } })}
            onKeyDown={onEnter}
          />
          <CellInput
            kind="reps"
            nudge={nudge}
            label={`${slot.exerciseName} set ${set.setIndex + 1} right reps`}
            value={sides.right}
            placeholder={fmt(sugSides?.right ?? suggestion?.reps ?? null)}
            onCommit={(right) => edit({ repsBySide: { ...sides, right } })}
            onKeyDown={onEnter}
          />
        </>
      ) : (
        <CellInput
          kind="reps"
          inputRef={repsRef}
          nudge={nudge}
          label={`${slot.exerciseName} set ${set.setIndex + 1} reps`}
          value={set.reps}
          placeholder={fmt(suggestion?.reps ?? null)}
          first={!loadFirst}
          onCommit={(reps) => edit({ reps })}
          onKeyDown={onEnter}
        />
      )}
      <button
        type="button"
        class={set.done ? 'tick on' : 'tick'}
        role="checkbox"
        aria-checked={set.done}
        aria-label={`${slot.exerciseName} set ${set.setIndex + 1} done`}
        onClick={() => (set.done ? edit({ done: false }) : tryComplete())}
      >
        {set.done && <IconCheck size={14} stroke={2.5} />}
      </button>
    </div>
  );
}

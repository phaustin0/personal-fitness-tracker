import { IconCheck } from '@tabler/icons-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { EmptyState } from '../components/EmptyState';
import { NumberField } from '../components/fields';
import { getDB } from '../db/db';
import { sessions as sessionRepo } from '../db/repos';
import type { LoadType, PlanSlot, Session, SetLog } from '../db/types';
import {
  MAX_DURATION_MIN,
  durationMinutes,
  fromLocalInput,
  groupByMonth,
  toLocalInput,
  validateSession,
  withTiming,
} from '../history/history';
import { groupLabels } from '../routine/units';
import { href, useRouteParam } from '../router';
import { CellInput } from '../workout/cells';
import { durationSec, formatDuration, formatLoad, isSetComplete, planUnits, progress, setSlotLoadKind, setsForSlot, updateSet } from '../workout/session';

export function HistoryPage() {
  const param = useRouteParam();
  const [list, setList] = useState<Session[] | null>(null);
  const [editing, setEditing] = useState(false);

  const load = async () => setList(await sessionRepo.byStatus(await getDB(), 'completed'));

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => setEditing(false), [param]);

  if (!list) return <div class="muted">Loading…</div>;

  if (list.length === 0) {
    return (
      <>
        <header class="page-header">
          <h1>History</h1>
        </header>
        <EmptyState title="No workouts yet">
          Finished workouts appear here. <a href={href('workout')}>Start one</a>.
        </EmptyState>
      </>
    );
  }

  const groups = groupByMonth(list);
  const selected = list.find((s) => s.id === param) ?? groups[0].sessions[0];

  return (
    <div class="history">
      <aside class="history-list" aria-label="Workouts">
        <h1>History</h1>
        {groups.map((g) => (
          <div key={g.key}>
            <div class="month">{g.label}</div>
            {g.sessions.map((s) => {
              const { done, total } = progress(s);
              return (
                <a
                  key={s.id}
                  href={href('history', s.id)}
                  class={s.id === selected.id ? 'h-item active' : 'h-item'}
                  aria-current={s.id === selected.id ? 'true' : undefined}
                  onClick={(e) => {
                    if (editing && s.id !== selected.id && !confirm('Discard your unsaved changes?')) e.preventDefault();
                  }}
                >
                  <span class="h-date">{dayLabel(s.startedAt)}</span>
                  <span class="h-name">{s.plan.templateName}</span>
                  <span class="h-meta">
                    {durationMinutes(s)} min · {done}/{total} sets
                  </span>
                </a>
              );
            })}
          </div>
        ))}
      </aside>
      <section class="history-detail">
        {editing ? (
          <EditSession
            key={selected.id}
            session={selected}
            onCancel={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false);
              await load();
            }}
          />
        ) : (
          <ViewSession
            key={selected.id}
            session={selected}
            onEdit={() => setEditing(true)}
            onDelete={async () => {
              if (!confirm(`Delete ${selected.plan.templateName} from ${dayLabel(selected.startedAt)}? It will no longer count in your history or progress.`)) return;
              await sessionRepo.softDelete(await getDB(), selected.id);
              location.hash = href('history');
              await load();
            }}
          />
        )}
      </section>
    </div>
  );
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function repsText(s: SetLog) {
  if (s.repsBySide) return `${s.repsBySide.left ?? '–'} / ${s.repsBySide.right ?? '–'}`;
  return s.reps === null ? '–' : String(s.reps);
}

function ViewSession({ session, onEdit, onDelete }: { session: Session; onEdit: () => void; onDelete: () => void }) {
  const { done, total } = progress(session);
  return (
    <>
      <header class="detail-head">
        <div>
          <h2 class="detail-title">{session.plan.templateName}</h2>
          <div class="muted">
            {fullDate(session.startedAt)} · {formatDuration(durationSec(session))} · {done}/{total} sets ·{' '}
            {session.mode === 'superset' ? 'Supersets' : 'Straight sets'}
          </div>
        </div>
        <div class="spacer" />
        <button type="button" class="text-btn danger-text" onClick={onDelete}>
          Delete
        </button>
        <button type="button" class="btn" onClick={onEdit}>
          Edit
        </button>
      </header>
      <SessionLayout session={session} render={(slot, tag, showRest) => <ReadBlock key={slot.id} session={session} slot={slot} tag={tag} showRest={showRest} />} />
    </>
  );
}

function SessionLayout({ session, render }: { session: Session; render: (slot: PlanSlot, tag: string, showRest: boolean) => ComponentChildren }) {
  const units = planUnits(session);
  const labels = groupLabels(units);
  if (session.mode === 'straight') {
    return (
      <div class="h-units">
        {units.flatMap((u) => u.slots).map((slot) => (
          <div key={slot.id} class="w-unit">
            <div class="w-unit-body single">{render(slot, '', true)}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div class="h-units">
      {units.map((u) => {
        const label = u.group ? labels.get(u.group.id)! : null;
        return (
          <div key={u.group?.id ?? u.slots[0].id} class={u.group ? 'w-unit group' : 'w-unit'}>
            {u.group && (
              <div class="w-unit-head">
                <span class="group-title">Superset {label}</span>
                <span class="muted small">Rest {u.group.restSec} s after superset</span>
              </div>
            )}
            <div class="w-unit-body" style={{ gridTemplateColumns: `repeat(${Math.max(2, u.slots.length)}, minmax(0, 1fr))` }}>
              {u.slots.map((slot, i) => render(slot, label ? `${label}${i + 1}` : '', !u.group))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BlockHead({ slot, tag, showRest }: { slot: PlanSlot; tag: string; showRest: boolean }) {
  return (
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
  );
}

function ReadBlock({ session, slot, tag, showRest }: { session: Session; slot: PlanSlot; tag: string; showRest: boolean }) {
  const sets = setsForSlot(session, slot.id);
  return (
    <div class="ex-block">
      <div class="ex-head">
        <BlockHead slot={slot} tag={tag} showRest={showRest} />
      </div>
      <div class="read-grid head" aria-hidden="true">
        <span>Set</span>
        <span>Load</span>
        <span>{slot.unilateral ? 'Left / right' : 'Reps'}</span>
        <span />
      </div>
      {sets.map((s) => (
        <div key={s.id} class={s.done ? 'read-grid read-row' : 'read-grid read-row skipped'}>
          <span class="set-no">{s.setIndex + 1}</span>
          <span>{s.done || s.load !== null ? formatLoad(s.load, s.loadKind) : '–'}</span>
          <span>{repsText(s)}</span>
          <span class="read-tick">{s.done ? <IconCheck size={14} stroke={2.5} /> : <span class="muted small">not done</span>}</span>
        </div>
      ))}
    </div>
  );
}

const loadHeader: Record<LoadType, string> = { bodyweight: '+kg', assisted: '−kg', weighted: 'kg', dumbbell: 'kg' };

function EditSession({ session, onCancel, onSaved }: { session: Session; onCancel: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(session);
  const [startText, setStartText] = useState(toLocalInput(session.startedAt));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const minutes = durationMinutes(draft);

  const save = async () => {
    const startedAt = fromLocalInput(startText);
    const next = startedAt ? withTiming(draft, startedAt, minutes) : { ...draft, startedAt: 'invalid' };
    const problems = validateSession(next);
    setErrors(problems);
    if (problems.length) return;
    setSaving(true);
    try {
      await sessionRepo.put(await getDB(), next);
      onSaved();
    } catch (err) {
      console.error(err);
      setErrors(['Couldn’t save. Try again.']);
      setSaving(false);
    }
  };

  return (
    <>
      <header class="detail-head">
        <div>
          <h2 class="detail-title">Edit {session.plan.templateName}</h2>
          <div class="edit-timing">
            <label>
              <span class="muted small">Started</span>
              <input
                type="datetime-local"
                class="text"
                value={startText}
                onInput={(e) => setStartText((e.target as HTMLInputElement).value)}
              />
            </label>
            <label>
              <span class="muted small">Duration (min)</span>
              <NumberField
                label="Duration in minutes"
                class="w-dur"
                value={minutes}
                min={1}
                max={MAX_DURATION_MIN}
                onCommit={(m) => setDraft((d) => withTiming(d, d.startedAt, m))}
              />
            </label>
          </div>
        </div>
        <div class="spacer" />
        <button type="button" class="text-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" class="btn primary" disabled={saving} onClick={() => void save()}>
          Save changes
        </button>
      </header>
      {errors.length > 0 && (
        <div class="banner-error">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      <SessionLayout
        session={draft}
        render={(slot, tag, showRest) => <EditBlock key={slot.id} draft={draft} slot={slot} tag={tag} showRest={showRest} onChange={setDraft} />}
      />
    </>
  );
}

function EditBlock({
  draft,
  slot,
  tag,
  showRest,
  onChange,
}: {
  draft: Session;
  slot: PlanSlot;
  tag: string;
  showRest: boolean;
  onChange: (update: (s: Session) => Session) => void;
}) {
  const sets = setsForSlot(draft, slot.id);
  const kind = sets[0]?.loadKind ?? slot.loadType;
  const bodyweightish = slot.loadType === 'bodyweight' || slot.loadType === 'assisted';
  const edit = (id: string, patch: Parameters<typeof updateSet>[2]) => onChange((s) => updateSet(s, id, patch));
  const noop = () => {};

  return (
    <div class="ex-block">
      <div class="ex-head">
        <BlockHead slot={slot} tag={tag} showRest={showRest} />
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
      <div class={slot.unilateral ? 'set-grid edit sides head' : 'set-grid edit head'} aria-hidden="true">
        <span>Set</span>
        <span>{loadHeader[kind]}</span>
        {slot.unilateral ? (
          <>
            <span>Left</span>
            <span>Right</span>
          </>
        ) : (
          <span>Reps</span>
        )}
        <span>Done</span>
      </div>
      {sets.map((s) => {
        const label = `${slot.exerciseName} set ${s.setIndex + 1}`;
        const sides = s.repsBySide;
        return (
          <div key={s.id} class={`set-grid edit set-row ${slot.unilateral ? 'sides' : ''}`}>
            <span class="set-no">{s.setIndex + 1}</span>
            <CellInput kind="load" label={`${label} load`} value={s.load} placeholder="" onCommit={(load) => edit(s.id, { load })} onKeyDown={noop} />
            {sides ? (
              <>
                <CellInput kind="reps" label={`${label} left reps`} value={sides.left} placeholder="" onCommit={(left) => edit(s.id, { repsBySide: { ...sides, left } })} onKeyDown={noop} />
                <CellInput kind="reps" label={`${label} right reps`} value={sides.right} placeholder="" onCommit={(right) => edit(s.id, { repsBySide: { ...sides, right } })} onKeyDown={noop} />
              </>
            ) : (
              <CellInput kind="reps" label={`${label} reps`} value={s.reps} placeholder="" onCommit={(reps) => edit(s.id, { reps })} onKeyDown={noop} />
            )}
            <button
              type="button"
              class={s.done ? 'tick on' : 'tick'}
              role="checkbox"
              aria-checked={s.done}
              aria-label={`${label} done`}
              title={!s.done && !isSetComplete(s) ? 'Enter reps first' : undefined}
              onClick={() => {
                if (s.done || isSetComplete(s)) edit(s.id, { done: !s.done });
              }}
            >
              {s.done && <IconCheck size={14} stroke={2.5} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

import { IconChevronDown, IconChevronUp, IconLink, IconPlus, IconX } from '@tabler/icons-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getDB } from '../db/db';
import { newRecord } from '../db/records';
import { exercises as exerciseRepo, templates as templateRepo } from '../db/repos';
import type { Exercise, LoadType, Slot, Template, WorkoutMode } from '../db/types';
import {
  LIMITS,
  addSlot,
  dissolveGroup,
  moveUnit,
  moveWithinGroup,
  removeSlot,
  setMode,
  setSlotGroup,
  updateGroupRest,
  updateSlot,
} from '../routine/ops';
import { buildUnits, groupLabels, unitKey, type Unit } from '../routine/units';
import { NumberField, TextField } from './fields';

const LOAD_TYPES: { value: LoadType; label: string }[] = [
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'weighted', label: 'Weighted' },
  { value: 'assisted', label: 'Assisted' },
];

const MODES: { value: WorkoutMode; label: string }[] = [
  { value: 'superset', label: 'Supersets' },
  { value: 'straight', label: 'Straight sets' },
];

export function RoutineEditor() {
  const [routines, setRoutines] = useState<Template[] | null>(null);
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDB();
      const [ts, es] = await Promise.all([templateRepo.list(db), exerciseRepo.list(db)]);
      setRoutines(ts);
      setLibrary(es);
      setActiveId((id) => id ?? ts[0]?.id ?? null);
    })();
  }, []);

  const guard = async (work: () => Promise<unknown>) => {
    try {
      await work();
      setSaveError(null);
    } catch (err) {
      console.error(err);
      setSaveError('Couldn’t save that change. Reload the page and try again.');
    }
  };

  const saveTemplate = (next: Template) => {
    setRoutines((rs) => rs!.map((t) => (t.id === next.id ? next : t)));
    void guard(async () => templateRepo.put(await getDB(), next));
  };

  const saveExercise = (next: Exercise) => {
    setLibrary((ls) => (ls.some((e) => e.id === next.id) ? ls.map((e) => (e.id === next.id ? next : e)) : [...ls, next]));
    void guard(async () => exerciseRepo.put(await getDB(), next));
  };

  if (!routines) return <div class="muted">Loading routines…</div>;
  if (routines.length === 0) return <div class="muted">No routines found.</div>;

  const active = routines.find((t) => t.id === activeId) ?? routines[0];

  return (
    <div class="routine-editor">
      <div class="tabs" role="tablist" aria-label="Routines">
        {routines.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active.id}
            class={t.id === active.id ? 'tab active' : 'tab'}
            onClick={() => setActiveId(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
      {saveError && <div class="banner-error">{saveError}</div>}
      <TemplateEditor
        key={active.id}
        template={active}
        routines={routines}
        library={library}
        onChange={saveTemplate}
        onExerciseChange={saveExercise}
      />
    </div>
  );
}

interface EditorProps {
  template: Template;
  routines: Template[];
  library: Exercise[];
  onChange: (t: Template) => void;
  onExerciseChange: (e: Exercise) => void;
}

function TemplateEditor({ template: t, routines, library, onChange, onExerciseChange }: EditorProps) {
  const units = useMemo(() => buildUnits(t), [t]);
  const labels = useMemo(() => groupLabels(units), [units]);
  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);

  const sharedWith = (exerciseId: string) =>
    routines.filter((r) => r.id !== t.id && r.slots.some((s) => s.exerciseId === exerciseId)).map((r) => r.name);

  const nameTaken = (name: string, exceptId?: string) =>
    library.some((e) => e.id !== exceptId && e.name.toLowerCase() === name.toLowerCase());

  return (
    <div>
      <div class="routine-head">
        <TextField
          label="Routine name"
          class="routine-name"
          value={t.name}
          validate={(n) => (routines.some((r) => r.id !== t.id && r.name.toLowerCase() === n.toLowerCase()) ? 'Name already used' : null)}
          onCommit={(name) => onChange({ ...t, name })}
        />
        <TextField
          label="Emphasis"
          class="routine-emphasis"
          value={t.emphasis ?? ''}
          placeholder="Emphasis"
          validate={() => null}
          onCommit={(emphasis) => onChange({ ...t, emphasis })}
        />
        <div class="spacer" />
        <span class="muted small">Default mode</span>
        <div class="segmented" role="radiogroup" aria-label="Default workout mode">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={t.mode === m.value}
              class={t.mode === m.value ? 'seg active' : 'seg'}
              onClick={() => onChange(setMode(t, m.value))}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div class="slot-grid slot-header" aria-hidden="true">
        <span />
        <span>Exercise</span>
        <span>Load</span>
        <span>Per side</span>
        <span>Sets</span>
        <span>Reps</span>
        <span>Rest</span>
        <span>Superset</span>
        <span />
      </div>

      {units.map((u, ui) => (
        <UnitCard
          key={unitKey(u)}
          unit={u}
          index={ui}
          count={units.length}
          label={u.group ? labels.get(u.group.id)! : null}
          template={t}
          labels={labels}
          byId={byId}
          sharedWith={sharedWith}
          nameTaken={nameTaken}
          onChange={onChange}
          onExerciseChange={onExerciseChange}
        />
      ))}

      {units.length === 0 && <div class="muted empty-inline">This routine has no exercises. Add one below.</div>}

      <AddExercise
        template={t}
        library={library}
        onAdd={(exercise, isNew) => {
          if (isNew) onExerciseChange(exercise);
          onChange(addSlot(t, exercise.id));
        }}
      />
    </div>
  );
}

interface UnitCardProps {
  unit: Unit;
  index: number;
  count: number;
  label: string | null;
  template: Template;
  labels: Map<string, string>;
  byId: Map<string, Exercise>;
  sharedWith: (exerciseId: string) => string[];
  nameTaken: (name: string, exceptId?: string) => boolean;
  onChange: (t: Template) => void;
  onExerciseChange: (e: Exercise) => void;
}

function UnitCard({ unit, index, count, label, template: t, onChange, ...rest }: UnitCardProps) {
  const key = unitKey(unit);
  const what = unit.group ? `superset ${label}` : rest.byId.get(unit.slots[0].exerciseId)?.name;
  return (
    <div class={unit.group ? 'unit-card group' : 'unit-card'}>
      <div class="unit-move">
        <button type="button" class="icon-btn" aria-label={`Move ${what} up`} disabled={index === 0} onClick={() => onChange(moveUnit(t, key, -1))}>
          <IconChevronUp size={15} />
        </button>
        <button type="button" class="icon-btn" aria-label={`Move ${what} down`} disabled={index === count - 1} onClick={() => onChange(moveUnit(t, key, 1))}>
          <IconChevronDown size={15} />
        </button>
      </div>
      <div class="unit-body">
        {unit.group && (
          <div class="group-head">
            <span class="group-title">Superset {label}</span>
            <span class="muted small">Rest after superset</span>
            <NumberField
              label={`Rest after superset ${label}, seconds`}
              class="w-rest"
              value={unit.group.restSec}
              min={LIMITS.restSec.min}
              max={LIMITS.restSec.max}
              onCommit={(n) => onChange(updateGroupRest(t, unit.group!.id, n))}
            />
            <span class="muted small">s</span>
            {unit.slots.length < 2 && <span class="hint">Pick this superset on another exercise to pair it</span>}
            <div class="spacer" />
            <button type="button" class="text-btn" onClick={() => onChange(dissolveGroup(t, unit.group!.id))}>
              Ungroup
            </button>
          </div>
        )}
        {unit.slots.map((slot, si) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            tag={label ? `${label}${si + 1}` : ''}
            inGroup={!!unit.group}
            first={si === 0}
            last={si === unit.slots.length - 1}
            template={t}
            onChange={onChange}
            {...rest}
          />
        ))}
      </div>
    </div>
  );
}

interface SlotRowProps {
  slot: Slot;
  tag: string;
  inGroup: boolean;
  first: boolean;
  last: boolean;
  template: Template;
  labels: Map<string, string>;
  byId: Map<string, Exercise>;
  sharedWith: (exerciseId: string) => string[];
  nameTaken: (name: string, exceptId?: string) => boolean;
  onChange: (t: Template) => void;
  onExerciseChange: (e: Exercise) => void;
}

function SlotRow({ slot, tag, inGroup, first, last, template: t, labels, byId, sharedWith, nameTaken, onChange, onExerciseChange }: SlotRowProps) {
  const exercise = byId.get(slot.exerciseId);
  if (!exercise) return null;
  const shared = sharedWith(exercise.id);
  const patch = (p: Parameters<typeof updateSlot>[2]) => onChange(updateSlot(t, slot.id, p));

  return (
    <div class="slot-grid slot-row" data-exercise={exercise.name}>
      <span class="slot-tag">{tag}</span>
      <span class="name-cell">
        <TextField
          label="Exercise name"
          value={exercise.name}
          validate={(n) => (nameTaken(n, exercise.id) ? 'Another exercise has this name' : null)}
          onCommit={(name) => onExerciseChange({ ...exercise, name })}
        />
        <span class="shared" title={shared.length ? `Also in ${shared.join(', ')}. Name, load and per-side changes apply there too; history is shared.` : undefined}>
          {shared.length > 0 && <IconLink size={14} aria-label={`Also in ${shared.join(', ')}`} />}
        </span>
      </span>
      <select
        aria-label="Load type"
        value={exercise.loadType}
        onChange={(e) => onExerciseChange({ ...exercise, loadType: (e.target as HTMLSelectElement).value as LoadType })}
      >
        {LOAD_TYPES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <label class="check">
        <input
          type="checkbox"
          checked={exercise.unilateral}
          aria-label="Logged per side"
          onChange={(e) => onExerciseChange({ ...exercise, unilateral: (e.target as HTMLInputElement).checked })}
        />
      </label>
      <NumberField label="Sets" class="w-sets" value={slot.sets} min={LIMITS.sets.min} max={LIMITS.sets.max} onCommit={(sets) => patch({ sets })} />
      <span class="reps">
        <NumberField
          label="Minimum reps"
          class="w-reps"
          value={slot.repMin}
          min={LIMITS.reps.min}
          max={LIMITS.reps.max}
          validate={(n) => (n > slot.repMax ? 'Must not exceed max reps' : null)}
          onCommit={(repMin) => patch({ repMin })}
        />
        <span class="muted">–</span>
        <NumberField
          label="Maximum reps"
          class="w-reps"
          value={slot.repMax}
          min={LIMITS.reps.min}
          max={LIMITS.reps.max}
          validate={(n) => (n < slot.repMin ? 'Must be at least min reps' : null)}
          onCommit={(repMax) => patch({ repMax })}
        />
      </span>
      <span class="rest">
        <NumberField label="Rest, seconds" class="w-rest" value={slot.restSec} min={LIMITS.restSec.min} max={LIMITS.restSec.max} onCommit={(restSec) => patch({ restSec })} />
        <span class="muted small">s</span>
      </span>
      <select
        aria-label="Superset"
        value={slot.groupId ?? ''}
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          onChange(setSlotGroup(t, slot.id, v === '' ? null : v));
        }}
      >
        <option value="">None</option>
        {[...labels].map(([id, l]) => (
          <option key={id} value={id}>
            Superset {l}
          </option>
        ))}
        <option value="new">New superset</option>
      </select>
      <span class="row-actions">
        {inGroup && (
          <>
            <button type="button" class="icon-btn" aria-label={`Move ${exercise.name} up within superset`} disabled={first} onClick={() => onChange(moveWithinGroup(t, slot.id, -1))}>
              <IconChevronUp size={14} />
            </button>
            <button type="button" class="icon-btn" aria-label={`Move ${exercise.name} down within superset`} disabled={last} onClick={() => onChange(moveWithinGroup(t, slot.id, 1))}>
              <IconChevronDown size={14} />
            </button>
          </>
        )}
        <button
          type="button"
          class="icon-btn danger"
          aria-label={`Remove ${exercise.name} from ${t.name}`}
          onClick={() => {
            if (confirm(`Remove ${exercise.name} from ${t.name}? Its logged history is kept.`)) onChange(removeSlot(t, slot.id));
          }}
        >
          <IconX size={14} />
        </button>
      </span>
    </div>
  );
}

interface AddExerciseProps {
  template: Template;
  library: Exercise[];
  onAdd: (exercise: Exercise, isNew: boolean) => void;
}

function AddExercise({ template: t, library, onAdd }: AddExerciseProps) {
  const [name, setName] = useState('');
  const [loadType, setLoadType] = useState<LoadType>('dumbbell');
  const [unilateral, setUnilateral] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = library.find((e) => e.name.toLowerCase() === name.trim().toLowerCase());
  const available = library.filter((e) => !t.slots.some((s) => s.exerciseId === e.id));

  const submit = (ev: Event) => {
    ev.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter an exercise name');
    if (existing && t.slots.some((s) => s.exerciseId === existing.id)) return setError(`${existing.name} is already in ${t.name}`);
    if (existing) onAdd(existing, false);
    else onAdd(newRecord({ name: trimmed, loadType, unilateral }), true);
    setName('');
    setError(null);
  };

  return (
    <form class="add-row" onSubmit={submit}>
      <input
        type="text"
        class="text"
        list="exercise-library"
        placeholder="Add exercise: pick from your library or type a new name"
        aria-label="Exercise to add"
        value={name}
        onInput={(e) => {
          setName((e.target as HTMLInputElement).value);
          setError(null);
        }}
      />
      <datalist id="exercise-library">
        {available.map((e) => (
          <option key={e.id} value={e.name} />
        ))}
      </datalist>
      {!existing && (
        <>
          <select aria-label="Load type for new exercise" value={loadType} onChange={(e) => setLoadType((e.target as HTMLSelectElement).value as LoadType)}>
            {LOAD_TYPES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <label class="check-label">
            <input type="checkbox" checked={unilateral} onChange={(e) => setUnilateral((e.target as HTMLInputElement).checked)} />
            Per side
          </label>
        </>
      )}
      <button type="submit" class="btn">
        <IconPlus size={15} />
        {existing ? 'Add' : 'Add new'}
      </button>
      {error && <span class="field-error static">{error}</span>}
    </form>
  );
}

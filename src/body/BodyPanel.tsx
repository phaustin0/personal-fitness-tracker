import { IconPencil, IconTrash } from '@tabler/icons-preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getDB } from '../db/db';
import { now } from '../db/records';
import { bodyMetrics } from '../db/repos';
import type { BodyMetric } from '../db/types';
import { METRICS, latestAndChange, parseMeasurement, planSave, rowsByDate, todayKey } from './metrics';

const fmtNum = (n: number) => String(Number(n.toFixed(2)));

function dateLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function BodyPanel() {
  const [entries, setEntries] = useState<BodyMetric[] | null>(null);
  const [date, setDate] = useState(todayKey());
  const [text, setText] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const firstInput = useRef<HTMLInputElement>(null);

  const load = async () => setEntries(await bodyMetrics.list(await getDB()));
  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => (entries ? rowsByDate(entries) : []), [entries]);
  const existing = rows.find((r) => r.date === date)?.values ?? new Map<string, BodyMetric>();

  // Prefill the form with whatever is already logged for the chosen date.
  useEffect(() => {
    if (!entries) return;
    const values: Record<string, string> = {};
    for (const [type, e] of existing) values[type] = fmtNum(e.value);
    setText(values);
    setErrors([]);
    if ([...existing.keys()].some((t) => !METRICS.find((m) => m.type === t)?.primary)) setShowMore(true);
  }, [date, entries]);

  if (!entries) return <div class="muted">Loading…</div>;

  const usedTypes = METRICS.filter((m) => rows.some((r) => r.values.has(m.type)));
  const visible = METRICS.filter((m) => m.primary || showMore);

  const save = async (e: Event) => {
    e.preventDefault();
    const problems: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push('Pick a date.');
    else if (date > todayKey()) problems.push('The date can’t be in the future.');
    const values: Record<string, number | null> = {};
    for (const m of METRICS) {
      const r = parseMeasurement(text[m.type] ?? '', m);
      if (!r.ok) problems.push(r.error);
      else values[m.type] = r.value;
    }
    if (!problems.length && Object.values(values).every((v) => v === null) && existing.size === 0) {
      problems.push('Enter at least one measurement.');
    }
    setErrors(problems);
    if (problems.length) return;

    const { puts, deletes } = planSave(date, values, existing, now());
    try {
      const db = await getDB();
      for (const p of [...puts, ...deletes]) await bodyMetrics.put(db, p);
      setMessage(puts.length + deletes.length === 0 ? 'No changes.' : `Saved for ${dateLabel(date)}.`);
      await load();
    } catch (err) {
      console.error(err);
      setErrors(['Couldn’t save. Try again.']);
    }
  };

  const removeDate = async (key: string) => {
    const row = rows.find((r) => r.date === key);
    if (!row || !confirm(`Delete all measurements from ${dateLabel(key)}?`)) return;
    const at = now();
    const db = await getDB();
    for (const e of row.values.values()) await bodyMetrics.put(db, { ...e, deletedAt: at });
    setMessage(`Deleted ${dateLabel(key)}.`);
    await load();
  };

  const weight = latestAndChange(entries, 'bodyweight');
  const waist = latestAndChange(entries, 'waist');

  return (
    <div class="body-panel">
      <div class="stat-row">
        {[
          { label: 'Body weight', s: weight, unit: 'kg' },
          { label: 'Waist', s: waist, unit: 'cm' },
        ].map(({ label, s, unit }) => (
          <div class="stat" key={label}>
            <div class="stat-label">{label}</div>
            <div class="stat-value">{s ? `${fmtNum(s.latest.value)} ${unit}` : '–'}</div>
            <div class="muted small">
              {!s
                ? 'No entries yet'
                : s.count === 1
                  ? `Logged ${dateLabel(s.latest.date)}`
                  : `${s.change > 0 ? '+' : ''}${fmtNum(s.change)} ${unit} since ${dateLabel(s.first.date)}`}
            </div>
          </div>
        ))}
      </div>

      <form class="panel body-form" onSubmit={save}>
        <h2>{existing.size ? `Edit ${dateLabel(date)}` : 'Log measurements'}</h2>
        <div class="body-fields">
          <label>
            <span class="muted small">Date</span>
            <input type="date" class="text" value={date} max={todayKey()} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          </label>
          {visible.map((m, i) => (
            <label key={m.type}>
              <span class="muted small">
                {m.label} ({m.unit})
              </span>
              <input
                ref={i === 0 ? firstInput : undefined}
                type="text"
                inputMode="decimal"
                class="text num-wide"
                value={text[m.type] ?? ''}
                placeholder={existing.get(m.type) ? '' : '–'}
                onInput={(e) => {
                  setText({ ...text, [m.type]: (e.target as HTMLInputElement).value });
                  setMessage(null);
                }}
              />
            </label>
          ))}
        </div>
        <div class="body-actions">
          <button type="submit" class="btn primary">
            Save
          </button>
          <button type="button" class="text-btn" onClick={() => setShowMore(!showMore)}>
            {showMore ? 'Fewer measurements' : 'More measurements'}
          </button>
          {existing.size > 0 && <span class="muted small">Clear a field and save to remove that value.</span>}
          {message && <span class="muted small">{message}</span>}
        </div>
        {errors.length > 0 && (
          <div class="banner-error">
            {errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        )}
      </form>

      {rows.length === 0 ? (
        <p class="muted">Your measurements will be listed here.</p>
      ) : (
        <table class="summary-table body-table">
          <thead>
            <tr>
              <th>Date</th>
              {usedTypes.map((m) => (
                <th key={m.type}>
                  {m.label} ({m.unit})
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} class={r.date === date ? 'current' : ''}>
                <td>{dateLabel(r.date)}</td>
                {usedTypes.map((m) => (
                  <td key={m.type}>{r.values.has(m.type) ? fmtNum(r.values.get(m.type)!.value) : <span class="muted">–</span>}</td>
                ))}
                <td class="row-actions">
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={`Edit ${dateLabel(r.date)}`}
                    onClick={() => {
                      setDate(r.date);
                      setMessage(null);
                      firstInput.current?.focus();
                    }}
                  >
                    <IconPencil size={15} />
                  </button>
                  <button type="button" class="icon-btn danger" aria-label={`Delete ${dateLabel(r.date)}`} onClick={() => void removeDate(r.date)}>
                    <IconTrash size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

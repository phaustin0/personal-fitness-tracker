import { useEffect, useMemo, useState } from 'preact/hooks';
import { BarChart, LineChart } from '../charts/charts';
import { EmptyState } from '../components/EmptyState';
import { getDB } from '../db/db';
import { exercises as exerciseRepo, meta, sessions as sessionRepo, settings } from '../db/repos';
import type { Exercise, Schedule, Session } from '../db/types';
import { needsBackupReminder } from '../backup/backup';
import { href } from '../router';
import { formatSet, progress } from '../workout/session';
import { consistency, exerciseHistory, personalRecords, weeklyCounts, type ExercisePoint, type PrEvent } from './stats';

type Metric = 'e1rm' | 'topLoad' | 'bestReps' | 'totalReps';

const METRIC_LABEL: Record<Metric, string> = {
  e1rm: 'Estimated 1RM',
  topLoad: 'Top weight',
  bestReps: 'Best set reps',
  totalReps: 'Total reps',
};

const METRIC_UNIT: Record<Metric, string> = { e1rm: 'kg', topLoad: 'kg', bestReps: 'reps', totalReps: 'reps' };

const PR_LABEL: Record<PrEvent['kind'], string> = { reps: 'Most reps', load: 'Heaviest', e1rm: 'Best est. 1RM' };

const fmt = (n: number) => String(Number(n.toFixed(1)));
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function metricValue(p: ExercisePoint, m: Metric): number | null {
  if (m === 'e1rm') return p.bestE1rm;
  if (m === 'topLoad') return p.topLoad;
  return m === 'bestReps' ? p.bestReps : p.totalReps;
}

export function Overview() {
  const [data, setData] = useState<{ sessions: Session[]; library: Exercise[]; schedule: Schedule; lastBackup: string | null } | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDB();
      const [sessions, library, schedule, lastBackup] = await Promise.all([
        sessionRepo.byStatus(db, 'completed'),
        exerciseRepo.list(db, { includeDeleted: true }),
        settings.get(db, 'schedule'),
        meta.get(db, 'lastBackupAt'),
      ]);
      setData({ sessions, library, schedule, lastBackup: lastBackup ?? null });
    })();
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    const names = new Map<string, string>();
    for (const s of data.sessions) for (const p of s.plan.slots) names.set(p.exerciseId, p.exerciseName);
    for (const e of data.library) if (!e.deletedAt) names.set(e.id, e.name);
    const { records, events } = personalRecords(data.sessions);
    const logged = [...records.keys()].sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? ''));
    return { names, records, events, logged };
  }, [data]);

  if (!data || !derived) return <div class="muted">Loading…</div>;

  const { sessions, schedule } = data;
  if (sessions.length === 0) {
    return (
      <EmptyState title="No workouts logged yet">
        Training frequency, personal records, and strength trends appear here after your first workout.{' '}
        <a href={href('workout')}>Start one</a>.
      </EmptyState>
    );
  }

  const today = new Date();
  const target = schedule.days.length;
  const c = consistency(sessions, today, target);
  const weeks = weeklyCounts(sessions, today, 12);
  const recent = [...sessions].reverse().slice(0, 5);
  const monthAgo = Date.now() - 30 * 864e5;
  const recentPrs = derived.events.filter((e) => Date.parse(e.date) >= monthAgo).reverse().slice(0, 8);

  const selected = exerciseId && derived.logged.includes(exerciseId) ? exerciseId : derived.logged[0];
  const history = selected ? exerciseHistory(sessions, selected) : [];
  const hasE1rm = history.some((p) => p.bestE1rm !== null);
  const hasLoad = history.some((p) => p.topLoad !== null);
  const metrics: Metric[] = [...(hasE1rm ? (['e1rm'] as const) : []), ...(hasLoad ? (['topLoad'] as const) : []), 'bestReps', 'totalReps'];
  const m = metric && metrics.includes(metric) ? metric : metrics[0];
  const points = history.flatMap((p) => {
    const v = metricValue(p, m);
    return v === null ? [] : [{ x: Date.parse(p.date), y: v, lines: p.sets.map(formatSet) }];
  });

  const backupDue = needsBackupReminder(sessions, data.lastBackup, Date.now());

  return (
    <div class="overview">
      {backupDue && (
        <div class="banner-info">
          {data.lastBackup
            ? `Your last backup was ${dayLabel(data.lastBackup)} and you’ve trained since.`
            : 'You haven’t backed up your workouts yet.'}{' '}
          Your data only lives in this browser. <a href={href('settings')}>Export a backup in Settings</a>.
        </div>
      )}
      <div class="stat-row">
        <div class="stat">
          <div class="stat-label">This week</div>
          <div class="stat-value">
            {c.thisWeek}
            <span class="muted"> / {c.target}</span>
          </div>
          <div class="muted small">workouts vs schedule</div>
        </div>
        <div class="stat">
          <div class="stat-label">Average per week</div>
          <div class="stat-value">{c.avgPerWeek === null ? '–' : fmt(c.avgPerWeek)}</div>
          <div class="muted small">last 4 full weeks</div>
        </div>
        <div class="stat">
          <div class="stat-label">Streak</div>
          <div class="stat-value">
            {c.streak}
            <span class="muted"> {c.streak === 1 ? 'week' : 'weeks'}</span>
          </div>
          <div class="muted small">hitting {target} per week</div>
        </div>
        <div class="stat">
          <div class="stat-label">Consistency</div>
          <div class="stat-value">{c.hitRate === null ? '–' : `${Math.round(c.hitRate * 100)}%`}</div>
          <div class="muted small">of full weeks on target</div>
        </div>
        <div class="stat">
          <div class="stat-label">Total workouts</div>
          <div class="stat-value">{sessions.length}</div>
          <div class="muted small">since {dayLabel(sessions[0].startedAt)}</div>
        </div>
      </div>

      <section class="panel wide chart-panel">
        <h2>Workouts per week</h2>
        <BarChart
          label={`Workouts per week for the last 12 weeks, target ${target}`}
          target={target}
          targetLabel={`Target ${target}`}
          bars={weeks.map((w) => ({
            key: w.key,
            label: w.weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
            value: w.count,
            lines: [`${w.count} ${w.count === 1 ? 'workout' : 'workouts'}`],
          }))}
        />
      </section>

      <div class="two-col">
        <section class="panel">
          <h2>Recent workouts</h2>
          <ul class="plain-list">
            {recent.map((s) => {
              const { done, total } = progress(s);
              return (
                <li key={s.id}>
                  <a href={href('history', s.id)}>
                    <span>{dayLabel(s.startedAt)}</span>
                    <span>{s.plan.templateName}</span>
                    <span class="muted small">
                      {done}/{total} sets
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
        <section class="panel">
          <h2>Recent personal records</h2>
          {recentPrs.length === 0 ? (
            <p class="muted small">No new records in the last 30 days. Records start counting from your second session of an exercise.</p>
          ) : (
            <ul class="plain-list pr-list">
              {recentPrs.map((e) => (
                <li key={`${e.sessionId}-${e.exerciseId}-${e.kind}`}>
                  <a href={href('history', e.sessionId)}>
                    <span>{derived.names.get(e.exerciseId)}</span>
                    <span>
                      {PR_LABEL[e.kind]}: {e.kind === 'reps' ? `${e.value} reps` : `${e.set.loadKind === 'bodyweight' ? '+' : ''}${fmt(e.value)} kg`}
                      <span class="muted small"> (was {e.kind === 'reps' ? e.previous : fmt(e.previous)})</span>
                    </span>
                    <span class="muted small">{dayLabel(e.date)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section class="panel wide chart-panel">
        <div class="chart-head">
          <h2>Exercise progress</h2>
          <div class="spacer" />
          <select aria-label="Exercise" value={selected} onChange={(e) => setExerciseId((e.target as HTMLSelectElement).value)}>
            {derived.logged.map((id) => (
              <option key={id} value={id}>
                {derived.names.get(id)}
              </option>
            ))}
          </select>
          <div class="segmented" role="radiogroup" aria-label="Measure">
            {metrics.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={m === x} class={m === x ? 'seg active' : 'seg'} onClick={() => setMetric(x)}>
                {METRIC_LABEL[x]}
              </button>
            ))}
          </div>
        </div>
        <LineChart label={`${derived.names.get(selected)}: ${METRIC_LABEL[m]} over time`} unit={METRIC_UNIT[m]} points={points} />
        {m === 'e1rm' && <p class="muted small">Estimated 1RM uses the Epley formula on weighted sets (per dumbbell for DB exercises). It’s a trend indicator, not a max you should test.</p>}
        <details class="data-table">
          <summary>Show as table</summary>
          <table class="summary-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sets</th>
                <th>{METRIC_LABEL[m]}</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((p) => {
                const v = metricValue(p, m);
                return (
                  <tr key={p.sessionId}>
                    <td>{dayLabel(p.date)}</td>
                    <td>{p.sets.map(formatSet).join(', ')}</td>
                    <td>{v === null ? '–' : `${fmt(v)} ${METRIC_UNIT[m]}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      </section>

      <section class="panel wide">
        <h2>Personal records</h2>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Exercise</th>
              <th>Most reps</th>
              <th>Heaviest</th>
              <th>Best est. 1RM</th>
            </tr>
          </thead>
          <tbody>
            {derived.logged.map((id) => {
              const r = derived.records.get(id)!;
              return (
                <tr key={id}>
                  <td>{derived.names.get(id)}</td>
                  <td>
                    {r.reps ? (
                      <>
                        {r.reps.value} <span class="muted small">{dayLabel(r.reps.date)}</span>
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td>
                    {r.load ? (
                      <>
                        {r.load.set.loadKind === 'bodyweight' ? '+' : ''}{fmt(r.load.value)} kg × {r.load.reps} <span class="muted small">{dayLabel(r.load.date)}</span>
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td>
                    {r.e1rm ? (
                      <>
                        {fmt(r.e1rm.value)} kg <span class="muted small">{dayLabel(r.e1rm.date)}</span>
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

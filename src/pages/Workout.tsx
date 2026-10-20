import { useEffect, useRef, useState } from 'preact/hooks';
import { EmptyState } from '../components/EmptyState';
import { getDB } from '../db/db';
import { sessions as sessionRepo, templates as templateRepo } from '../db/repos';
import type { Session, Template } from '../db/types';
import { href } from '../router';
import { setWorkoutActive } from '../workout/activeFlag';
import { SessionView } from '../workout/SessionView';
import { formatDuration, formatSet, progress, summarize, type PreviousSets } from '../workout/session';
import {
  discardSession,
  finishSession,
  getActiveSession,
  previousSets,
  saveSession,
  startSession,
} from '../workout/store';

type View =
  | { kind: 'loading' }
  | { kind: 'start' }
  | { kind: 'session'; session: Session; previous: PreviousSets }
  | { kind: 'summary'; session: Session; previous: PreviousSets };

export function WorkoutPage() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const open = async (session: Session) => {
    const db = await getDB();
    const previous = await previousSets(db, session.exerciseIds, session.id);
    sessionRef.current = session;
    setWorkoutActive(true);
    setView({ kind: 'session', session, previous });
  };

  useEffect(() => {
    void (async () => {
      const active = await getActiveSession(await getDB());
      if (active) await open(active);
      else setView({ kind: 'start' });
    })();
  }, []);

  if (view.kind === 'loading') return <div class="muted">Loading…</div>;

  if (view.kind === 'start') {
    return (
      <StartScreen
        onStart={async (templateId) => {
          try {
            await open(await startSession(await getDB(), templateId));
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
        error={error}
      />
    );
  }

  if (view.kind === 'summary') {
    return <Summary session={view.session} previous={view.previous} onDone={() => setView({ kind: 'start' })} />;
  }

  const { previous } = view;

  const apply = (update: (s: Session) => Session): Session => {
    const current = sessionRef.current!;
    const next = update(current);
    if (next === current) return current;
    sessionRef.current = next;
    setView({ kind: 'session', session: next, previous });
    void (async () => {
      try {
        await saveSession(await getDB(), next);
        setError(null);
      } catch (err) {
        console.error(err);
        setError('Couldn’t save your last change. Keep this page open and try again.');
      }
    })();
    return next;
  };

  const finish = async () => {
    const s = sessionRef.current!;
    const { done, total } = progress(s);
    if (done === 0 && !confirm('No sets are ticked. Finish anyway? It will be saved with no sets.')) return;
    if (done > 0 && done < total && !confirm(`${total - done} of ${total} sets aren’t ticked. Finish anyway?`)) return;
    const closed = await finishSession(await getDB(), s);
    sessionRef.current = null;
    setWorkoutActive(false);
    setView({ kind: 'summary', session: closed, previous });
  };

  const discard = async () => {
    if (!confirm('Discard this workout? The sets you logged in it will not be kept in your history.')) return;
    await discardSession(await getDB(), sessionRef.current!);
    sessionRef.current = null;
    setWorkoutActive(false);
    setView({ kind: 'start' });
  };

  return (
    <SessionView
      session={view.session}
      previous={previous}
      onChange={apply}
      onFinish={() => void finish()}
      onDiscard={() => void discard()}
      saveError={error}
    />
  );
}

function StartScreen({ onStart, error }: { onStart: (templateId: string) => void; error: string | null }) {
  const [routines, setRoutines] = useState<Template[] | null>(null);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [lastDone, setLastDone] = useState<Map<string, string>>(new Map());
  const [starting, setStarting] = useState(false);
  const suggestedBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => suggestedBtn.current?.focus(), [routines]);

  useEffect(() => {
    void (async () => {
      const db = await getDB();
      const ts = await templateRepo.list(db);
      const completed = await sessionRepo.byStatus(db, 'completed');
      const last = completed.at(-1);
      const map = new Map<string, string>();
      for (const s of completed) map.set(s.templateId, s.startedAt);
      // Strict alternation: next is the routine after the last completed one.
      const idx = last ? ts.findIndex((t) => t.id === last.templateId) : -1;
      setSuggestedId(ts.length ? ts[(idx + 1) % ts.length].id : null);
      setLastDone(map);
      setRoutines(ts);
    })();
  }, []);

  if (!routines) return <div class="muted">Loading…</div>;

  return (
    <>
      <header class="page-header">
        <h1>Workout</h1>
      </header>
      {error && <div class="banner-error">{error}</div>}
      {routines.length === 0 ? (
        <EmptyState title="No routines">
          Create one in <a href={href('settings')}>Settings</a>.
        </EmptyState>
      ) : (
        <div class="start-grid">
          {routines.map((t) => {
            const suggested = t.id === suggestedId;
            const last = lastDone.get(t.id);
            const empty = t.slots.length === 0;
            return (
              <section key={t.id} class={suggested ? 'start-card suggested' : 'start-card'}>
                <div class="start-top">
                  <h2 class="start-name">{t.name}</h2>
                  {suggested && <span class="badge">Up next</span>}
                </div>
                <div class="muted">{t.emphasis}</div>
                <div class="muted small start-meta">
                  {t.slots.length} exercises · {t.slots.reduce((n, s) => n + s.sets, 0)} sets ·{' '}
                  {t.mode === 'superset' ? 'Supersets' : 'Straight sets'}
                </div>
                <div class="muted small">{last ? `Last done ${formatDate(last)}` : 'Not done yet'}</div>
                <button
                  type="button"
                  class={suggested ? 'btn primary start-btn' : 'btn start-btn'}
                  disabled={starting || empty}
                  ref={suggested ? suggestedBtn : undefined}
                  onClick={() => {
                    setStarting(true);
                    onStart(t.id);
                  }}
                >
                  {empty ? 'Add exercises in Settings first' : `Start ${t.name}`}
                </button>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function Summary({ session, previous, onDone }: { session: Session; previous: PreviousSets; onDone: () => void }) {
  const sum = summarize(session, previous);
  const doneBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => doneBtn.current?.focus(), []);
  return (
    <div class="summary">
      <header class="page-header">
        <h1>Workout complete</h1>
        <div class="muted">
          {session.plan.templateName} · {formatDate(session.startedAt)}
        </div>
      </header>
      <div class="stat-row">
        <div class="stat">
          <div class="stat-label">Duration</div>
          <div class="stat-value">{formatDuration(sum.durationSec)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Sets done</div>
          <div class="stat-value">
            {sum.done}
            <span class="muted"> / {sum.total}</span>
          </div>
        </div>
      </div>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Exercise</th>
            <th>This time</th>
            <th>Last time</th>
          </tr>
        </thead>
        <tbody>
          {sum.exercises.map((e) => (
            <tr key={e.slotId}>
              <td>{e.name}</td>
              <td>{e.done.length ? e.done.map(formatSet).join(', ') : <span class="muted">Skipped</span>}</td>
              <td class="muted">{e.previous.length ? e.previous.map(formatSet).join(', ') : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="summary-actions">
        <button type="button" class="btn primary" ref={doneBtn} onClick={onDone}>
          Done
        </button>
        <a class="text-btn" href={href('history', session.id)}>
          View or edit in History
        </a>
      </div>
    </div>
  );
}

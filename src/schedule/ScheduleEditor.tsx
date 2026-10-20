import { useEffect, useState } from 'preact/hooks';
import { getDB } from '../db/db';
import { settings } from '../db/repos';
import { PRESETS, WEEK_ORDER, scheduleFromDays } from './schedule';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ScheduleEditor() {
  const [days, setDays] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => setDays((await settings.get(await getDB(), 'schedule')).days))();
  }, []);

  if (!days) return <div class="muted">Loading…</div>;

  const apply = async (next: number[]) => {
    setDays(next);
    const schedule = scheduleFromDays(next);
    if (!schedule) return;
    try {
      await settings.set(await getDB(), 'schedule', schedule);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Couldn’t save your schedule. Try again.');
    }
  };

  const valid = scheduleFromDays(days);

  return (
    <div class="schedule-editor">
      <div class="row">
        <span class="row-label">Training days</span>
        <div class="day-toggles" role="group" aria-label="Training days">
          {WEEK_ORDER.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                class={on ? 'day-toggle on' : 'day-toggle'}
                aria-pressed={on}
                aria-label={DAY_NAMES[d]}
                onClick={() => void apply(on ? days.filter((x) => x !== d) : [...days, d])}
              >
                {DAY_NAMES[d].slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>
      <div class="row">
        <span class="row-label">Presets</span>
        <div class="preset-btns">
          <button type="button" class="btn" onClick={() => void apply(PRESETS['3x'])}>
            3 days: Mon, Wed, Fri
          </button>
          <button type="button" class="btn" onClick={() => void apply(PRESETS['4x'])}>
            4 days: Mon, Tue, Thu, Fri
          </button>
        </div>
      </div>
      <p class={valid ? 'muted small schedule-note' : 'small schedule-note warn'}>
        {valid
          ? valid.kind === '3x'
            ? '3 days a week. Routines alternate, so weeks run A/B/A, then B/A/B.'
            : '4 days a week. Routines alternate: A/B/A/B.'
          : `Pick 3 or 4 days (${days.length} selected). Your previous schedule stays in use until then.`}
      </p>
      {error && <div class="banner-error">{error}</div>}
    </div>
  );
}

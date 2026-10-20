import { IconCheck } from '@tabler/icons-preact';
import type { WeekDay } from './schedule';

export function WeekStrip({ days }: { days: WeekDay[] }) {
  return (
    <ol class="week" aria-label="This week">
      {days.map((d) => {
        const state = d.done.length ? 'done' : d.missed ? 'missed' : d.planned ? 'planned' : 'rest';
        return (
          <li key={d.key} class={`day ${state} ${d.isToday ? 'today' : ''}`}>
            <span class="day-name">
              {d.date.toLocaleDateString(undefined, { weekday: 'short' })} {d.date.getDate()}
            </span>
            {d.done.length > 0 ? (
              d.done.map((s) => (
                <span key={s.id} class="day-what">
                  <IconCheck size={13} stroke={2.5} /> {s.plan.templateName}
                </span>
              ))
            ) : d.planned ? (
              <span class="day-what">{d.planned.name}</span>
            ) : (
              <span class="day-what muted">{d.missed ? 'Missed' : d.scheduled ? '–' : 'Rest'}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

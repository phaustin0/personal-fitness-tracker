import { IconBarbell, IconChartLine, IconHistory, IconSettings, type Icon as TablerIcon } from '@tabler/icons-preact';
import { href, type Route } from '../router';

const items: { route: Route; label: string; Icon: TablerIcon }[] = [
  { route: 'dashboard', label: 'Dashboard', Icon: IconChartLine },
  { route: 'workout', label: 'Workout', Icon: IconBarbell },
  { route: 'history', label: 'History', Icon: IconHistory },
  { route: 'settings', label: 'Settings', Icon: IconSettings },
];

export function Sidebar({ current }: { current: Route }) {
  return (
    <nav class="sidebar" aria-label="Main">
      <div class="sidebar-title">Fitness Tracker</div>
      <ul class="nav">
        {items.map(({ route, label, Icon }) => (
          <li key={route}>
            <a
              href={href(route)}
              class={route === current ? 'nav-item active' : 'nav-item'}
              aria-current={route === current ? 'page' : undefined}
            >
              <Icon size={17} stroke={1.75} />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

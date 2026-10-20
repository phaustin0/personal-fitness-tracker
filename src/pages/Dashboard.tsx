import { BodyPanel } from '../body/BodyPanel';
import { EmptyState } from '../components/EmptyState';
import { href, useRouteParam } from '../router';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'body', label: 'Body' },
] as const;

export function DashboardPage() {
  const param = useRouteParam();
  const tab = param === 'body' ? 'body' : 'overview';
  return (
    <>
      <header class="page-header">
        <h1>Dashboard</h1>
      </header>
      <nav class="tabs" aria-label="Dashboard sections">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={t.id === 'overview' ? href('dashboard') : href('dashboard', t.id)}
            class={tab === t.id ? 'tab active' : 'tab'}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
          </a>
        ))}
      </nav>
      {tab === 'body' ? (
        <BodyPanel />
      ) : (
        <EmptyState title="No workouts logged yet">
          Your training frequency, personal records, and strength trends will appear here once you log workouts.
        </EmptyState>
      )}
    </>
  );
}

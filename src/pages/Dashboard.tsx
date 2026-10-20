import { EmptyState } from '../components/EmptyState';

export function DashboardPage() {
  return (
    <>
      <header class="page-header">
        <h1>Dashboard</h1>
      </header>
      <EmptyState title="No workouts logged yet">
        Your training frequency, personal records, and body measurement trends will appear here once you
        log workouts.
      </EmptyState>
    </>
  );
}

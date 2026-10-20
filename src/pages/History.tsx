import { EmptyState } from '../components/EmptyState';

export function HistoryPage() {
  return (
    <>
      <header class="page-header">
        <h1>History</h1>
      </header>
      <EmptyState title="No sessions yet">Completed workouts will be listed here.</EmptyState>
    </>
  );
}

import { EmptyState } from '../components/EmptyState';

export function WorkoutPage() {
  return (
    <>
      <header class="page-header">
        <h1>Workout</h1>
      </header>
      <EmptyState title="Workout logging isn't built yet">
        Starting Full Body A or B and logging sets arrives in phase 3.
      </EmptyState>
    </>
  );
}

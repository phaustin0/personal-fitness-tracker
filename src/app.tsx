import { Sidebar } from './components/Sidebar';
import { useRoute } from './router';
import { DashboardPage } from './pages/Dashboard';
import { WorkoutPage } from './pages/Workout';
import { HistoryPage } from './pages/History';
import { SettingsPage } from './pages/Settings';

const pages = {
  dashboard: DashboardPage,
  workout: WorkoutPage,
  history: HistoryPage,
  settings: SettingsPage,
};

export function App() {
  const route = useRoute();
  const Page = pages[route];
  return (
    <div class="shell">
      <Sidebar current={route} />
      <main class="main">
        <Page />
      </main>
    </div>
  );
}

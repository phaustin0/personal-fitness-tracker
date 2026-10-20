import { useEffect, useState } from 'preact/hooks';
import { RoutineEditor } from '../components/RoutineEditor';
import { ScheduleEditor } from '../schedule/ScheduleEditor';
import { storageStatus, type StorageStatus } from '../db/storage';
import { useTheme, type Theme } from '../theme';

const themes: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const storageLabels: Record<StorageStatus, string> = {
  persistent: 'Persistent',
  'best-effort': 'Best effort',
  unsupported: 'Unknown',
};

export function SettingsPage() {
  const [theme, setTheme] = useTheme();
  const [storage, setStorage] = useState<StorageStatus | null>(null);

  useEffect(() => {
    void storageStatus().then(setStorage);
  }, []);

  return (
    <>
      <header class="page-header">
        <h1>Settings</h1>
      </header>
      <section class="panel wide">
        <h2>Routines</h2>
        <RoutineEditor />
      </section>
      <section class="panel">
        <h2>Schedule</h2>
        <ScheduleEditor />
      </section>
      <section class="panel">
        <h2>Appearance</h2>
        <div class="row">
          <span class="row-label">Theme</span>
          <div class="segmented" role="radiogroup" aria-label="Theme">
            {themes.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={theme === t.value}
                class={theme === t.value ? 'seg active' : 'seg'}
                onClick={() => setTheme(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section class="panel">
        <h2>Data</h2>
        <div class="row">
          <span class="row-label">Storage</span>
          <span class="row-value">{storage ? storageLabels[storage] : 'Checking…'}</span>
        </div>
      </section>
    </>
  );
}

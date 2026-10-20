import { useTheme, type Theme } from '../theme';

const themes: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function SettingsPage() {
  const [theme, setTheme] = useTheme();
  return (
    <>
      <header class="page-header">
        <h1>Settings</h1>
      </header>
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
    </>
  );
}

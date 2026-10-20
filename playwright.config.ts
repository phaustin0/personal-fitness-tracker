import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/fitness-tracker/`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && npx vite preview --base /fitness-tracker/ --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/fitness-tracker/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

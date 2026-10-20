import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({ page }) => {
  page.on('dialog', (d) => void d.accept());
});

async function startWorkout(page: Page, name: 'Full Body A' | 'Full Body B') {
  await page.goto('#/workout');
  await page.getByRole('button', { name: `Start ${name}` }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

async function finishWorkout(page: Page) {
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible();
}

test('logs a superset workout with the keyboard and resumes after a reload', async ({ page }) => {
  await page.goto('#/workout');
  await expect(page.getByRole('button', { name: 'Start Full Body A' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByLabel('Pull-ups set 1 reps')).toBeFocused();
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Single-leg calf raises set 1 left reps')).toBeFocused();
  await page.keyboard.type('15');
  await page.keyboard.press('Tab');
  await page.keyboard.type('14');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Pull-ups set 2 reps')).toBeFocused();
  await expect(page.getByText('2 of 18 sets')).toBeVisible();

  await page.reload();
  await expect(page.getByText('2 of 18 sets')).toBeVisible();
  await expect(page.getByLabel('Pull-ups set 2 reps')).toBeFocused();
  await expect(page.getByLabel('Pull-ups set 2 reps')).toHaveAttribute('placeholder', '8');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.getByText('4 of 18 sets')).toBeVisible();
  await expect(page.getByLabel('Bulgarian split squats set 1 left reps')).toBeFocused();

  await finishWorkout(page);
  const pullRow = page.getByRole('row', { name: /Pull-ups/ });
  await expect(pullRow).toContainText('BW × 8, BW × 8');
  await expect(page.getByRole('row', { name: /calf raises/ })).toContainText('BW × 15/14, BW × 15/14');
});

test('edits supersets and switches modes without changing history', async ({ page }) => {
  await startWorkout(page, 'Full Body A');
  await page.getByLabel('Pull-ups set 1 reps').fill('7');
  await page.keyboard.press('Enter');
  await finishWorkout(page);

  await page.goto('#/settings');
  const hammer = page.locator('.slot-row[data-exercise="DB hammer curls"]');
  await hammer.getByLabel('Superset', { exact: true }).selectOption({ label: 'Superset D' });
  await expect(page.locator('.slot-tag', { hasText: 'D3' })).toBeVisible();
  await page.getByRole('radio', { name: 'Straight sets' }).click();

  await startWorkout(page, 'Full Body A');
  await expect(page.locator('.straight-grid .w-unit')).toHaveCount(9);
  await expect(page.getByText('Superset A', { exact: true })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Supersets' }).click();
  const supersetD = page.locator('.w-unit.group').filter({ hasText: 'Superset D' });
  await expect(supersetD.locator('.ex-block')).toHaveCount(3);
  await page.getByRole('button', { name: 'Discard' }).click();

  await page.goto('#/history');
  await expect(page.locator('.h-item')).toHaveCount(1);
  const oldD = page.locator('.w-unit.group').filter({ hasText: 'Superset D' });
  await expect(oldD.locator('.ex-block')).toHaveCount(2);
  await expect(page.locator('.w-unit:not(.group)').filter({ hasText: 'DB hammer curls' })).toHaveCount(1);
});

test('exports a backup and restores it into an empty browser', async ({ page }) => {
  await startWorkout(page, 'Full Body A');
  await page.getByLabel('Pull-ups set 1 reps').fill('9');
  await page.keyboard.press('Enter');
  await finishWorkout(page);

  await page.goto('#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const path = await download.path();
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(backup.app).toBe('fitness-tracker');
  expect(backup.data.sessions).toHaveLength(1);

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase('fitness-tracker');
        r.onsuccess = r.onerror = r.onblocked = () => resolve();
      }),
  );
  await page.goto('about:blank');
  await page.goto('#/history');
  await expect(page.getByText('No workouts yet')).toBeVisible();

  await page.goto('#/settings');
  await page.locator('.backup input[type=file]').setInputFiles(path);
  await expect(page.getByText('In the file')).toBeVisible();
  await expect(page.locator('.import-preview')).toContainText('1 workout (');
  await expect(page.getByRole('radio', { name: /^Replace:/ })).toBeChecked();
  const safety = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Replace my data' }).click();
  await safety;
  await expect(page.getByText('Backup restored')).toBeVisible();

  await page.waitForLoadState('load');
  await page.goto('#/history');
  await expect(page.locator('.h-item')).toHaveCount(1);
  await expect(page.locator('.read-row').first()).toContainText('9');
});

test('rejects an invalid backup without changing anything', async ({ page }) => {
  await page.goto('#/settings');
  await page.locator('.backup input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await expect(page.getByText('This isn’t a Fitness Tracker backup file.')).toBeVisible();
  await expect(page.locator('.import-preview')).toHaveCount(0);
});

test('saves body measurements across reloads', async ({ page }) => {
  await page.goto('#/dashboard/body');
  await page.getByLabel('Body weight (kg)').fill('74.4');
  await page.getByLabel('Waist (cm)').fill('81');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved for/)).toBeVisible();
  await page.reload();
  await expect(page.locator('.stat').filter({ hasText: 'Body weight' })).toContainText('74.4 kg');
  await expect(page.locator('.body-table')).toContainText('81');
});

test('navigates with keyboard shortcuts', async ({ page }) => {
  await page.goto('#/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('4');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});

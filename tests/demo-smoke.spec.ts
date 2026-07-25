import { expect, test } from '@playwright/test';

test('completes the guided simulation path', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByText('SIMULATION DEMO')).toBeVisible();
  await page.getByRole('button', { name: 'Review mission' }).click();
  await expect(page.getByText('Synthetic Range Alpha')).toBeVisible();
  await page.locator('[data-demo-target="start-simulation"]').click();
  await expect(page.getByText(/telemetry/i)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Observe the simulated flight' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to 3D inspection' }).click();
  await expect(page.getByRole('dialog', { name: 'Inspect the mission in 3D' })).toBeVisible();
  await page.locator('[data-demo-target="toggle-3d"]').click();
  await expect(page.locator('.cesium-widget canvas')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Review recorded telemetry' })).toBeVisible();
  await expect(page.locator('[data-demo-target="open-replay"]')).toBeEnabled();
  await page.locator('[data-demo-target="open-replay"]').click();
  await expect(page.getByRole('region', { name: 'Mission replay' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-demo-active-target]')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

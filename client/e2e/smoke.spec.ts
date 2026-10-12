import { expect, test } from '@playwright/test';
test('register, load demo data, view overview, protect routes', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
  const email = `e2e${Date.now()}@test.com`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E User'); await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('Password@123');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: 'Business Overview' })).toBeVisible();
  await page.getByRole('button', { name: /load demo data/i }).click();
  await expect(page.getByText('Total Revenue')).toBeVisible();
  await page.goto('/datasets'); await expect(page.getByText('Demo Sales Data')).toBeVisible();
  await page.goto('/admin'); await expect(page.getByText(/not authorized/i)).toBeVisible();
});

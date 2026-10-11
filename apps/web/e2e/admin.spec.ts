import { expect, test } from '@playwright/test';

test('admin can review analytics, content, users and validate content', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@netforge.local');
  await page.getByLabel('Password').fill('ChangeMe-Admin-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Learning analytics' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/10-admin-analytics.png', fullPage: true });

  await page.goto('/admin/content');
  await page.getByText('Networking Orientation').click();
  await page.getByRole('link', { name: /What is a network\?/ }).click();
  await expect(page.getByText('Block builder')).toBeVisible();
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText('Content is valid.')).toBeVisible();
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.getByRole('button', { name: 'Ping PC2 from PC1' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/11-admin-editor-preview.png' });

  await page.goto('/admin/users');
  await expect(page.getByText('student@netforge.local')).toBeVisible();
  expect(errors).toEqual([]);
});

test('dark mode and mobile layout', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/screens/12-landing-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/curriculum');
  await page.screenshot({ path: 'e2e/screens/13-mobile-curriculum.png', fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

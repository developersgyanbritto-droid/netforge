import { expect, test, type Page } from '@playwright/test';

const shots = (name: string) => `e2e/screens/${name}.png`;

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Download the React DevTools|favicon|status of 403/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test('landing page renders a live simulation', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Learn networking by building networks/ })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  // packets are computed by the engine and narrated
  await expect(page.getByText(/Preparing simulation/)).toBeHidden({ timeout: 10_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: shots('01-landing'), fullPage: false });
  expect(errors).toEqual([]);
});

test('learner journey: register → lesson sim → lab via GUI → server-graded pass', async ({ page }) => {
  const errors = trackErrors(page);
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Your name').fill('E2E Learner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('E2e-Password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /Welcome, E2E/ })).toBeVisible();
  await page.screenshot({ path: shots('02-dashboard-new') });

  // Lesson with an embedded live topology
  await page.goto('/app/learn/what-is-a-network');
  await page.getByRole('button', { name: 'Ping PC2 from PC1' }).click();
  await expect(page.getByText('Reply received')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shots('03-lesson-sim'), fullPage: true });
  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(page.getByText(/\+\d+ XP/)).toBeVisible();
  await expect(page.getByText(/Achievement unlocked: First Steps/)).toBeVisible();

  // Lab: cable two PCs to a switch and address them through the GUI
  await page.goto('/app/learn/first-network-lab');
  await expect(page.getByText('Tasks', { exact: true })).toBeVisible();
  const node = (name: string) => page.locator('.react-flow__node').filter({ hasText: name });
  for (const pc of ['PC1', 'PC2']) {
    await node(pc).hover();
    await node(pc).locator('.react-flow__handle[data-handleid="out"]').dragTo(node('Switch1'));
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Connect' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);

  for (const [pc, ip] of [['PC1', '192.168.10.10'], ['PC2', '192.168.10.11']]) {
    await node(pc).click();
    await page.getByLabel('IPv4 address').fill(ip);
    await page.getByLabel('Subnet mask').fill('255.255.255.0');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('IP configuration applied')).toBeVisible();
  }

  // Use the host command prompt to ping
  await node('PC1').click();
  await page.getByRole('tab', { name: 'Command prompt' }).click();
  await page.getByLabel('Command line for PC1').fill('ping 192.168.10.11');
  await page.getByLabel('Command line for PC1').press('Enter');
  await expect(page.getByText(/Received = 4, Lost = 0/)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shots('04-lab-in-progress') });

  await page.getByRole('button', { name: 'Submit for grading' }).click();
  await expect(page.getByRole('dialog', { name: 'Lab passed' })).toBeVisible();
  await expect(page.getByText(/You built a LAN/)).toBeVisible();
  await page.screenshot({ path: shots('05-lab-passed') });
  await page.keyboard.press('Escape');

  // Dashboard reflects real progress
  await page.goto('/app');
  await expect(page.getByText('Recent activity')).toBeVisible();
  await expect(page.getByText('Build your first network').first()).toBeVisible();
  await page.screenshot({ path: shots('06-dashboard-progress'), fullPage: true });

  // Locked content is enforced
  await page.goto('/app/learn/what-routers-do');
  await expect(page.getByRole('heading', { name: 'This activity is locked' })).toBeVisible();

  for (const p of ['/app/path', '/app/skills', '/app/subnetting', '/app/achievements', '/app/lab']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: shots(`07${p.replace(/\//g, '-')}`) });
  }
  expect(errors).toEqual([]);
});

test('IOS CLI drives a router in the sandbox', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill('student@netforge.local');
  await page.getByLabel('Password').fill('Student-Demo-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/app/lab');
  await page.getByTitle(/Add Router/).click();
  await page.getByRole('tab', { name: 'CLI' }).click();
  const cli = page.getByLabel('Command line for Router1');
  for (const c of ['en', 'conf t', 'int g0/0', 'ip add 10.0.0.1 255.255.255.0', 'no shut', 'do show ip int brief']) {
    await cli.fill(c);
    await cli.press('Enter');
  }
  await expect(page.getByText(/GigabitEthernet0\/0\s+10\.0\.0\.1/)).toBeVisible();
  await expect(page.getByText('Router1(config-if)#').first()).toBeVisible();
  await page.screenshot({ path: shots('08-sandbox-cli') });
  expect(errors).toEqual([]);
});

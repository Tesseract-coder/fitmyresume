import { expect, test } from '@playwright/test';
import { pythonQa } from '../tests/fixtures/resumes';
import { download, toReview } from './helpers';

test('a misbehaving AI is overruled: fabrications are blocked and never exported', async ({ page }) => {
  // The "inject" mock adds a gap skill (Java), a fake "73%" metric, "Led" ownership and "Expert in Java".
  await toReview(page, { scenario: 'inject' });

  const blocked = page.getByRole('button', { name: /Blocked changes \((\d+)\)/ });
  await expect(blocked).not.toHaveText(/\(0\)/);
  await blocked.click();
  const drawer = page.getByRole('dialog', { name: 'Blocked changes' });
  await expect(drawer.getByText('Invented number')).toBeVisible();
  await expect(drawer.getByText('Missing skill added').first()).toBeVisible();
  await drawer.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /Continue to export/ }).click();
  const text = (await download(page, 'Plain text (TXT)')).data.toString('utf8');
  expect(text).not.toMatch(/\bJava\b/);
  expect(text).not.toContain('73%');
  expect(text).not.toMatch(/\bExpert in\b/);
  // Locked fields are byte-identical.
  for (const role of pythonQa.experience) expect(text).toContain(`${role.title} | ${role.company}`);
  expect(text).toContain(pythonQa.contact.phone);
});

test('malformed AI JSON is recovered by the one automatic retry', async ({ page }) => {
  await toReview(page, { scenario: 'broken-json' });
  await expect(page.getByText(/Suggested changes \(\d+\)/)).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { confirmDetails, download, score, start, tailor } from './helpers';

test('skills the user confirms on Analysis are added to Skills, matched, and undoable', async ({ page }) => {
  await start(page);
  await confirmDetails(page);
  const keywords = (status: string) => page.getByRole('region', { name: new RegExp(status) });
  await expect(keywords('Gap').getByRole('button', { name: 'Remove Java from the job terms' })).toBeVisible();
  const before = await score(page, 'ATS score now');

  const add = page.getByRole('button', { name: /to my resume/ });
  await expect(add).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Java/ }).check();
  await page.getByRole('button', { name: 'Add 1 to my resume' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Added by you' })).toContainText('Java');
  await expect(keywords('Matched').getByRole('button', { name: 'Remove Java from the job terms' })).toBeVisible();
  await expect(page.getByText(/Score is capped at/)).toHaveCount(0);
  await expect.poll(() => score(page, 'ATS score now')).toBeGreaterThan(before);

  // It is now part of the resume everywhere: tailoring keeps it, and it's exported.
  await tailor(page);
  await page.getByRole('button', { name: /Continue to export/ }).click();
  const txt = (await download(page, 'Plain text (TXT)')).data.toString('utf8');
  expect(txt).toMatch(/Languages: .*\bJava\b/);

  // Undo restores the original Skills section.
  await page.goto('/analysis');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(keywords('Gap').getByRole('button', { name: 'Remove Java from the job terms' })).toBeVisible();
  await expect.poll(() => score(page, 'ATS score now')).toBe(before);
});

test('warns when a ticked skill implies another gap (RestAssured is built on Java)', async ({ page }) => {
  await start(page, { jd: 'QA Engineer — Initech\nRequirements: Java, RestAssured, Cucumber.\nYou will build API test suites for our payments platform.' });
  await confirmDetails(page);
  const note = page.getByRole('note').filter({ hasText: 'built on' });
  await page.getByRole('checkbox', { name: /^RestAssured/ }).check();
  await expect(note).toHaveText(/RestAssured is built on Java, so adding it will also count as Java experience\. Only add it if that's true\./);
  await page.getByRole('checkbox', { name: /^Java/ }).check();
  await expect(note).toHaveCount(0);
  await page.getByRole('checkbox', { name: /^Java/ }).uncheck();
  await page.getByRole('checkbox', { name: /^Cucumber/ }).check();
  await expect(note).toHaveCount(1); // Cucumber implies nothing extra
});

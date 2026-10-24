import { expect, test } from '@playwright/test';
import { confirmDetails, download, score, start, tailor } from './helpers';

test('guided questions add only the user’s numbers, lift the score, and can be undone', async ({ page }) => {
  await start(page);
  await confirmDetails(page);
  const before = await score(page, 'ATS score now');
  await expect(page.getByText(/bullets include a number\. Recruiters/)).toContainText('2 of 7');
  await page.getByRole('button', { name: 'Add real numbers' }).click();
  await expect(page.getByRole('heading', { name: 'Add real numbers' })).toBeVisible();
  await expect(page.getByText('Question 1 of 5')).toBeVisible();

  // Q1: nothing can be saved until a number is typed.
  const save = page.getByRole('button', { name: 'Save & next' });
  await expect(save).toBeDisabled();

  // Find the checkout-flow bullet and answer it with a count.
  for (let i = 0; i < 5; i++) {
    if (await page.getByText('“Wrote Selenium tests in Python for the checkout flow.”').count()) break;
    await page.getByRole('button', { name: /Skip/ }).click();
  }
  await page.getByRole('radio', { name: /How many tests or test cases/ }).check();
  await page.getByLabel('How many?').fill('120');
  const preview = page.getByLabel(/New bullet/);
  await expect(preview).toHaveValue('Wrote Selenium tests in Python for the checkout flow, covering 120 test cases.');
  await save.click();

  // Skip the rest, then review the summary.
  while (await page.getByRole('button', { name: /Skip/ }).count()) await page.getByRole('button', { name: /Skip/ }).click();
  await expect(page.getByRole('heading', { name: 'You added numbers to 1 bullet' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Bullets with a number' })).toHaveAttribute('aria-valuenow', '3');

  // It is now part of the resume: the score rises and tailoring/export keep it.
  await page.getByRole('button', { name: 'Continue to tailoring' }).click();
  await expect.poll(() => score(page, 'ATS score now')).toBeGreaterThan(before);
  await tailor(page);
  await page.getByRole('button', { name: /Continue to export/ }).click();
  expect((await download(page, 'Plain text (TXT)')).data.toString('utf8')).toContain('checkout flow, covering 120 test cases.');

  // Undo restores the original bullet.
  // Undo is available straight away on return, without stepping through the questions.
  await page.goto('/strengthen');
  await expect(page.getByRole('heading', { name: 'Your changes so far' })).toBeVisible();
  await page.getByRole('button', { name: /^Undo: / }).click();
  await expect(page.getByRole('heading', { name: 'Your changes so far' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish later' }).click();
  await expect.poll(() => score(page, 'ATS score now')).toBe(before);
});

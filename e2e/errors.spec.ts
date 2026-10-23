import { expect, test } from '@playwright/test';
import { javaSdetJdText } from '../tests/fixtures/resumes';
import { confirmDetails, fixture, start, tailor } from './helpers';

test('daily quota reached → friendly dialog → continue offline', async ({ page }) => {
  await start(page, { scenario: 'quota' });
  const dialog = page.getByRole('dialog', { name: 'Daily free limit reached' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Add your own API key/ })).toBeVisible();
  await dialog.getByRole('button', { name: /offline mode/ }).click();

  // The same step re-runs offline, and later steps stay offline (no more quota errors).
  await confirmDetails(page);
  await expect(page.getByRole('radio', { name: 'Offline (no AI)' })).toHaveAttribute('aria-checked', 'true');
  await tailor(page);
});

test('quota dialog → add your own key opens settings', async ({ page }) => {
  await start(page, { scenario: 'quota' });
  await page.getByRole('button', { name: /Add your own API key/ }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText(/never stored on the server/)).toHaveCount(0); // warning only after picking a provider
  await page.getByRole('radio', { name: 'Anthropic (Claude)' }).check();
  await expect(page.getByText(/never stored on the server/)).toBeVisible();
});

test('unsupported files get a clear message', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', { name: 'resume.doc', mimeType: 'application/msword', buffer: Buffer.from('legacy') });
  await expect(page.getByRole('alert')).toContainText('Old .doc files are not supported');
  await page.setInputFiles('input[type=file]', { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('png') });
  await expect(page.getByRole('alert')).toContainText('Please upload a PDF, DOCX or TXT file');
});

test('continue stays disabled until both inputs are long enough', async ({ page }) => {
  await page.goto('/');
  const go = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(go).toBeDisabled();
  await page.getByLabel('Resume text').fill('Too short');
  await page.getByLabel('Job description').fill(javaSdetJdText);
  await expect(go).toBeDisabled();
  await expect(page.getByText(/Resume needs 50/)).toBeVisible();
});

test('DOCX upload is parsed in the browser', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', fixture('arjun.docx'));
  await expect(page.getByLabel('Resume text')).toHaveValue(/Arjun Mehta/);
  await page.getByLabel('Job description').fill(javaSdetJdText);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByLabel(/Full name/)).toHaveValue('Arjun Mehta');
});

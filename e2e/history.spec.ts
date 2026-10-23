import { expect, test } from '@playwright/test';
import { download, toReview } from './helpers';

test('exported versions are saved on the device and can be duplicated, opened and deleted', async ({ page }) => {
  await toReview(page);
  await page.getByRole('button', { name: /Continue to export/ }).click();
  await download(page, 'Plain text (TXT)');
  await expect(page.getByRole('button', { name: /Saved to history/ })).toBeVisible();

  await page.getByRole('button', { name: 'View history' }).click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  const rows = page.locator('main ul > li');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Senior SDET @ Globex');

  await page.getByRole('button', { name: /^Duplicate/ }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('Senior SDET @ Globex (copy)')).toBeVisible();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete Senior SDET @ Globex (copy)' }).click();
  await expect(rows).toHaveCount(1);

  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'Review the changes' })).toBeVisible();
});

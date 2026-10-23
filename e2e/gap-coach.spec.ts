import { expect, test } from '@playwright/test';
import { confirmDetails, start, toReview } from './helpers';

test('coach explains a must-have gap honestly and syncs "learning" with the cover letter', async ({ page }) => {
  await start(page);
  await confirmDetails(page);
  await page.getByRole('button', { name: 'How to close these gaps' }).click();
  await expect(page.getByRole('heading', { name: 'Skills-gap coach' })).toBeVisible();

  const java = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: /^Java/ }) });
  await expect(java.getByRole('heading', { name: /^Java/ })).toContainText('Must-have');
  await expect(java.getByLabel('What transfers')).toContainText('Python');
  await expect(java.getByRole('link', { name: /dev\.java/ })).toHaveAttribute('href', 'https://dev.java/learn/');
  await expect(java.getByText('I bring hands-on experience with Python, and I am actively ramping up on Java.')).toBeVisible();
  await expect(java.getByText(/My plan would be to start with/)).toBeVisible();

  await java.getByRole('switch', { name: /I've started learning Java/ }).click();
  await expect(java.getByRole('heading', { name: /^Java/ })).toContainText('Learning');
  await expect(java.getByText(/I've already started learning it/)).toBeVisible();

  // The cover letter picks up the same choice.
  await page.getByRole('button', { name: 'Cover letter', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Java' })).toBeChecked();
  await page.getByRole('button', { name: 'Write my cover letter' }).click();
  await expect(page.getByRole('article', { name: 'Cover letter preview' })).toContainText('I bring hands-on experience with Python, and I am actively ramping up on Java.');

  // …and unticking it there is reflected back in the coach.
  await page.getByRole('checkbox', { name: 'Java' }).uncheck();
  await page.getByRole('button', { name: 'Skills-gap coach' }).click();
  await expect(page.getByRole('switch', { name: /I've started learning Java/ })).not.toBeChecked();
});

test('the coach is reachable from the review screen', async ({ page }) => {
  await toReview(page);
  await page.getByRole('button', { name: 'Open the skills-gap coach' }).click();
  await expect(page.getByRole('heading', { name: 'Skills-gap coach' })).toBeVisible();
  await expect(page.getByText(/Your ATS score is capped at \d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Review the changes' })).toBeVisible();
});

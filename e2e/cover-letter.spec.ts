import { expect, test, type Page } from '@playwright/test';
import { download, toReview, type Scenario } from './helpers';

async function openCoverLetter(page: Page, scenario?: Scenario) {
  await toReview(page, scenario ? { scenario } : {});
  await page.getByRole('button', { name: 'Write a cover letter' }).click();
  await expect(page.getByRole('heading', { name: 'Cover letter' })).toBeVisible();
}

const preview = (page: Page) => page.getByRole('article', { name: 'Cover letter preview' });

test('writes an honest cover letter with the user’s own motivation and opt-in learning note', async ({ page }) => {
  await openCoverLetter(page);
  await page.getByLabel('Hiring manager (optional)').fill('Ms. Rivera');
  await page.getByLabel(/Why this company/).fill('I use Globex every week and care about reliable payments');
  await page.getByRole('checkbox', { name: 'Java' }).check();
  await page.getByRole('button', { name: 'Write my cover letter' }).click();

  const letter = preview(page);
  await expect(letter).toContainText('Dear Ms. Rivera,');
  await expect(letter).toContainText('Senior SDET role at Globex');
  await expect(letter).toContainText('I use Globex every week and care about reliable payments.');
  await expect(letter).toContainText('I am also actively building my skills in Java.');
  await expect(page.getByRole('button', { name: 'Blocked sentences (0)' })).toBeVisible();

  const txt = await download(page, 'Plain text (TXT)');
  expect(txt.name).toBe('Priya_Sharma_Cover_Letter_Globex.txt');
  const text = txt.data.toString('utf8');
  // Java appears exactly once: in the opt-in learning sentence, never as experience.
  expect(text.match(/\bJava\b/g)).toHaveLength(1);
  expect(text.trimEnd().endsWith('Sincerely,\nPriya Sharma')).toBe(true);

  const pdf = await download(page, 'PDF');
  expect(pdf.name).toBe('Priya_Sharma_Cover_Letter_Globex.pdf');
  expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');
  const docx = await download(page, 'Word (DOCX)');
  expect(docx.data.subarray(0, 2).toString()).toBe('PK');

  // Unticking the learning note updates the letter without calling the AI again.
  await page.getByRole('checkbox', { name: 'Java' }).uncheck();
  await expect(letter).not.toContainText('Java');
});

test('fabricated sentences from the AI are removed before the user sees them', async ({ page }) => {
  // The "inject" mock adds: "I have 9 years of hands-on Java experience and led a team that improved deployment speed by 73%."
  await openCoverLetter(page, 'inject');
  await page.getByRole('button', { name: 'Write my cover letter' }).click();
  const letter = preview(page);
  await expect(letter).toContainText('Senior SDET role at Globex');
  await expect(letter).not.toContainText('73%');
  await expect(letter).not.toContainText('9 years');
  await expect(letter).not.toContainText('Java');

  await page.getByRole('button', { name: /Blocked sentences \([1-9]/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Blocked changes' });
  await expect(drawer.getByText('Missing skill added').first()).toBeVisible();
  await expect(drawer.getByText('Invented number').first()).toBeVisible();
  await expect(drawer.getByText('Years of experience changed').first()).toBeVisible();
});

test('user edits are kept, survive a reload, and regenerating asks first', async ({ page }) => {
  await openCoverLetter(page);
  await page.getByRole('button', { name: 'Write my cover letter' }).click();
  await expect(preview(page)).toContainText('Globex');

  await page.getByRole('button', { name: 'Edit text' }).click();
  const first = page.getByLabel('Paragraph 1');
  await first.fill('I am writing about the Senior SDET opening at Globex, which a former colleague recommended.');
  await page.getByRole('button', { name: 'Done editing' }).click();
  await expect(page.getByText(/Edited by you/)).toBeVisible();

  await page.reload();
  await expect(preview(page)).toContainText('a former colleague recommended');

  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Write again' }).click();
  await expect(preview(page)).toContainText('a former colleague recommended');

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Write again' }).click();
  await expect(preview(page)).not.toContainText('a former colleague recommended');
  await expect(page.getByText(/Edited by you/)).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { pythonQa } from '../tests/fixtures/resumes';
import { download, score, start, confirmDetails, tailor, toReview } from './helpers';

test('upload → confirm → analysis → tailor → review → export', async ({ page }) => {
  await start(page);
  await expect(page.getByLabel(/Full name/)).toHaveValue(pythonQa.contact.name);
  await confirmDetails(page);

  // Analysis: the Java must-have is a true gap and caps the score.
  const gapSection = page.getByRole('region', { name: /Gap/ });
  await expect(gapSection.getByRole('button', { name: 'Remove Java from the job terms' })).toBeVisible();
  await expect(page.getByText(/Score is capped at \d+ because these must-haves are true gaps/)).toBeVisible();
  const now = await score(page, 'ATS score now');

  await tailor(page);
  const before = await score(page, 'Before');
  const after = await score(page, 'After');
  expect(before).toBe(now);
  expect(after).toBeGreaterThan(before);
  await expect(page.getByText(/Skills gap report/)).toBeVisible();

  await page.getByRole('button', { name: /Continue to export/ }).click();
  await expect(page.getByRole('heading', { name: 'Export your resume' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Resume preview' })).toContainText(pythonQa.contact.name);

  const txt = await download(page, 'Plain text (TXT)');
  expect(txt.name).toBe('Priya_Sharma_Resume_Globex.txt');
  const text = txt.data.toString('utf8');
  expect(text).not.toMatch(/\bJava\b/);
  for (const role of pythonQa.experience) {
    expect(text).toContain(role.title);
    expect(text).toContain(role.company);
  }
  expect(text).toContain(pythonQa.contact.email);

  const pdf = await download(page, 'PDF');
  expect(pdf.name).toBe('Priya_Sharma_Resume_Globex.pdf');
  expect(pdf.data.subarray(0, 5).toString()).toBe('%PDF-');

  const docx = await download(page, 'Word (DOCX)');
  expect(docx.name).toBe('Priya_Sharma_Resume_Globex.docx');
  expect(docx.data.subarray(0, 2).toString()).toBe('PK');
});

test('answering a metric question adds only the user-supplied number and raises the score', async ({ page }) => {
  await toReview(page);
  const after = await score(page, 'After');

  await page.getByRole('button', { name: /^(How many|Can you add|By how much|Roughly)/ }).first().click();
  const editor = page.getByLabel(/Edit the bullet with your real number/);
  await editor.fill(`${(await editor.inputValue()).replace(/\.$/, '')}, covering 120 test cases.`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Answered')).toBeVisible();
  await expect.poll(() => score(page, 'After')).toBeGreaterThan(after);

  await page.getByRole('button', { name: /Continue to export/ }).click();
  const txt = await download(page, 'Plain text (TXT)');
  expect(txt.data.toString('utf8')).toContain('120 test cases');
});

test('accept / reject toggles drive the live score', async ({ page }) => {
  await toReview(page);
  const before = await score(page, 'Before');
  const tailored = await score(page, 'After');

  await page.getByRole('button', { name: 'Reject all' }).click();
  await expect.poll(() => score(page, 'After')).toBe(before);
  await expect(page.getByRole('switch', { checked: true })).toHaveCount(0);

  await page.getByRole('button', { name: /Accept all safe changes/ }).click();
  await expect.poll(() => score(page, 'After')).toBe(tailored);
});

test('the session survives a reload (IndexedDB)', async ({ page }) => {
  await toReview(page);
  const after = await score(page, 'After');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Review the changes' })).toBeVisible();
  expect(await score(page, 'After')).toBe(after);
});

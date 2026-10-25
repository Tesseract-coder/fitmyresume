import { expect, test, type Page } from '@playwright/test';
import { download, toReview, type Scenario } from './helpers';

async function openInterview(page: Page, scenario?: Scenario) {
  await toReview(page, scenario ? { scenario } : {});
  await page.getByRole('button', { name: /Continue to export/ }).click();
  await page.getByRole('button', { name: 'Interview prep' }).click();
  await expect(page.getByRole('heading', { name: 'Interview prep' })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare my interview' }).click();
  await expect(page.getByRole('heading', { name: 'Walk me through your background.' })).toBeVisible();
}

const card = (page: Page, question: string | RegExp) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: question }) });

test('likely questions with honest outlines, notes, practice mode and export', async ({ page }) => {
  await openInterview(page);
  const questions = page.getByRole('main').getByRole('heading', { level: 2 });
  await expect(questions).toHaveCount(10);

  // STAR: the app asks for the story, and only restates resume facts.
  const story = card(page, /^Tell me about/).first();
  await expect(story.getByText('Your turn').first()).toBeVisible();
  await expect(story.getByText('From your resume')).toBeVisible();

  // The must-have gap gets the coach's honest answer.
  const gap = card(page, 'This role needs Java. What’s your experience with it?');
  await expect(gap.getByText('Honest answer')).toBeVisible();
  await expect(gap).toContainText("I haven't used Java in a professional role yet.");

  // Notes persist; practice mode hides outlines until revealed.
  await card(page, 'Walk me through your background.').getByLabel('My notes').fill('Start with Acme, keep it under two minutes.');
  await page.reload();
  await expect(card(page, 'Walk me through your background.').getByLabel('My notes')).toHaveValue('Start with Acme, keep it under two minutes.');
  await page.getByRole('switch', { name: 'Practice mode' }).click();
  await expect(gap.getByText('Honest answer')).toHaveCount(0);
  await gap.getByRole('button', { name: 'Show my outline' }).click();
  await expect(gap.getByText('Honest answer')).toBeVisible();

  const txt = await download(page, 'Download TXT');
  expect(txt.name).toBe('Priya_Sharma_Interview_Prep_Globex.txt');
  const text = txt.data.toString('utf8');
  expect(text).toContain('1. Walk me through your background.');
  expect(text).toContain('My notes: Start with Acme, keep it under two minutes.');
  expect(text).toMatch(/Situation: Your turn: /);
});

test('invented stories from the AI are replaced before the user sees them', async ({ page }) => {
  // The "inject" mock writes a fake situation, "led a team of 12", "Costs fell by 73%" and "9 years of Java".
  await openInterview(page, 'inject');
  const main = page.getByRole('main');
  await expect(main).not.toContainText('led a team of 12');
  await expect(main).not.toContainText('73%');
  await expect(main).not.toContainText('30% of nights');
  await expect(main).not.toContainText('9 years of Java');
  await page.getByRole('button', { name: /^Blocked \([1-9]/ }).click();
  await expect(page.getByRole('dialog', { name: 'Blocked changes' }).getByText('Invented number').first()).toBeVisible();
});

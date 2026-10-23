import { expect, test, type Page } from '@playwright/test';
import { toReview, type Scenario } from './helpers';

async function openLinkedIn(page: Page, scenario?: Scenario) {
  await toReview(page, scenario ? { scenario } : {});
  await page.getByRole('button', { name: /Continue to export/ }).click();
  await page.getByRole('button', { name: 'LinkedIn profile' }).click();
  await expect(page.getByRole('heading', { name: 'LinkedIn profile' })).toBeVisible();
}

test('writes a truthful headline, About, skills and experience text', async ({ page }) => {
  await openLinkedIn(page);
  await page.getByRole('button', { name: 'Write my LinkedIn profile' }).click();

  const headline = page.getByTestId('linkedin-headline');
  await expect(headline).toHaveText(/^Senior QA Automation Engineer \| .*Kubernetes.* \| Fintech$/);
  await expect(headline).not.toContainText('Java');
  const about = page.getByTestId('linkedin-about');
  await expect(about).toContainText("I'm a Senior QA Automation Engineer with 6+ years of experience");
  await expect(about).toContainText(/Core skills: .*Kubernetes/);
  await expect(about).not.toContainText('Globex');
  await expect(about).not.toContainText('Java');
  await expect(page.getByRole('button', { name: 'Blocked sentences (0)' })).toBeVisible();
  const skills = page.getByRole('list', { name: 'Skills' }).getByRole('listitem');
  await expect(skills.filter({ hasText: '(pin as a top skill)' })).toHaveCount(3);
  await expect(skills.filter({ hasText: /^Kubernetes/ })).toHaveCount(1);
  await expect(skills.filter({ hasText: /^(K8s|Java)\b/ })).toHaveCount(0);
  await expect(page.getByText('• Built a Pytest automation framework for 1,200 API test cases across 14 microservices.')).toBeVisible();

  // Options are code-written lines: they apply instantly, without the AI.
  await page.getByRole('checkbox', { name: /open to Senior SDET opportunities/ }).check();
  await expect(about).toContainText("I'm open to Senior SDET opportunities in fintech.");
  await page.getByRole('checkbox', { name: /Core skills/ }).uncheck();
  await expect(about).not.toContainText('Core skills:');
  await expect(page.getByRole('checkbox', { name: /Mention what I’m learning/ })).toBeDisabled();
});

test('a misbehaving AI cannot inflate the headline or name the target company', async ({ page }) => {
  await openLinkedIn(page, 'inject');
  await page.getByRole('button', { name: 'Write my LinkedIn profile' }).click();
  await expect(page.getByTestId('linkedin-headline')).toHaveText(/^Senior QA Automation Engineer \|/);
  await expect(page.getByTestId('linkedin-about')).not.toContainText('Globex');
  await expect(page.getByTestId('linkedin-about')).not.toContainText('12 years');
  await page.getByRole('button', { name: /Blocked sentences \([1-9]/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Blocked changes' });
  await expect(drawer.getByText('Names the target company')).toBeVisible();
  await expect(drawer.getByText('Seniority inflated').first()).toBeVisible();
});

test('the coach’s "learning" choice and hand edits flow into the profile', async ({ page }) => {
  await openLinkedIn(page);
  await page.goto('/gap-coach');
  await page.getByRole('switch', { name: /I've started learning Java/ }).click();
  await page.goto('/linkedin');
  await page.getByRole('checkbox', { name: /Mention what I’m learning/ }).check();
  await page.getByRole('button', { name: 'Write my LinkedIn profile' }).click();
  await expect(page.getByTestId('linkedin-about')).toContainText('I bring hands-on experience with Python, and I am actively ramping up on Java.');

  await page.getByRole('button', { name: 'Edit text' }).click();
  await page.getByLabel('Headline', { exact: true }).fill('Senior QA Automation Engineer | Test automation for payments');
  await page.getByRole('button', { name: 'Done editing' }).click();
  await page.reload();
  await expect(page.getByTestId('linkedin-headline')).toHaveText('Senior QA Automation Engineer | Test automation for payments');
  await expect(page.getByText(/Edited by you/)).toBeVisible();
});

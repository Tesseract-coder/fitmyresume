import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { confirmDetails, start, tailor } from './helpers';

/** WCAG 2.x A/AA; fail on serious and critical issues. */
async function audit(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${screen}: ${v.id} — ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`every screen passes axe (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await audit(page, 'home');
    await start(page);
    await expect(page.getByRole('heading', { name: 'Confirm your details' })).toBeVisible();
    await audit(page, 'confirm');
    await confirmDetails(page);
    await audit(page, 'analysis');
    await page.getByRole('button', { name: 'How to close these gaps' }).click();
    await expect(page.getByRole('heading', { name: 'Skills-gap coach' })).toBeVisible();
    await audit(page, 'gap coach');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Add real numbers' }).click();
    await expect(page.getByRole('heading', { name: 'Add real numbers' })).toBeVisible();
    await audit(page, 'strengthen');
    await page.getByRole('button', { name: 'Finish later' }).click();
    await tailor(page);
    await audit(page, 'review');
    await page.getByRole('button', { name: /Continue to export/ }).click();
    await expect(page.getByRole('heading', { name: 'Export your resume' })).toBeVisible();
    await audit(page, 'export');
    await page.getByRole('button', { name: 'Cover letter' }).click();
    await page.getByRole('checkbox', { name: 'Java' }).check();
    await page.getByRole('button', { name: 'Write my cover letter' }).click();
    await expect(page.getByRole('article', { name: 'Cover letter preview' })).toBeVisible();
    await audit(page, 'cover letter');
    await page.getByRole('button', { name: 'LinkedIn profile' }).click();
    await page.getByRole('button', { name: 'Write my LinkedIn profile' }).click();
    await expect(page.getByTestId('linkedin-headline')).toBeVisible();
    await audit(page, 'linkedin');
    await page.getByRole('button', { name: 'Export resume' }).click();
    await page.getByRole('button', { name: 'Interview prep' }).click();
    await page.getByRole('button', { name: 'Prepare my interview' }).click();
    await expect(page.getByRole('heading', { name: 'Walk me through your background.' })).toBeVisible();
    await audit(page, 'interview');
    await page.getByRole('button', { name: 'Export resume' }).click();
    await page.getByRole('button', { name: 'View history' }).click();
    await audit(page, 'history');
  });
}

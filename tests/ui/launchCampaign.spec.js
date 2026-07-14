import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/test-controls/reset', {
    data: { launchFailures: {} }, // must explicitly clear - empty {} reset does not clear this on its own
  });
});
test('launching a Draft campaign moves it out of Draft toward Queued/Sent', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('tab-execution').click();

  await page
    .getByRole('article')
    .filter({ hasText: 'Dormant Buyer SMS Winback' })
    .getByTestId('launch-campaign-button')
    .click();

  // The app auto-progresses status in real time (Draft -> Queued -> Sent).
  // Asserting the exact millisecond-wide "Queued" state is racy, so we assert
  // the meaningful business outcome instead: launch moved it out of Draft.
  await expect(
    page
      .getByRole('article')
      .filter({ hasText: 'Dormant Buyer SMS Winback' })
      .getByTestId('campaign-status')
  ).not.toHaveText('Draft');

  const res = await request.get('/api/campaigns/cmp-1001');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(['Queued', 'Sent']).toContain(body.status);
});

test('a campaign that is already Sent cannot be launched again', async ({ page, request }) => {
  const beforeRes = await request.get('/api/campaigns/cmp-1003');
  expect((await beforeRes.json()).status).toBe('Sent');

  const launchRes = await request.post('/api/campaigns/cmp-1003/launch');
  expect(launchRes.status()).toBe(400);

  await page.goto('/');
  await page.getByTestId('tab-execution').click();
  const sentCampaignCard = page.getByRole('article').filter({ hasText: 'Premium Push Onboarding' });
  await expect(sentCampaignCard.getByTestId('launch-campaign-button')).toBeHidden();
});

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const res = await request.post('/api/test-controls/reset', { data: {} });
  expect(res.status()).toBe(200);
});

test('user can create a campaign successfully from the Execution tab', async ({ page, request }) => {
  const campaignName = `Diwali Sale ${Date.now()}`;

  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const scheduledAt = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;

  await page.goto('/');
  await page.getByTestId('tab-execution').click();

  await page.getByTestId('campaign-name-input').fill(campaignName);
  await page.getByTestId('channel-select').selectOption('SMS');
  await page.getByTestId('audience-select').selectOption('dormant-users');
  await page.getByTestId('send-mode-select').selectOption('scheduled');
  await page.getByTestId('schedule-input').fill(scheduledAt);
  await page.getByTestId('message-input').fill('Mega Diwali offer just for you, do not miss out.');

  await page.getByTestId('create-campaign-button').click();

  await expect(page.getByTestId('campaign-name').filter({ hasText: campaignName })).toBeVisible();

  const listResponse = await request.get(`/api/campaigns?search=${encodeURIComponent(campaignName)}`);
  expect(listResponse.status()).toBe(200);
  const body = await listResponse.json();
  expect(body.data.length).toBe(1);
  expect(body.data[0]).toMatchObject({
    name: campaignName,
    channel: 'SMS',
    audienceSegment: 'dormant-users',
    status: 'Scheduled',
  });
});

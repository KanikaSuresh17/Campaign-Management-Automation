import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  const res = await request.post('/api/test-controls/reset', { data: {} });
  expect(res.status()).toBe(200);

  await page.goto('/');
  await page.getByTestId('tab-execution').click();
});

test('filtering by status shows only campaigns with that status', async ({ page, request }) => {
  await page.getByTestId('status-filter').selectOption('Draft');

  const cards = page.getByTestId('panel-execution').getByRole('article');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Dormant Buyer SMS Winback');

  const apiRes = await request.get('/api/campaigns?status=Draft');
  expect(apiRes.status()).toBe(200);
  const body = await apiRes.json();
  expect(body.data).toHaveLength(1);
  expect(body.data[0].id).toBe('cmp-1001');
});

test('filtering by channel shows only campaigns on that channel', async ({ page, request }) => {
  await page.getByTestId('channel-filter').selectOption('Push');

  const cards = page.getByTestId('panel-execution').getByRole('article');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Premium Push Onboarding');

  const apiRes = await request.get('/api/campaigns?channel=Push');
  expect(apiRes.status()).toBe(200);
  const body = await apiRes.json();
  expect(body.data).toHaveLength(1);
  expect(body.data[0].id).toBe('cmp-1003');
});

test('combined status and channel filters narrow results correctly', async ({ page, request }) => {
  await page.getByTestId('status-filter').selectOption('Scheduled');
  await page.getByTestId('channel-filter').selectOption('SMS');

  const cards = page.getByTestId('panel-execution').getByRole('article');
  await expect(cards).toHaveCount(0);

  const apiRes = await request.get('/api/campaigns?status=Scheduled&channel=SMS');
  expect(apiRes.status()).toBe(200);
  const body = await apiRes.json();
  expect(body.data).toHaveLength(0);
});

test('clearing filters restores the full seeded campaign list', async ({ page, request }) => {
  await page.getByTestId('status-filter').selectOption('Sent');
  await expect(page.getByTestId('panel-execution').getByRole('article')).toHaveCount(1);

  await page.getByTestId('status-filter').selectOption('');

  const cards = page.getByTestId('panel-execution').getByRole('article');
  await expect(cards).toHaveCount(3);

  const apiRes = await request.get('/api/campaigns');
  const body = await apiRes.json();
  expect(body.data).toHaveLength(3);
});

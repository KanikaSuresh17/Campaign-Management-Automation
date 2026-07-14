import { test, expect } from '@playwright/test';
// This file mutates shared, global backend state on a single live server
// (not a per-worker sandbox). Running these in parallel causes one worker's
// reset/create calls to race against another's, producing flaky failures
// that have nothing to do with the app itself. Force serial execution here.
test.describe.configure({ mode: 'serial' });

test.describe('POST /api/test-controls/reset', () => {
  test('restores the exact seeded campaigns and summary counts', async ({ request }) => {
    const res = await request.post('/api/test-controls/reset', { data: {} });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.campaigns).toHaveLength(3);
    expect(body.summary).toMatchObject({
      total: 3,
      draft: 1,
      scheduled: 1,
      queued: 0,
      sent: 1,
      failed: 0,
    });
    const ids = body.campaigns.map((c) => c.id).sort();
    expect(ids).toEqual(['cmp-1001', 'cmp-1002', 'cmp-1003']);
  });

  test('is idempotent - repeated resets always return the same known state', async ({ request }) => {
    await request.post('/api/campaigns/cmp-1001/launch');
    await request.post('/api/campaigns', {
      data: {
        name: 'Temporary Extra Campaign',
        channel: 'Email',
        audienceSegment: 'all-users',
        sendMode: 'now',
        scheduledAt: '',
        message: 'This campaign should disappear after reset.',
      },
    });

    const beforeReset = await request.get('/api/campaigns');
    expect((await beforeReset.json()).data.length).toBeGreaterThan(3);

    const res = await request.post('/api/test-controls/reset', { data: {} });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.campaigns).toHaveLength(3);

    const afterReset = await request.get('/api/campaigns');
    const afterBody = await afterReset.json();
    expect(afterBody.data).toHaveLength(3);
    expect(afterBody.data.find((c) => c.id === 'cmp-1001').status).toBe('Draft');
  });

  test('launchFailures toggle causes the targeted campaign launch call to fail with 500', async ({ request }) => {
    const resetRes = await request.post('/api/test-controls/reset', {
      data: { launchFailures: { 'cmp-1001': 'provider_timeout' } },
    });
    expect(resetRes.status()).toBe(200);

    const launchRes = await request.post('/api/campaigns/cmp-1001/launch');
    expect(launchRes.status()).toBe(500);

    const launchBody = await launchRes.json();
    expect(launchBody.code).toBeTruthy();
    expect(launchBody.message).toBeTruthy();

    // Bonus check: observe what state the campaign is left in after a failed launch attempt.
    // Not asserting a specific value here on purpose - just logging it for the README.
    const campaignRes = await request.get('/api/campaigns/cmp-1001');
    const campaignBody = await campaignRes.json();
    console.log('Status after failed launch attempt:', campaignBody.status);
  });

  test('reset options are echoed back so tests can confirm active failure modes', async ({ request }) => {
    const res = await request.post('/api/test-controls/reset', {
      data: { audienceEstimateBug: true, pastScheduleBug: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.options).toMatchObject({
      audienceEstimateBug: true,
      pastScheduleBug: true,
    });
  });
});

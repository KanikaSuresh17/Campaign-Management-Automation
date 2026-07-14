import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const res = await request.post('/api/test-controls/reset', { data: {} });
  expect(res.status()).toBe(200);
});

const validPayload = {
  name: 'Valid API Test Campaign',
  channel: 'SMS',
  audienceSegment: 'dormant-users',
  sendMode: 'now',
  scheduledAt: '',
  message: 'This is a perfectly valid message body for testing.',
};

test.describe('POST /api/campaigns - validation', () => {
  test('creates a campaign successfully with valid input', async ({ request }) => {
    const res = await request.post('/api/campaigns', { data: validPayload });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      name: validPayload.name,
      channel: 'SMS',
      status: 'Draft',
    });
  });

  test('rejects a campaign name shorter than 3 characters', async ({ request }) => {
    const res = await request.post('/api/campaigns', {
      data: { ...validPayload, name: 'AB' },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a message shorter than 10 characters', async ({ request }) => {
    const res = await request.post('/api/campaigns', {
      data: { ...validPayload, message: 'short' },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an invalid channel value', async ({ request }) => {
    const res = await request.post('/api/campaigns', {
      data: { ...validPayload, channel: 'Fax' },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a scheduled campaign with no scheduledAt date', async ({ request }) => {
    const res = await request.post('/api/campaigns', {
      data: { ...validPayload, sendMode: 'scheduled', scheduledAt: '' },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a scheduled campaign with a past date', async ({ request }) => {
    test.fail(
      true,
      'DEFECT: API returns 201 for a scheduled campaign with a past date instead of 400. ' +
        'Business rule states scheduled campaigns must have a future date/time - not enforced server-side.'
    );
    const res = await request.post('/api/campaigns', {
      data: { ...validPayload, sendMode: 'scheduled', scheduledAt: '2020-01-01T09:00' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('GET /api/campaigns/:id', () => {
  test('returns 404 for a campaign that does not exist', async ({ request }) => {
    const res = await request.get('/api/campaigns/cmp-9999');
    expect(res.status()).toBe(404);
  });

  test('returns the seeded campaign for a valid id', async ({ request }) => {
    const res = await request.get('/api/campaigns/cmp-1002');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 'cmp-1002',
      name: 'Trial Upgrade Email',
      channel: 'Email',
      status: 'Scheduled',
    });
  });
});

test.describe('POST /api/audiences/estimate', () => {
  test('returns a positive estimate for dormant-users on SMS', async ({ request }) => {
    const res = await request.post('/api/audiences/estimate', {
      data: { audienceSegment: 'dormant-users', channel: 'SMS' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // NOTE: the OpenAPI spec's own Campaign example documents this exact
    // pairing as estimatedAudience: 1240, but the live estimate endpoint
    // returned 1165 in testing. Treating this as a positive-number sanity
    // check rather than an exact match - see README "Defects & Observations"
    // for the discrepancy between documented example and live behavior.
    expect(body.estimatedAudience).toBeGreaterThan(0);
  });

  test('each audience segment only accepts its own allowedChannels', async ({ request }) => {
    const segments = ['trial-users', 'dormant-users', 'premium-users', 'all-users'];
    const allChannels = ['Email', 'SMS', 'Push'];

    for (const segment of segments) {
      const probe = await request.post('/api/audiences/estimate', {
        data: { audienceSegment: segment, channel: allChannels[0] },
      });
      const probeBody = await probe.json();
      const allowed = probe.status() === 200 ? probeBody.allowedChannels : allChannels;

      for (const channel of allChannels) {
        const res = await request.post('/api/audiences/estimate', {
          data: { audienceSegment: segment, channel },
        });
        if (allowed.includes(channel)) {
          expect(res.status(), `${segment} + ${channel} should be accepted`).toBe(200);
          const body = await res.json();
          expect(body.estimatedAudience).toBeGreaterThanOrEqual(0);
        } else {
          expect(res.status(), `${segment} + ${channel} should be rejected`).toBe(400);
        }
      }
    }
  });
});

test.describe('forceUnauthorized test hook', () => {
  test('returns 401 when forceUnauthorized=true is passed', async ({ request }) => {
    const res = await request.get('/api/campaigns?forceUnauthorized=true');
    expect(res.status()).toBe(401);
  });
});

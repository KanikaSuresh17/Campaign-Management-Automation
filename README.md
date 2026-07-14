# Campaign Management — Automation Suite

Automated test suite for the Campaign Management application, built with **Playwright (JavaScript)** as part of the SDET internship take-home assignment.

- App under test: https://campaign-management-rose.vercel.app/
- API contract: `docs/api/openapi.yaml`

## Setup & Run Instructions

```bash
npm install
npx playwright install
npx playwright test
```

To run a single file:
```bash
npx playwright test tests/ui/createCampaign.spec.js
```

To view the last HTML report:
```bash
npx playwright show-report
```

**Note on parallelism:** This suite runs against a single shared live instance of the app (not an isolated per-test backend). `playwright.config.js` is intentionally set to `fullyParallel: false` and `workers: 1`, and `resetData.spec.js` additionally forces `test.describe.configure({ mode: 'serial' })`. Running with multiple workers against shared state caused real race conditions (one test's reset/create wiping another's in-flight mutation) — this is a test-infrastructure constraint of the environment, not an app defect.

**Note on cold starts:** The app is hosted on Vercel's free tier, which spins down when idle. The very first request in a session (or after a period of inactivity) can be noticeably slow or occasionally time out while the deployment cold-starts. If a test fails on a fresh run with a `net::ERR_TIMED_OUT` or a `toBeVisible()` timeout right after page load, re-running the suite usually passes cleanly once the deployment is warm — this was observed a couple of times during development and was not reproducible once the app was already warm. Worth a quick retry before assuming a real regression.

## Project Structure

```
campaign-management-automation/
├── docs/api/openapi.yaml
├── tests/
│   ├── ui/
│   │   ├── createCampaign.spec.js
│   │   ├── launchCampaign.spec.js
│   │   └── filterCampaign.spec.js
│   └── api/
│       ├── campaignApi.spec.js
│       └── resetData.spec.js
├── playwright.config.js
└── package.json
```

## Scenarios Covered (22 tests)

### `tests/ui/createCampaign.spec.js` (1 test)
- Creates a scheduled SMS campaign via the UI form, verifies it renders in the Active Campaigns list, and cross-checks the persisted record via a direct `GET /api/campaigns?search=...` call.

### `tests/ui/launchCampaign.spec.js` (2 tests)
- Launching a Draft campaign moves it out of the Draft state (status auto-progresses Draft → Queued → Sent within seconds — see Observations below).
- An already-Sent campaign cannot be relaunched (API returns 400 and the UI does not expose a Launch action for it).

### `tests/ui/filterCampaign.spec.js` (4 tests)
- Filter by status.
- Filter by channel.
- Combined status + channel filters.
- Clearing filters returns the full list.
- Each filter result is cross-checked against the equivalent `GET /api/campaigns` query.

### `tests/api/campaignApi.spec.js` (11 tests)
- `POST /api/campaigns` validation: name too short, message too short, invalid channel enum, missing required fields, missing/past `scheduledAt` for scheduled sends.
- `GET /api/campaigns/{id}`: 404 for a non-existent id, 200 with full campaign shape for a valid seeded id.
- `POST /api/audiences/estimate`: dynamic `allowedChannels` discovery per audience segment, correct estimate shape.
- `forceUnauthorized=true` query hook returns 401 with a structured error body.
- One test uses `test.fail()` to document a confirmed defect (see below) rather than letting it fail silently.

### `tests/api/resetData.spec.js` (4 tests, serial)
- Reset restores the exact seeded campaign set (3 campaigns, correct summary counts, correct ids).
- Reset is idempotent — repeated resets always return to the same known state, even after intervening creates/launches.
- `launchFailures` toggle: launching the targeted campaign returns `500` and the campaign ends up in `Failed` status.
- Reset options (`audienceEstimateBug`, `pastScheduleBug`) are echoed back in the response so tests can confirm which failure modes are active.

## Defects & Observations

| # | Type | Description | Expected | Actual |
|---|------|-------------|----------|--------|
| 1 | **Defect** | `POST /api/campaigns` with `sendMode: scheduled` and a past `scheduledAt` date | 400 validation error (business rule: "Scheduled campaigns must have a valid future date and time") | 201 Created — campaign accepted with a past schedule date |
| 2 | **Doc/behavior mismatch** | OpenAPI spec's own example for `dormant-users` + `SMS` shows `estimatedAudience: 1240` | Estimate matches documented example | Live API returns `1165` for the same segment/channel combination |
| 3 | Observation | Launching a Draft campaign | — | Status auto-progresses Draft → Queued → Sent within a few seconds. Not a bug, but timing-sensitive for any test asserting on intermediate `Queued` state — worth a short wait/poll rather than an instant assertion. |
| 4 | Observation | Launching a campaign under a simulated `launchFailures` provider timeout | — | The launch call itself returns `500`, and the campaign's persisted status correctly flips to `Failed`. Confirmed this is consistent (not a defect) — noting it here since it wasn't obvious from the OpenAPI doc alone. |
| 5 | Observation | `POST /api/test-controls/reset` called with an empty body (`{}`) after a prior test had set a `launchFailures` toggle on the same campaign | Reset returns campaigns to a clean baseline, clearing prior test-control toggles | The `launchFailures` map persists across an empty-body reset — a later launch of the previously-targeted campaign (`cmp-1001`) still fails, even in an unrelated test file. Discovered when running the full suite together (not visible when running files individually). Suite was hardened so `launchCampaign.spec.js`'s `beforeEach` always explicitly passes `launchFailures: {}` rather than relying on default reset behavior to clear it. |

Defect #1 is captured in `campaignApi.spec.js` using `test.fail()`, so it shows as a tracked, expected failure rather than a red/broken test — a fix to the app would need this test flipped back to a normal assertion.

Defect/observation #5 is a good example of why the full suite should always be run together before submission, not just file-by-file — it surfaced a real cross-file state leak that individual file runs masked.

## Assumptions

- Treated the three seeded campaigns (`cmp-1001`, `cmp-1002`, `cmp-1003`) as the canonical reset baseline and asserted against their exact ids/statuses rather than just counts, for stronger regression protection.
- Where the UI didn't expose a clear disabled state for non-launchable campaigns (Sent/Queued/Failed), verified the business rule at the API layer (400 response) and checked no Launch control is rendered in the UI, rather than asserting on a specific disabled-button styling.
- No authentication/login flow exists in the current app, so no auth setup/teardown was needed; the `forceUnauthorized` query param is treated as a test-only hook rather than real auth.
- Ran only against `chromium` given the time constraint; the config supports adding `firefox`/`webkit` projects back in for broader cross-browser coverage.

## What I'd Add Next

- Cross-browser runs (Firefox, WebKit) once time allows — trivial to re-enable in `playwright.config.js`.
- A lightweight API client/helper module (`tests/utils/apiClient.js`) to remove repeated `request.post('/api/test-controls/reset', ...)` boilerplate across files.
- Data-driven validation tests (e.g. a table of invalid `CreateCampaignRequest` payloads run through one parameterized test) to make it trivial to add new business-rule cases.
- Visual/network-level assertions using Playwright's `page.waitForResponse()` to tie UI actions directly to their underlying API calls in the same test, rather than only cross-checking via a separate `request.get()` call afterward.
- CI pipeline (GitHub Actions) running the suite on every push, with the HTML report published as an artifact.

## Forward-Looking Test Strategy: Multi-Tenant Onboarding (Owner/Admin/Member)

If the next release adds team signup and invite-based multi-tenant onboarding, here's how I'd prioritize and divide coverage:

**What I'd automate first (highest risk, highest business impact):**
1. **Owner signup → team creation** — the entry point every other flow depends on; if broken, nothing downstream can be tested.
2. **Invite → accept flow** for each role (Owner invites Admin, Admin invites Member) — this is the core new mechanic and most likely to have edge cases (expired invites, duplicate invites, wrong email accepting an invite).
3. **Role-based access control** — verifying an Admin cannot perform Owner-only actions (e.g. deleting the team, transferring ownership) and a Member cannot perform Admin actions (e.g. inviting new users). This is a security-relevant boundary, so it gets priority.
4. **Tenant data isolation** — confirming a user in Team A can never see or act on Team B's campaigns via either the UI or direct API calls with a different tenant's resource ids.

**How I'd divide it across test levels:**
- **Lower-level/unit tests** (owned by devs, but I'd specify the cases): permission-matrix logic itself — e.g. a pure function that says "can role X perform action Y" — is cheap and fast to test exhaustively at this level rather than through the UI. Token/session expiry logic for invites also belongs here.
- **API tests**: role enforcement on every protected endpoint (expect 403 for out-of-role actions), tenant isolation (cross-tenant id access attempts), invite lifecycle (create/accept/expire/revoke), and validation on signup/invite payloads — these are fast, stable, and don't need a browser to prove the contract holds.
- **UI tests**: a small number of true end-to-end journeys per role — e.g. "Owner signs up, creates team, invites an Admin, Admin accepts and logs in, Admin invites a Member" — plus visual confirmation that role-inappropriate actions are actually hidden/disabled in the UI, not just blocked server-side. I'd keep this set small since it's the slowest and most brittle layer; the bulk of role/permission coverage belongs in API tests.

This mirrors the same principle used in this submission: push as much validation as possible into fast, stable API-level tests, and reserve UI tests for the handful of scenarios that must be proven end-to-end from a real user's perspective.
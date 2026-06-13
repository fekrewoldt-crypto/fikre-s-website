// Regression test for the production Google-sign-in (and email login) hang
// that hit real users on 2026-06-13.
//
// Commit 6bbb040 fixed the production CORS 500 by adding the Vercel-injected
// URLs to a new `effectiveOrigins` set used by the CORS middleware — but it
// left the CSRF middleware checking the un-augmented `allowedOrigins` array.
// With ALLOWED_ORIGINS unset on Vercel, `allowedOrigins` is localhost-only, so
// every state-changing /auth POST carrying Origin: https://<vercel-url> was
// rejected with 403 "Forbidden: Invalid origin". CORS passed, CSRF blocked —
// Google sign-in (and email/password login) could never complete on prod.
//
// The whole OAuth/auth suite missed this because csrfProtection is skipped
// entirely under NODE_ENV=test (Server-v2.js). These tests flip NODE_ENV to
// 'production' per-request so the real CSRF origin check runs, exactly like
// auth-oauth-production.test.js does for the oauth-session handler.

const request = require('supertest');

describe('CSRF origin check — production Origin must not 403 (sign-in unblock)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  // Build a fresh app. The Supabase singleton + origin arrays are read at
  // module load, so env must be set BEFORE this runs. NODE_ENV is 'test' here
  // (from setup.js / ORIGINAL_ENV) so the Supabase mock loads; individual
  // requests flip NODE_ENV='production' to activate csrfProtection.
  function fresh() {
    jest.resetModules();
    const { createApp } = require('../Server-v2.js');
    return createApp();
  }

  // Run a single request with NODE_ENV forced to production so the real CSRF
  // check (which is skipped under 'test') executes, then restore.
  async function inProduction(fn) {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      return await fn();
    } finally {
      process.env.NODE_ENV = prev;
    }
  }

  test('oauth-session POST with the Vercel prod Origin is NOT 403 when only VERCEL_PROJECT_PRODUCTION_URL is set', async () => {
    // This is the exact production scenario: ALLOWED_ORIGINS unset, Vercel
    // injects the stable production URL. Before the fix this returned 403.
    delete process.env.ALLOWED_ORIGINS;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'fikre-s-website.vercel.app';
    process.env.RATE_LIMIT_MAX = '1000';
    const app = fresh();

    const res = await inProduction(() =>
      request(app)
        .post('/auth/oauth-session')
        .set('Origin', 'https://fikre-s-website.vercel.app')
        .send({ access_token: 'real-access-token', refresh_token: 'real-refresh' })
    );

    expect(res.status).not.toBe(403);
    expect(res.body.error).not.toBe('Forbidden: Invalid origin');
    // The mock Supabase verifies the token, so the handler runs through to 200.
    expect(res.status).toBe(200);
    expect(res.body.token).toBe('real-access-token');
  });

  test('oauth-session POST with the prod Origin is NOT 403 when ALLOWED_ORIGINS lists it explicitly', async () => {
    process.env.ALLOWED_ORIGINS = 'https://fikre-s-website.vercel.app,http://localhost:3000';
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.RATE_LIMIT_MAX = '1000';
    const app = fresh();

    const res = await inProduction(() =>
      request(app)
        .post('/auth/oauth-session')
        .set('Origin', 'https://fikre-s-website.vercel.app')
        .send({ access_token: 'real-access-token', refresh_token: 'real-refresh' })
    );

    expect(res.status).not.toBe(403);
    expect(res.body.error).not.toBe('Forbidden: Invalid origin');
  });

  test('email/password login POST with the prod Origin is NOT 403 (same root cause, wider blast radius)', async () => {
    delete process.env.ALLOWED_ORIGINS;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'fikre-s-website.vercel.app';
    process.env.RATE_LIMIT_MAX = '1000';
    process.env.LOGIN_RATE_LIMIT_MAX = '1000';
    const app = fresh();

    const res = await inProduction(() =>
      request(app)
        .post('/auth/login')
        .set('Origin', 'https://fikre-s-website.vercel.app')
        .send({ email: 'someone@example.com', password: 'whatever' })
    );

    // We only assert the CSRF layer did not block it — downstream auth result
    // (200/400/401) is irrelevant to this regression.
    expect(res.status).not.toBe(403);
    expect(res.body.error).not.toBe('Forbidden: Invalid origin');
  });

  test('a genuinely unknown origin is STILL rejected (never reaches the handler)', async () => {
    process.env.ALLOWED_ORIGINS = 'https://fikre-s-website.vercel.app';
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_BRANCH_URL;
    process.env.RATE_LIMIT_MAX = '1000';
    const app = fresh();

    const res = await inProduction(() =>
      request(app)
        .post('/auth/oauth-session')
        .set('Origin', 'https://evil.example.com')
        .send({ access_token: 'real-access-token' })
    );

    // An unknown origin is blocked. CORS runs BEFORE CSRF and throws
    // 'Not allowed by CORS' → 500 from the global error handler (see
    // cors-origin.test.js), so the request is rejected one layer earlier
    // than CSRF. Either way it must NOT succeed and must NOT return a token.
    expect([403, 500]).toContain(res.status);
    expect(res.body.token).toBeUndefined();
  });

  test('a request with no Origin header (curl / server-to-server) passes CSRF', async () => {
    delete process.env.ALLOWED_ORIGINS;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'fikre-s-website.vercel.app';
    process.env.RATE_LIMIT_MAX = '1000';
    const app = fresh();

    const res = await inProduction(() =>
      request(app)
        .post('/auth/oauth-session')
        .send({ access_token: 'real-access-token', refresh_token: 'real-refresh' })
    );

    expect(res.status).not.toBe(403);
    expect(res.body.error).not.toBe('Forbidden: Invalid origin');
  });
});

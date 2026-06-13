// Regression test for the "Google sign-in loads forever" bug traced on
// 2026-06-13 (second root cause, after the CSRF fix in 3600b55).
//
// The two OAuth COMPLETION routes shared the global 20-req/min apiLimiter
// bucket with every other /auth call. A user retrying sign-in a few times
// (each attempt = /auth/google + /auth/oauth-callback + /auth/oauth-session)
// blew the budget, after which GET /auth/oauth-callback returned plain-text
// "Too many requests" INSTEAD of the spinner bridge HTML — no JS ran, the
// #access_token sat unused in the URL, and the page hung forever.
//
// Fix: apiLimiter.skip() now exempts /auth/oauth-callback and
// /auth/oauth-session (they run AFTER Google has authenticated the user, so
// they are not an abuse surface). /auth/google and /auth/login stay limited.

const request = require('supertest');

describe('OAuth completion routes are exempt from the rate limiter', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function freshAppWithMax(max) {
    jest.resetModules();
    process.env.RATE_LIMIT_MAX = String(max);
    const { createApp } = require('../Server-v2.js');
    return createApp();
  }

  test('GET /auth/oauth-callback is NEVER rate-limited even far past the cap', async () => {
    const app = freshAppWithMax(5);
    const statuses = [];
    for (let i = 0; i < 15; i++) {
      const res = await request(app).get('/auth/oauth-callback');
      statuses.push(res.status);
    }
    // Every call serves the bridge HTML; none should be 429.
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(statuses).not.toContain(429);
  });

  test('POST /auth/oauth-session is NEVER rate-limited even far past the cap', async () => {
    const app = freshAppWithMax(5);
    const statuses = [];
    for (let i = 0; i < 15; i++) {
      const res = await request(app)
        .post('/auth/oauth-session')
        .send({}); // no token -> 400, but must never be 429
      statuses.push(res.status);
    }
    expect(statuses).not.toContain(429);
    // Missing access_token yields a 400 from the handler, proving the request
    // reached the route rather than being throttled by the limiter.
    expect(statuses.every((s) => s === 400)).toBe(true);
  });

  test('control: /auth/login IS still rate-limited (limiter is active)', async () => {
    const app = freshAppWithMax(5);
    let saw429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'x@example.com', password: 'wrong' });
      if (res.status === 429) { saw429 = true; break; }
    }
    expect(saw429).toBe(true);
  });

  test('control: hammering the exempt callback does NOT consume the shared budget', async () => {
    const app = freshAppWithMax(5);
    // 20 callback hits (way over the cap) must not deplete the bucket...
    for (let i = 0; i < 20; i++) {
      await request(app).get('/auth/oauth-callback');
    }
    // ...so a subsequent /auth/login still gets its full allowance before 429.
    const first = await request(app)
      .post('/auth/login')
      .send({ email: 'x@example.com', password: 'wrong' });
    expect(first.status).not.toBe(429);
  });
});

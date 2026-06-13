// Regression test for the production CORS 500 that hit real users on 2026-06-13.
// Before the fix, browser requests carrying Origin: https://fikre-s-website.vercel.app
// were rejected by the CORS middleware (allowlist defaulted to localhost), the
// rejection threw Error('Not allowed by CORS'), and the wave-3 global error handler
// returned {error:'Internal server error', requestId} — so every API call from
// the deployed site 500ed silently. supertest sends no Origin by default, so the
// existing 22 suites never caught it.

const request = require('supertest');

describe('CORS allowlist — production Origin must not 500', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function fresh() {
    jest.resetModules();
    const { createApp } = require('../Server-v2.js');
    return createApp();
  }

  test('explicit ALLOWED_ORIGINS containing the prod URL allows requests with that Origin', async () => {
    process.env.ALLOWED_ORIGINS = 'https://example-app.vercel.app,http://localhost:3000';
    const app = fresh();
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://example-app.vercel.app');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('missing ALLOWED_ORIGINS still allows the Vercel-injected URL via VERCEL_URL fallback', async () => {
    delete process.env.ALLOWED_ORIGINS;
    process.env.VERCEL_URL = 'example-app.vercel.app';
    const app = fresh();
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://example-app.vercel.app');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  test('missing ALLOWED_ORIGINS still allows VERCEL_PROJECT_PRODUCTION_URL', async () => {
    delete process.env.ALLOWED_ORIGINS;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'fikre-s-website.vercel.app';
    const app = fresh();
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://fikre-s-website.vercel.app');
    expect(res.status).toBe(200);
  });

  test('truly unknown origin is still rejected', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example.com';
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_BRANCH_URL;
    const app = fresh();
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    // localhost-escape only fires on origins containing 'localhost:' so evil.example.com is rejected
    expect(res.status).toBe(500);
  });

  test('no Origin header (curl, server-to-server) is always allowed', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example.com';
    const app = fresh();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

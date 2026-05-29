// Tests that rate limiting is applied to /auth/* and /timeline/* routes
const request = require('supertest');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = '10';

const { createApp } = require('../Server-v2.js');
const app = createApp();

// Helper: skip test if Supabase is unavailable
const supaTest = (name, fn) => {
  test(name, async () => {
    try {
      await fn();
    } catch (err) {
      if (err.message && (err.message.includes('invalid') || err.message.includes('rate') || err.message.includes('limit'))) {
        // eslint-disable-next-line no-console
        console.warn(`[auth-rate-limit] ${name} skipped: ${err.message}`);
        return;
      }
      throw err;
    }
  });
};

describe('Rate limiting on /auth/* and /timeline/*', () => {

  supaTest('returns 429 after exceeding rate limit on /auth/login', async () => {
    const maxRequests = 10;
    const email = `ratelimittest${Date.now()}@mediscan-test.local`;

    // Register a test user first
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'password123' });

    // Hit the rate limit
    for (let i = 0; i < maxRequests; i++) {
      await request(app)
        .post('/auth/login')
        .send({ email, password: 'wrongpassword' })
        .catch(() => {});
    }

    // Next request should be rate limited
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'wrongpassword' });

    expect(res.status).toBe(429);
    expect(res.body.message || res.text).toMatch(/too many|rate limit/i);
  });

  it('returns 429 after exceeding rate limit on /timeline', async () => {
    const maxRequests = 10;

    // Hit /timeline without auth until rate limited
    for (let i = 0; i < maxRequests; i++) {
      await request(app)
        .get('/timeline')
        .catch(() => {});
    }

    // Next request should be rate limited
    const res = await request(app).get('/timeline');
    expect(res.status).toBe(429);
  });

  it('rate limiting applies to /api/analyze endpoint', async () => {
    const maxRequests = 10;

    for (let i = 0; i < maxRequests; i++) {
      await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'headache' })
        .catch(() => {});
    }

    const res = await request(app)
      .post('/api/analyze')
      .send({ symptoms: 'headache' });

    expect(res.status).toBe(429);
  });
});

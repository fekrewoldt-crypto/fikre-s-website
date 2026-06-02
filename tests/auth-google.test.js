// Tests for the Google OAuth endpoints.
// Covers GET /auth/google (returns Supabase URL), GET /auth/oauth-callback
// (serves the JS bridge page), and POST /auth/oauth-session
// (validates token, sets HttpOnly cookie, returns access token).
const request = require('supertest');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.env.DATA_ENC_KEY = process.env.DATA_ENC_KEY || 'a'.repeat(64);
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = '1000';

const { createApp } = require('../Server-v2.js');
const app = createApp();

describe('Google OAuth endpoints', () => {
  describe('GET /auth/google', () => {
    it('returns a Supabase OAuth URL', async () => {
      const res = await request(app).get('/auth/google');
      expect(res.status).toBe(200);
      expect(res.body.url).toBeDefined();
      expect(typeof res.body.url).toBe('string');
      expect(res.body.url).toMatch(/oauth-callback/);
    });

    it('in test mode the URL points to local /auth/oauth-callback', async () => {
      const res = await request(app).get('/auth/google');
      expect(res.status).toBe(200);
      // Test-mode URL includes access_token and refresh_token in the hash
      expect(res.body.url).toContain('access_token=test-google-token');
      expect(res.body.url).toContain('provider=google');
    });
  });

  describe('GET /auth/oauth-callback', () => {
    it('serves an HTML bridge page that posts the session', async () => {
      const res = await request(app).get('/auth/oauth-callback');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('/auth/oauth-session');
      expect(res.text).toContain('access_token');
    });
  });

  describe('POST /auth/oauth-session', () => {
    it('returns 400 when access_token is missing', async () => {
      const res = await request(app)
        .post('/auth/oauth-session')
        .send({ refresh_token: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/access token/i);
    });

    it('returns 401 when test token is invalid', async () => {
      const res = await request(app)
        .post('/auth/oauth-session')
        .send({ access_token: 'not-a-test-token' });
      expect(res.status).toBe(401);
    });

    it('accepts a valid test token and sets the refresh cookie', async () => {
      const res = await request(app)
        .post('/auth/oauth-session')
        .send({ access_token: 'test-google-token-abc', refresh_token: 'test-google-refresh-abc' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBe('test-google-token-abc');
      expect(res.body.email).toBeDefined();
      // HttpOnly cookie should be set
      const setCookie = res.headers['set-cookie'] || [];
      const refresh = setCookie.find(c => c.startsWith('refreshToken='));
      expect(refresh).toBeDefined();
      expect(refresh).toMatch(/HttpOnly/i);
      expect(refresh).toMatch(/SameSite=Lax/i);
    });
  });

  describe('Auth modal markup includes Google button', () => {
    // Frontend test: ensure the Google button is in the served HTML.
    it('serves IIndex.html with the Google sign-in button', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('auth-google-btn');
      expect(res.text).toContain('signInWithGoogle');
      expect(res.text).toContain('auth_google_signin');
    });
  });
});

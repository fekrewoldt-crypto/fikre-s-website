// Tests for P2 hygiene fixes (2026-06-13):
//   1. /auth/oauth-callback inline JS handles ?error=access_denied (user cancel)
//   2. /auth/logout clearCookie passes matching options (iOS Safari fix)
//   3. /auth/oauth-session returns sessionPersistent flag when refresh_token absent
const request = require('supertest');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.env.DATA_ENC_KEY = process.env.DATA_ENC_KEY || 'a'.repeat(64);
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = '1000';

const { createApp } = require('../Server-v2.js');
const app = createApp();

describe('Auth cookie + cancel hygiene fixes', () => {
  describe('Fix 1: OAuth callback page handles user cancellation', () => {
    it('inline JS checks ?error=access_denied before the hash', async () => {
      const res = await request(app).get('/auth/oauth-callback');
      expect(res.status).toBe(200);
      expect(res.text).toContain("'access_denied'");
      expect(res.text).toContain('google_login=cancelled');
    });

    it('cancellation branch sits before the access_token hash check', async () => {
      const res = await request(app).get('/auth/oauth-callback');
      const cancelIdx = res.text.indexOf("'access_denied'");
      const hashIdx = res.text.indexOf("params.get('access_token')");
      expect(cancelIdx).toBeGreaterThan(-1);
      expect(hashIdx).toBeGreaterThan(-1);
      expect(cancelIdx).toBeLessThan(hashIdx);
    });
  });

  describe('Fix 2: /auth/logout clearCookie passes matching options', () => {
    it('Set-Cookie includes Path=/ and HttpOnly so iOS Safari clears it', async () => {
      const res = await request(app).post('/auth/logout');
      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'] || [];
      const clear = setCookie.find(c => c.startsWith('refreshToken='));
      expect(clear).toBeDefined();
      expect(clear).toMatch(/Path=\//);
      expect(clear).toMatch(/HttpOnly/i);
      expect(clear).toMatch(/SameSite=Lax/i);
    });

    it('Set-Cookie carries an expiry in the past (this is what makes it a clear)', async () => {
      const res = await request(app).post('/auth/logout');
      const setCookie = res.headers['set-cookie'] || [];
      const clear = setCookie.find(c => c.startsWith('refreshToken='));
      expect(clear).toBeDefined();
      // Express clearCookie sets Expires to epoch (Thu, 01 Jan 1970)
      expect(clear).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('Fix 3: /auth/oauth-session flags non-persistent sessions', () => {
    it('returns sessionPersistent:false when refresh_token is missing', async () => {
      const res = await request(app)
        .post('/auth/oauth-session')
        .send({ access_token: 'test-google-token-no-refresh' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBe('test-google-token-no-refresh');
      expect(res.body.sessionPersistent).toBe(false);
      // No refresh cookie should be set when refresh_token is absent
      const setCookie = res.headers['set-cookie'] || [];
      const refresh = setCookie.find(c => c.startsWith('refreshToken='));
      expect(refresh).toBeUndefined();
    });

    it('returns sessionPersistent:true when refresh_token is present', async () => {
      const res = await request(app)
        .post('/auth/oauth-session')
        .send({ access_token: 'test-google-token-x', refresh_token: 'test-google-refresh-x' });
      expect(res.status).toBe(200);
      expect(res.body.sessionPersistent).toBe(true);
      const setCookie = res.headers['set-cookie'] || [];
      const refresh = setCookie.find(c => c.startsWith('refreshToken='));
      expect(refresh).toBeDefined();
      expect(refresh).toMatch(/HttpOnly/i);
    });
  });
});

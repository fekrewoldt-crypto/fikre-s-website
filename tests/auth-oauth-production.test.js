// Tests for the production (non-test-mode) code paths of the Google OAuth
// endpoints. Both regressions below were hidden by the NODE_ENV=test
// shortcuts at /auth/oauth-session and /auth/google.
//
// Bug A: ReferenceError thrown by `const user = data.user;` referencing an
//        undeclared `data` outside the try block.
// Bug B: Missing SUPABASE_ANON_KEY silently fell back to the service-role
//        key, which Supabase rejects for signInWithOAuth → 500.

const request = require('supertest');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

process.env.DATA_ENC_KEY = process.env.DATA_ENC_KEY || 'a'.repeat(64);
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX = '1000';

const { createApp } = require('../Server-v2.js');
const app = createApp();

describe('OAuth production path regressions', () => {
  describe('POST /auth/oauth-session (Bug A)', () => {
    let originalEnv;

    beforeAll(() => {
      originalEnv = process.env.NODE_ENV;
    });

    afterAll(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('does not throw ReferenceError on the production code path', async () => {
      // Flip NODE_ENV so the test-mode early-return at the top of the
      // handler is bypassed and the real verify path runs. The supabase
      // client exported by db/supabase.js was created at NODE_ENV=test, so
      // it's already a mock whose auth.getUser resolves to a valid user.
      process.env.NODE_ENV = 'production';
      try {
        const res = await request(app)
          .post('/auth/oauth-session')
          .send({ access_token: 'real-access-token', refresh_token: 'real-refresh' });

        // Before the fix this returned 500 with "data is not defined".
        // The mock supabase.auth.getUser resolves with a user object, so
        // the production path should now run cleanly to 200.
        expect(res.status).toBe(200);
        expect(res.body.token).toBe('real-access-token');
        if (res.body.error) {
          expect(res.body.error).not.toMatch(/ReferenceError|data is not defined/i);
        }
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    it('still returns 400 when access_token is missing on the production path', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const res = await request(app)
          .post('/auth/oauth-session')
          .send({ refresh_token: 'x' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/access token/i);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });
  });

  describe('GET /auth/google (Bug B)', () => {
    let originalEnv;
    let originalAnon;

    beforeAll(() => {
      originalEnv = process.env.NODE_ENV;
      originalAnon = process.env.SUPABASE_ANON_KEY;
    });

    afterAll(() => {
      process.env.NODE_ENV = originalEnv;
      if (originalAnon === undefined) {
        delete process.env.SUPABASE_ANON_KEY;
      } else {
        process.env.SUPABASE_ANON_KEY = originalAnon;
      }
    });

    it('returns 500 with a clear error code when SUPABASE_ANON_KEY is missing', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_ANON_KEY = '';
      try {
        const res = await request(app).get('/auth/google');
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('MISSING_SUPABASE_ANON_KEY');
        expect(res.body.error).toMatch(/temporarily unavailable|email\/password/i);
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });

    it('returns 500 with the same code when SUPABASE_ANON_KEY is unset (undefined)', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_ANON_KEY;
      try {
        const res = await request(app).get('/auth/google');
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('MISSING_SUPABASE_ANON_KEY');
      } finally {
        process.env.NODE_ENV = 'test';
      }
    });
  });
});

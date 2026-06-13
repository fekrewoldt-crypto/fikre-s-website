// Tests for /auth/login error-branching: unverified email vs bad password vs other.
// We bypass the route's NODE_ENV==='test' shortcut by flipping NODE_ENV during
// each request, while keeping the supabase module mocked via jest.mock so we
// never hit the real network.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-mediscan-auth-tests-only-do-not-use-in-prod';
process.env.DATA_ENC_KEY = 'a'.repeat(64);
process.env.RATE_LIMIT_WINDOW = '1';
process.env.RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key-placeholder';

const request = require('supertest');

const mockSignInWithPassword = jest.fn();

jest.mock('../db/supabase', () => ({
  auth: {
    signInWithPassword: (...args) => mockSignInWithPassword(...args),
  },
  from: () => ({
    select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
  }),
}));

jest.mock('../db/audit-supabase', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

const { createApp } = require('../Server-v2.js');

describe('POST /auth/login error branching', () => {
  let app;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    // Flip NODE_ENV away from 'test' so the in-route shortcut is skipped and
    // the real supabase.auth.signInWithPassword (our mock) is invoked.
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('returns 403 + EMAIL_NOT_VERIFIED when Supabase reports unconfirmed email', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Email not confirmed' },
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'unverified@example.com', password: 'Test@1234' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.error).toMatch(/verify/i);
  });

  it('returns 401 + "Invalid email or password" on bad credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wrongpass@example.com', password: 'Test@1234' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
    expect(res.body.code).toBeUndefined();
  });

  it('returns 500 + generic message for other Supabase errors', async () => {
    const origErr = console.error;
    console.error = jest.fn();
    mockSignInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Network something else' },
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'someone@example.com', password: 'Test@1234' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/temporarily unavailable/i);
    expect(console.error).toHaveBeenCalled();
    console.error = origErr;
  });
});

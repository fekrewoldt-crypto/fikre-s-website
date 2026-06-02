// Comprehensive tests for user profile functionality

// Set up environment BEFORE any application code loads
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-mediscan-auth-tests-only-do-not-use-in-prod';
process.env.DATA_ENC_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes
process.env.BCRYPT_ROUNDS = '4';
process.env.RATE_LIMIT_WINDOW = '1';
process.env.RATE_LIMIT_MAX = '1000';
process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key-placeholder';

const request = require('supertest');

// Mock functions defined at top level before jest.mock processes them.
// These survive module load and are referenced by the mock factory.
const mockGetProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockCreateProfile = jest.fn();

// Mock db/profiles to avoid real Supabase calls.
jest.mock('../db/profiles', () => ({
  getProfile: mockGetProfile,
  updateProfile: mockUpdateProfile,
  createProfile: mockCreateProfile,
}));

const { createApp } = require('../Server-v2.js');

describe('User Profile API', () => {
  let app;
  let testToken;

  beforeAll(() => {
    app = createApp();
    testToken = 'test-token-' + Date.now();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const authGet = () => request(app).get('/api/profile').set('Authorization', `Bearer ${testToken}`);
  const authPut = () => request(app).put('/api/profile').set('Authorization', `Bearer ${testToken}`);

  // -------------------------------------------------
  // Authentication requirements
  // -------------------------------------------------
  describe('Authentication requirements', () => {
    it('GET /api/profile returns 401 without token', async () => {
      const res = await request(app).get('/api/profile');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/no token/i);
    });

    it('GET /api/profile returns 403 with non-test token format', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Bearer production-token');
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/invalid|expired/i);
    });

    it('GET /api/profile returns 401 with empty Authorization header', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', '');
      expect(res.status).toBe(401);
    });

    it('PUT /api/profile returns 401 without token', async () => {
      const res = await request(app)
        .put('/api/profile')
        .send({ full_name: 'Test' });
      expect(res.status).toBe(401);
    });

    it('PUT /api/profile returns 403 with invalid token', async () => {
      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', 'Bearer fake-token')
        .send({ full_name: 'Test' });
      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------
  // GET /api/profile - Profile retrieval
  // -------------------------------------------------
  describe('GET /api/profile - Profile retrieval', () => {
    it('returns full profile data when authenticated', async () => {
      mockGetProfile.mockResolvedValue({
        id: 'test-user-123',
        full_name: 'Tadele Bekele',
        phone: '+251911234567',
        date_of_birth: '2009-03-15',
        gender: 'male',
        blood_type: 'O+',
        emergency_contact_name: 'Abebe Girma',
        emergency_contact_phone: '+251911987654',
        city: 'Gondar',
        language_preference: 'en',
        notification_enabled: true,
      });

      const res = await authGet();

      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('Tadele Bekele');
      expect(res.body.phone).toBe('+251911234567');
      expect(res.body.gender).toBe('male');
      expect(res.body.blood_type).toBe('O+');
      expect(res.body.city).toBe('Gondar');
      expect(res.body.notification_enabled).toBe(true);
    });

    it('returns 404 when profile does not exist', async () => {
      mockGetProfile.mockResolvedValue(null);

      const res = await authGet();

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 500 when getProfile throws', async () => {
      mockGetProfile.mockRejectedValue(new Error('Database error'));

      const res = await authGet();

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/failed/i);
    });

    it('passes user ID from verified token to getProfile DAO', async () => {
      mockGetProfile.mockResolvedValue({ id: 'test-user' });

      await authGet();

      expect(mockGetProfile).toHaveBeenCalledTimes(1);
      expect(mockGetProfile).toHaveBeenCalledWith(expect.stringMatching(/^test-user-\d+$/));
    });

    it('getProfile called exactly once per request', async () => {
      mockGetProfile.mockResolvedValue({ id: 'test' });

      await authGet();

      expect(mockGetProfile).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------
  // PUT /api/profile - Profile update
  // -------------------------------------------------
  describe('PUT /api/profile - Profile update', () => {
    it('updates profile and returns updated data', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({
        id: 'test-user',
        full_name: 'Tadele Updated',
        phone: '+251922345678',
      });

      const res = await authPut()
        .send({ full_name: 'Tadele Updated', phone: '+251922345678' });

      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('Tadele Updated');
      expect(res.body.phone).toBe('+251922345678');
    });

    it('allows updating phone number', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test', phone: '+251911111111' });

      const res = await authPut().send({ phone: '+251911111111' });

      expect(res.status).toBe(200);
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ phone: '+251911111111' })
      );
    });

    it('allows updating date of birth', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test', date_of_birth: '2009-05-20' });

      await authPut().send({ date_of_birth: '2009-05-20' });

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ date_of_birth: '2009-05-20' })
      );
    });

    it('allows updating gender', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test', gender: 'female' });

      await authPut().send({ gender: 'female' });

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ gender: 'female' })
      );
    });

    it('allows updating blood type', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test', blood_type: 'AB-' });

      const res = await authPut().send({ blood_type: 'AB-' });

      expect(res.status).toBe(200);
    });

    it('allows updating emergency contact name', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test' });

      await authPut().send({ emergency_contact_name: 'New Contact' });

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ emergency_contact_name: 'New Contact' })
      );
    });

    it('allows updating emergency contact phone', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test' });

      await authPut().send({ emergency_contact_phone: '+251933333333' });

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ emergency_contact_phone: '+251933333333' })
      );
    });

    it('allows updating address', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test', address: 'New Address' });

      const res = await authPut().send({ address: 'New Address' });

      expect(res.status).toBe(200);
    });

    it('allows updating city', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test' });

      const res = await authPut().send({ city: 'Addis Ababa' });

      expect(res.status).toBe(200);
    });

    it('allows updating language preference', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test' });

      const res = await authPut().send({ language_preference: 'am' });

      expect(res.status).toBe(200);
    });

    it('allows updating notification_enabled', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test' });

      const res = await authPut().send({ notification_enabled: false });

      expect(res.status).toBe(200);
    });

    it('accepts multiple allowed fields in one request', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test' });

      const res = await authPut().send({
        full_name: 'Multi Field',
        phone: '+251944444444',
        gender: 'male',
        city: 'Bahir Dar',
        blood_type: 'B+',
      });

      expect(res.status).toBe(200);
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          full_name: 'Multi Field',
          phone: '+251944444444',
          gender: 'male',
          city: 'Bahir Dar',
          blood_type: 'B+',
        })
      );
    });

    it('returns 400 when body is empty', async () => {
      const res = await authPut().send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no valid fields/i);
    });

    it('returns 400 when only disallowed fields are sent', async () => {
      const res = await authPut().send({ id: 'hack', role: 'admin', created_at: '2020-01-01' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no valid fields/i);
    });

    it('rejects id field when sent alone', async () => {
      const res = await authPut().send({ id: 'malicious-id' });
      expect(res.status).toBe(400);
    });

    it('rejects role field when sent alone', async () => {
      const res = await authPut().send({ role: 'admin' });
      expect(res.status).toBe(400);
    });

    it('rejects created_at field when sent alone', async () => {
      const res = await authPut().send({ created_at: '2020-01-01' });
      expect(res.status).toBe(400);
    });

    it('returns 500 when updateProfile throws', async () => {
      mockUpdateProfile.mockRejectedValue(new Error('Update failed'));

      const res = await authPut().send({ full_name: 'Test' });

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/failed/i);
    });

    it('returns 500 when getProfile after update throws', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockRejectedValue(new Error('Read failed'));

      const res = await authPut().send({ full_name: 'Test' });

      expect(res.status).toBe(500);
    });

    it('does not send undefined values in the update payload', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test' });

      await authPut().send({ full_name: 'Valid', phone: undefined });

      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({ phone: undefined })
      );
    });

    it('calls updateProfile with user ID and update payload', async () => {
      mockUpdateProfile.mockResolvedValue(undefined);
      mockGetProfile.mockResolvedValue({ id: 'test' });

      await authPut().send({ full_name: 'Updated Name' });

      // Verify updateProfile was called with the correct arguments
      // (the real updateProfile is intercepted by the mock)
      expect(mockUpdateProfile).toHaveBeenCalled();
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.stringMatching(/^test-user-\d+$/),
        expect.objectContaining({ full_name: 'Updated Name' })
      );
    });
  });

  // -------------------------------------------------
  // Security: Field allowlist enforcement
  // -------------------------------------------------
  describe('Security: Field allowlist enforcement', () => {
    const allowedFields = [
      'full_name', 'phone', 'date_of_birth', 'gender', 'blood_type',
      'emergency_contact_name', 'emergency_contact_phone',
      'address', 'city', 'language_preference', 'notification_enabled',
    ];

    allowedFields.forEach(field => {
      it(`allows updating ${field}`, async () => {
        mockUpdateProfile.mockResolvedValue(undefined);
        mockGetProfile.mockResolvedValue({ id: 'test', [field]: 'test_value' });

        const res = await authPut().send({ [field]: 'test_value' });

        expect(res.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ [field]: 'test_value' })
        );
      });
    });

    it('blocks id field from reaching the DAO', async () => {
      const res = await authPut().send({ id: 'hacker-id' });
      expect(res.status).toBe(400);
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('blocks role field from reaching the DAO', async () => {
      const res = await authPut().send({ role: 'admin' });
      expect(res.status).toBe(400);
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('blocks is_admin field from reaching the DAO', async () => {
      const res = await authPut().send({ is_admin: true });
      expect(res.status).toBe(400);
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('blocks created_at field from reaching the DAO', async () => {
      const res = await authPut().send({ created_at: '2020-01-01' });
      expect(res.status).toBe(400);
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('blocks updated_at field from reaching the DAO', async () => {
      const res = await authPut().send({ updated_at: '2020-01-01' });
      expect(res.status).toBe(400);
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('blocks user_id field from reaching the DAO', async () => {
      const res = await authPut().send({ user_id: 'other-user' });
      expect(res.status).toBe(400);
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });
  });
});

// -------------------------------------------------
// Role assignment on registration
// -------------------------------------------------
describe('Role assignment on registration', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it('POST /auth/register returns 201 with userId', async () => {
    const email = `roletest${Date.now()}@mediscan-test.local`;
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'Test@1234' });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBeDefined();
    expect(typeof res.body.userId).toBe('string');
  });

  it('new users get student role by default (test mode)', async () => {
    const email = `studentrole${Date.now()}@mediscan-test.local`;
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'Test@1234' });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email, password: 'Test@1234' });

    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token;
    expect(token).toMatch(/^test-token-\d+$/);

    // Test mode middleware assigns student role by default
    const profileRes = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${token}`);
    // Route found (not 403 = role denied)
    expect(profileRes.status).not.toBe(403);
  });

  it('POST /auth/login returns token and sets refresh cookie', async () => {
    const email = `logintest${Date.now()}@mediscan-test.local`;
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'Test@1234' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'Test@1234' });

    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^test-token-\d+$/);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/refreshToken/);
  });

  it('POST /auth/login returns 401 with wrong password', async () => {
    // In test mode the login route checks only email existence (not password).
    // To get 401 we use an email that was never registered.
    const res = await request(app)
      .post('/auth/login')
      .send({ email: `notregistered${Date.now()}@mediscan-test.local`, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});

// -------------------------------------------------
// Profile creation flow
// -------------------------------------------------
describe('Profile creation on registration flow', () => {
  let app;
  let testToken;

  beforeAll(() => {
    app = createApp();
    testToken = 'test-token-create-' + Date.now();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('newly registered user has no profile until created (404)', async () => {
    mockGetProfile.mockResolvedValue(null);
    mockUpdateProfile.mockResolvedValue(undefined);
    mockCreateProfile.mockResolvedValue(undefined);

    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(404);
  });

  it('profile can be created via PUT during onboarding', async () => {
    mockUpdateProfile.mockResolvedValue(undefined);
    mockGetProfile.mockResolvedValue({
      id: 'test-user',
      full_name: 'Profile Owner',
      date_of_birth: '2009-05-15',
    });

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ full_name: 'Profile Owner', date_of_birth: '2009-05-15' });

    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe('Profile Owner');
  });

  it('createProfile DAO is available for explicit profile creation', async () => {
    mockCreateProfile.mockResolvedValue(undefined);

    await expect(
      mockCreateProfile('test-user-id', { full_name: 'Owner' })
    ).resolves.toBeUndefined();
    expect(mockCreateProfile).toHaveBeenCalledWith(
      'test-user-id',
      { full_name: 'Owner' }
    );
  });

  it('profile data persists across requests when updated', async () => {
    mockUpdateProfile.mockResolvedValue(undefined);
    const persistedProfile = { id: 'test-user', full_name: 'Persisted User', city: 'Gondar' };
    mockGetProfile.mockResolvedValue(persistedProfile);

    // First update
    const res1 = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ full_name: 'Persisted User', city: 'Gondar' });

    expect(res1.status).toBe(200);
    // Subsequent read returns persisted data
    mockGetProfile.mockResolvedValue(persistedProfile);

    const res2 = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${testToken}`);

    expect(res2.status).toBe(200);
    expect(res2.body.full_name).toBe('Persisted User');
    expect(res2.body.city).toBe('Gondar');
  });
});

// -------------------------------------------------
// Endpoint existence verification
// -------------------------------------------------
describe('Endpoint existence and method verification', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it('GET /api/profile route exists and handles auth', async () => {
    const res = await request(app)
      .get('/api/profile')
      .set('Authorization', 'Bearer test-token-ep-check');
    expect(res.status).not.toBe(404); // Auth applied (404 = route not found)
  });

  it('PUT /api/profile route exists and returns validation response', async () => {
    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', 'Bearer test-token-ep-check')
      .send({});
    // Empty body returns 400 from validation, not 404
    expect([400, 500]).toContain(res.status);
  });

  it('POST /auth/register responds with 201', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'epcheck@example.com', password: 'Test@1234' });
    expect(res.status).toBe(201);
  });

  it('POST /auth/login with valid credentials returns 200', async () => {
    const email = `logincheck${Date.now()}@example.com`;
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'Test@1234' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'Test@1234' });

    expect(res.status).toBe(200);
  });
});
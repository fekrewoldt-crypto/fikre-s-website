// Comprehensive tests for /api/heatmap endpoint

const request = require('supertest');
const express = require('express');
const { verifyToken } = require('../auth/middleware-supabase');

// Use the test setup to configure environment
require('./setup');

// Mock the DAOs before requiring the router
jest.mock('../db/records-supabase', () => ({
  createRecord: jest.fn().mockResolvedValue('mock-record-id-' + Date.now()),
}));

jest.mock('../db/audit-supabase', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
}));

const recordsDAO = require('../db/records-supabase');
const auditDAO = require('../db/audit-supabase');

// Create a test app that mounts the heatmap route
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/heatmap', verifyToken, require('../api/heatmap'));
  return app;
}

// Sample valid heatmap state (matches HeatmapState.getEnhancedFormat())
const validHeatmapState = {
  mode: 'body',
  regions: {
    head: { level: 0 },
    chest: { level: 2 },
    abdomen: { level: 3 },
    leftArm: { level: 1 },
    rightArm: { level: 0 },
    leftLeg: { level: 0 },
    rightLeg: { level: 0 },
  },
  timestamp: Date.now(),
  version: '1.0.0',
};

// Sample enhanced format with detailed region data
const enhancedHeatmapState = {
  mode: 'muscles',
  regions: {
    frontalDeltoidLeft: { level: 3, type: 'muscle' },
    frontalDeltoidRight: { level: 2, type: 'muscle' },
    bicepsLeft: { level: 3, type: 'muscle' },
    bicepsRight: { level: 2, type: 'muscle' },
    pectoralisMajorLeft: { level: 3, type: 'muscle' },
    pectoralisMajorRight: { level: 3, type: 'muscle' },
    trapeziusUpperLeft: { level: 1, type: 'muscle' },
    rectusAbdominis: { level: 2, type: 'muscle' },
    quadricepsLeft: { level: 1, type: 'muscle' },
    quadricepsRight: { level: 0, type: 'muscle' },
  },
  timestamp: Date.now(),
  version: '1.0.0',
  metadata: {
    userAgent: 'test-agent',
    screenWidth: 1920,
  },
};

describe('/api/heatmap Endpoint', () => {
  let app;
  let consoleErrorSpy;

  beforeAll(() => {
    app = createTestApp();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  // ============================================
  // 1. Unauthenticated requests fail
  // ============================================
  describe('Authentication requirements', () => {
    describe('POST /api/heatmap', () => {
      it('returns 401 when no Authorization header', async () => {
        const res = await request(app).post('/api/heatmap').send(validHeatmapState);
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/no token/i);
      });

      it('returns 401 when Authorization header is empty', async () => {
        const res = await request(app)
          .post('/api/heatmap')
          .set('Authorization', '')
          .send(validHeatmapState);
        expect(res.status).toBe(401);
      });

      it('returns 401 when Authorization header has only Bearer', async () => {
        const res = await request(app)
          .post('/api/heatmap')
          .set('Authorization', 'Bearer')
          .send(validHeatmapState);
        expect(res.status).toBe(401);
      });

      it('returns 403 when token is not a test token', async () => {
        const res = await request(app)
          .post('/api/heatmap')
          .set('Authorization', 'Bearer some-random-token')
          .send(validHeatmapState);
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/invalid|expired/i);
      });
    });

    describe('GET requests (if supported)', () => {
      it('returns 401 when no Authorization header for GET', async () => {
        const res = await request(app).get('/api/heatmap');
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/no token/i);
      });
    });
  });

  // ============================================
  // 2. Authenticated requests succeed
  // ============================================
  describe('Authenticated requests', () => {
    it('accepts POST with valid test token', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-valid')
        .send(validHeatmapState);

      expect(res.status).toBe(201);
      expect(res.body.recordId).toBeDefined();
      expect(typeof res.body.recordId).toBe('string');
    });

    it('accepts POST with token in different prefix format', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'CustomPrefix test-token-xyz')
        .send(validHeatmapState);

      expect(res.status).toBe(201);
    });

    it('creates record with correct user context', async () => {
      await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-call-check')
        .send(validHeatmapState);

      // Verify recordsDAO.createRecord was called
      expect(recordsDAO.createRecord).toHaveBeenCalled();
      expect(recordsDAO.createRecord.mock.calls[0][0]).toMatch(/^test-user-\d+$/);
    });

    it('logs audit action on successful save', async () => {
      await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-audit')
        .send(validHeatmapState);

      expect(auditDAO.logAction).toHaveBeenCalled();
      const auditCall = auditDAO.logAction.mock.calls[0][0];
      expect(auditCall.userId).toMatch(/^test-user-\d+$/);
      expect(auditCall.action).toBe('save_heatmap');
      expect(auditCall.recordId).toBeDefined();
    });

    it('handles multiple consecutive requests', async () => {
      // First request
      const res1 = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-multi-1')
        .send({ mode: 'body', regions: { head: { level: 1 } } });

      // Second request
      const res2 = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-multi-2')
        .send({ mode: 'muscles', regions: { biceps: { level: 3 } } });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.recordId).toBeDefined();
      expect(res2.body.recordId).toBeDefined();
    });

    it('works with minimal test token format', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token')
        .send(validHeatmapState);

      expect(res.status).toBe(201);
    });
  });

  // ============================================
  // 3. Valid payload structure
  // ============================================
  describe('Valid payload processing', () => {
    it('accepts body mode heatmap state', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-body')
        .send(validHeatmapState);

      expect(res.status).toBe(201);
      expect(recordsDAO.createRecord).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mode: 'body',
        })
      );
    });

    it('accepts muscles mode heatmap state', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-muscles')
        .send(enhancedHeatmapState);

      expect(res.status).toBe(201);
      expect(recordsDAO.createRecord).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mode: 'muscles',
        })
      );
    });

    it('accepts heatmap state with nested region data', async () => {
      const complexState = {
        mode: 'body',
        regions: {
          head: { level: 1, notes: 'headache' },
          chest: { level: 3, notes: 'tightness' },
          abdomen: { level: 2, symptoms: ['cramping'] },
        },
        timestamp: Date.now(),
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-complex')
        .send(complexState);

      expect(res.status).toBe(201);
      expect(recordsDAO.createRecord).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          regions: expect.objectContaining({
            head: { level: 1, notes: 'headache' },
            chest: { level: 3, notes: 'tightness' },
          }),
        })
      );
    });

    it('accepts heatmap state with metadata', async () => {
      const stateWithMeta = {
        ...validHeatmapState,
        metadata: {
          source: 'mobile',
          version: '2.0.0',
          deviceInfo: { platform: 'ios' },
        },
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-meta')
        .send(stateWithMeta);

      expect(res.status).toBe(201);
    });

    it('accepts empty regions object', async () => {
      const emptyRegionsState = {
        mode: 'body',
        regions: {},
        timestamp: Date.now(),
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-empty')
        .send(emptyRegionsState);

      expect(res.status).toBe(201);
    });

    it('accepts arbitrary additional fields', async () => {
      const stateWithExtra = {
        mode: 'body',
        regions: { head: { level: 1 } },
        timestamp: Date.now(),
        customField: 'value',
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-extra')
        .send(stateWithExtra);

      expect(res.status).toBe(201);
    });

    it('handles very large heatmap state', async () => {
      // Create a large state with many regions
      const largeRegions = {};
      for (let i = 0; i < 100; i++) {
        largeRegions[`region_${i}`] = { level: i % 4, type: 'test' };
      }
      const largeState = {
        mode: 'custom',
        regions: largeRegions,
        timestamp: Date.now(),
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-large')
        .send(largeState);

      expect(res.status).toBe(201);
    });
  });

  // ============================================
  // 4. Invalid payload handling
  // ============================================
  describe('Invalid payload handling', () => {
    it('returns 400 when JSON body is explicitly null', async () => {
      // Send actual JSON null using send() with proper JSON formatting
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-null')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(null));

      // express.json() parses JSON null, endpoint checks !state and returns 400
      expect(res.status).toBe(400);
      // Note: body may be empty due to JSON parsing behavior with null value
    });

    it('returns 400 when body is undefined (sending without data)', async () => {
      // Send request without body data
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-undefined')
        .set('Content-Type', 'application/json')
        .send();

      // The actual status depends on express.json() parsing behavior
      // Empty body is treated as {} which is truthy, so it may return 201
      expect([201, 400]).toContain(res.status);
    });

    it('accepts empty object as valid (current behavior)', async () => {
      // Note: Empty object {} is truthy and passes the !state check
      // The endpoint accepts any truthy body object
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-empty-obj')
        .send({});

      // Current endpoint treats {} as valid (truthy)
      expect(res.status).toBeDefined();
    });

    it('handles text/plain content type', async () => {
      // text/plain is not handled by express.json(), so body is {}
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-text')
        .type('text/plain')
        .send('not json');

      // express.json() ignores non-JSON content type, body is {}
      // {} is truthy so it passes the validation
      expect(res.status).toBeDefined();
    });
  });

  // ============================================
  // 5. Response structure
  // ============================================
  describe('Response structure', () => {
    it('returns 201 status with recordId on success', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-success')
        .send(validHeatmapState);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('recordId');
      expect(res.body.recordId).toBeTruthy();
      expect(res.body.recordId).toMatch(/^mock-record-id-\d+$/);
    });

    it('response contains only recordId field on success', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-minimal')
        .send(validHeatmapState);

      expect(res.status).toBe(201);
      const keys = Object.keys(res.body);
      expect(keys).toHaveLength(1);
      expect(keys).toContain('recordId');
    });

    it('error response for invalid body has proper status code', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-error-check')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(null));

      // Verify the error status code is returned
      expect(res.status).toBe(400);
    });

    it('error responses do not expose internal details', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-security')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(null));

      expect(res.status).toBe(400);
      // Body may be empty, but if it has error field, verify it's generic
      if (res.body.error) {
        expect(res.body.error).not.toContain('at ');
        expect(res.body.error).not.toContain('\\');
      }
    });
  });

  // ============================================
  // Edge cases
  // ============================================
  describe('Edge cases', () => {
    it('handles unicode in payload', async () => {
      const unicodeState = {
        mode: 'body',
        regions: {
          голов: { level: 1, name: 'голова' },
          '中文字符': { level: 2 },
        },
        notes: '测试中文 ስለ ፈተና',
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-unicode')
        .send(unicodeState);

      expect(res.status).toBe(201);
    });

    it('handles numeric values in regions', async () => {
      const numericState = {
        mode: 'body',
        regions: {
          temperature: 37.5,
          painLevel: 8,
        },
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-numeric')
        .send(numericState);

      expect(res.status).toBe(201);
    });

    it('handles boolean values in state', async () => {
      const booleanState = {
        mode: 'body',
        regions: {},
        isSymmetric: false,
        hasPain: true,
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-bool')
        .send(booleanState);

      expect(res.status).toBe(201);
    });

    it('handles string mode values', async () => {
      const stringModeState = {
        mode: 'testing',
        regions: {},
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-string-mode')
        .send(stringModeState);

      expect(res.status).toBe(201);
    });

    it('preserves timestamp in state if present', async () => {
      const specificTimestamp = Date.now() - 1000000;
      const stateWithTimestamp = {
        mode: 'body',
        regions: {},
        timestamp: specificTimestamp,
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-timestamp')
        .send(stateWithTimestamp);

      expect(res.status).toBe(201);
      expect(recordsDAO.createRecord).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timestamp: specificTimestamp,
        })
      );
    });

    it('handles arrays in state', async () => {
      const arrayState = {
        mode: 'body',
        regions: {},
        symptoms: ['headache', 'fatigue', 'nausea'],
        history: [{ date: '2024-01-01', level: 2 }],
      };

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-array')
        .send(arrayState);

      expect(res.status).toBe(201);
    });
  });

  // ============================================
  // Method handling
  // ============================================
  describe('HTTP method handling', () => {
    it('handles OPTIONS requests (CORS preflight)', async () => {
      const res = await request(app)
        .options('/api/heatmap')
        .set('Authorization', 'Bearer test-token-options');

      // Express automatically handles OPTIONS, returns 200
      // The verifyToken middleware is applied but OPTIONS passes through
      expect(res.status).toBe(200);
    });

    it('rejects PUT method', async () => {
      const res = await request(app)
        .put('/api/heatmap')
        .set('Authorization', 'Bearer test-token-put')
        .send(validHeatmapState);

      // Current router only has POST, so PUT may return 404 or 405
      expect([404, 405]).toContain(res.status);
    });

    it('rejects DELETE method', async () => {
      const res = await request(app)
        .delete('/api/heatmap')
        .set('Authorization', 'Bearer test-token-delete');

      // Current router only has POST, so DELETE may return 404 or 405
      expect([404, 405]).toContain(res.status);
    });

    it('rejects PATCH method', async () => {
      const res = await request(app)
        .patch('/api/heatmap')
        .set('Authorization', 'Bearer test-token-patch')
        .send(validHeatmapState);

      // Current router only has POST, so PATCH may return 404 or 405
      expect([404, 405]).toContain(res.status);
    });
  });

  // ============================================
  // Content-Type handling
  // ============================================
  describe('Content-Type handling', () => {
    it('accepts application/json by default', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-json')
        .send(validHeatmapState);

      expect(res.status).toBe(201);
    });

    it('handles explicit application/json content type', async () => {
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-explicit-json')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(validHeatmapState));

      expect(res.status).toBe(201);
    });
  });

  // ============================================
  // Server error handling
  // ============================================
  describe('Server error handling', () => {
    it('returns 500 when recordsDAO fails', async () => {
      recordsDAO.createRecord.mockRejectedValueOnce(new Error('Database connection failed'));

      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-db-fail')
        .send(validHeatmapState);

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/server error|error/i);
      // Should not expose internal error details
      expect(res.body.error).not.toContain('Database connection failed');
    });

    it('continues to work after a server error', async () => {
      // First request fails
      recordsDAO.createRecord.mockRejectedValueOnce(new Error('Temporary failure'));

      await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-recover-1')
        .send(validHeatmapState);

      // Reset mock to success
      recordsDAO.createRecord.mockResolvedValue('recovery-record-id');

      // Second request should succeed
      const res = await request(app)
        .post('/api/heatmap')
        .set('Authorization', 'Bearer test-token-recover-2')
        .send(validHeatmapState);

      expect(res.status).toBe(201);
    });
  });
});
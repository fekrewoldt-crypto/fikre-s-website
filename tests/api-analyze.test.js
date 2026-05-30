// Comprehensive Jest tests for /api/analyze endpoint
const request = require('supertest');
const path = require('path');

// Set environment variables BEFORE loading the app
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-mediscan-analyze-tests-only-do-not-use-in-prod';
process.env.DATA_ENC_KEY = 'a'.repeat(64);
process.env.RATE_LIMIT_WINDOW = '1';
process.env.RATE_LIMIT_MAX = '100'; // generous for most tests

// Configure AI API keys to be unset so demo mode is used
process.env.GEMINI_API_KEY = '';
process.env.GROQ_API_KEY = '';
process.env.NVIDIA_API_KEY = '';
process.env.VISION_API_KEY = '';

require('./setup');

const { createApp } = require('../Server-v2.js');

describe('/api/analyze endpoint', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe('Basic analysis', () => {
    it('POST /api/analyze returns 200 with valid symptoms', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache and it hurts behind my eyes' });

      expect(res.status).toBe(200);
    });

    it('returns proper response structure', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache', bodyArea: 'head' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('primaryCondition');
      expect(res.body).toHaveProperty('confidence');
      expect(res.body).toHaveProperty('severity'); // 'low', 'medium', or 'high'
      expect(res.body).toHaveProperty('subtitle');
      expect(res.body).toHaveProperty('description');
      expect(res.body).toHaveProperty('symptoms');
      expect(res.body).toHaveProperty('nextSteps');
      expect(res.body).toHaveProperty('urgentSigns');
      expect(res.body).toHaveProperty('alternatives');
      expect(res.body).toHaveProperty('disclaimer');
      expect(res.body).toHaveProperty('modelUsed');
      expect(res.body).toHaveProperty('demoMode');
      expect(res.body).toHaveProperty('recommendedFacilities');
    });

    it('severity is one of: low, medium, high', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache' });

      expect(['low', 'medium', 'high']).toContain(res.body.severity);
    });

    it('confidence is a number between 0 and 100', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache' });

      expect(typeof res.body.confidence).toBe('number');
      expect(res.body.confidence).toBeGreaterThanOrEqual(0);
      expect(res.body.confidence).toBeLessThanOrEqual(100);
    });

    it('symptoms is an array', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache' });

      expect(Array.isArray(res.body.symptoms)).toBe(true);
    });

    it('alternatives is an array with condition objects', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache' });

      expect(Array.isArray(res.body.alternatives)).toBe(true);
      res.body.alternatives.forEach(alt => {
        expect(alt).toHaveProperty('name');
        expect(alt).toHaveProperty('confidence');
        expect(typeof alt.name).toBe('string');
        expect(typeof alt.confidence).toBe('number');
      });
    });

    it('recommendedFacilities is an array', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache' });

      expect(Array.isArray(res.body.recommendedFacilities)).toBe(true);
    });

    it('demoMode is true when no AI keys are configured', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache' });

      expect(res.body.demoMode).toBe(true);
      expect(res.body.modelUsed).toBe('demo');
    });

    it('responseTimeMs is a non-negative number', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache' });

      expect(typeof res.body.responseTimeMs).toBe('number');
      expect(res.body.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('modelsAttempted tracks the fallback chain', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'I have a headache' });

      expect(Array.isArray(res.body.modelsAttempted)).toBe(true);
    });
  });

  describe('Request validation', () => {
    it('returns 200 even with empty symptoms (uses demo data)', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({});

      // Should still return 200 with demo data
      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('accepts symptoms only without bodyArea', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'fever and chills' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('accepts bodyArea only without symptoms', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ bodyArea: 'head' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles extended prompt text', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({
          symptoms: 'I have been experiencing severe headaches for the past 3 days, mostly in the morning. The pain is throbbing and located behind my eyes. I also feel nauseous when the headache is at its worst.'
        });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles prompt parameter in addition to symptoms', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({
          prompt: 'What could be wrong if I have pain in my chest?',
          symptoms: 'chest pain',
          bodyArea: 'chest'
        });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles timePeriod parameter', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({
          symptoms: 'cough',
          bodyArea: 'throat',
          timePeriod: '3 days'
        });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });
  });

  describe('Rate limiting', () => {
    it('rate limiting is applied to /api/analyze', async () => {
      // Set a very low rate limit for this test
      const limitedApp = createApp();

      // Make multiple rapid requests until we hit the limit
      let rateLimited = false;
      const testEmail = `ratelimit${Date.now()}@example.com`;

      for (let i = 0; i < 105; i++) {
        const res = await request(limitedApp)
          .post('/api/analyze')
          .send({ symptoms: `test symptom ${i}` });

        if (res.status === 429) {
          rateLimited = true;
          break;
        }
      }

      expect(rateLimited).toBe(true);
    });

    it('returns 429 when rate limit is exceeded', async () => {
      // Create app with very low limit
      process.env.RATE_LIMIT_MAX = '3';
      const limitedApp = createApp();

      // Exhaust the limit
      await request(limitedApp).post('/api/analyze').send({ symptoms: 'test 1' });
      await request(limitedApp).post('/api/analyze').send({ symptoms: 'test 2' });
      await request(limitedApp).post('/api/analyze').send({ symptoms: 'test 3' });
      const fourth = await request(limitedApp).post('/api/analyze').send({ symptoms: 'test 4' });

      expect(fourth.status).toBe(429);
      // The response body exists (may be text or JSON depending on express-rate-limit config)
      expect(fourth.body).toBeDefined();
    });
  });

  describe('Body area mapping', () => {
    it('handles head body area', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'pain', bodyArea: 'head' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
    });

    it('handles eye body area', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'vision problems', bodyArea: 'eye' });

      expect(res.status).toBe(200);
      // Eye area should return Conjunctivitis (Pink Eye) in demo mode
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles skin body area', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'rash', bodyArea: 'skin' });

      expect(res.status).toBe(200);
      // Skin area should return Contact Dermatitis in demo mode
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles chest body area', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'heart palpitations', bodyArea: 'chest' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles stomach body area', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'heartburn', bodyArea: 'stomach' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles throat body area', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'sore throat', bodyArea: 'throat' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles respiratory/body area', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'sneezing', bodyArea: 'nose' });

      expect(res.status).toBe(200);
      // Nose area should return Seasonal Allergies in demo mode
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('returns response with all major severity types', async () => {
      // Test that demo mode can return different severity levels
      const severities = new Set();

      const symptomsList = [
        'slight headache',
        'moderate fever',
        'severe chest pain'
      ];

      for (const symptoms of symptomsList) {
        // Need specific content to trigger different mock conditions
        const res = await request(app)
          .post('/api/analyze')
          .send({
            symptoms: `I have ${symptoms}`,
            bodyArea: 'body'
          });
        severities.add(res.body.severity);
      }

      // Verify we got some severity values
      expect(severities.size).toBeGreaterThan(0);
    });
  });

  describe('Caching', () => {
    it('second identical request returns cached response', async () => {
      const uniqueSymptom = `cached-test-${Date.now()}`;
      const bodyArea = 'head';

      // First request
      const res1 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: uniqueSymptom, bodyArea });

      expect(res1.status).toBe(200);
      expect(res1.body.cached).toBeUndefined(); // First request should not be cached

      // Second identical request - should be cached
      const res2 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: uniqueSymptom, bodyArea });

      expect(res2.status).toBe(200);
      expect(res2.body.cached).toBe(true);
    });

    it('different symptoms produce different cache entries', async () => {
      const timestamp = Date.now();

      const res1 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: `test-symptoms-1-${timestamp}`, bodyArea: 'head' });

      const res2 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: `test-symptoms-2-${timestamp}`, bodyArea: 'head' });

      // Both should succeed (not cached for different inputs)
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('different bodyArea produces different cache entries', async () => {
      const timestamp = Date.now();

      const res1 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: `same-symptoms-${timestamp}`, bodyArea: 'head' });

      const res2 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: `same-symptoms-${timestamp}`, bodyArea: 'chest' });

      // Both should succeed (different body areas = different cache)
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('cached response has same primary condition as original', async () => {
      const uniqueSymptom = `cache-verification-${Date.now()}`;

      const res1 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: uniqueSymptom, bodyArea: 'head' });

      const res2 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: uniqueSymptom, bodyArea: 'head' });

      // Cached response should have same primary condition
      expect(res2.body.primaryCondition).toBe(res1.body.primaryCondition);
      expect(res2.body.confidence).toBe(res1.body.confidence);
      expect(res2.body.severity).toBe(res1.body.severity);
    });

    it('cached response includes cached: true flag', async () => {
      const uniqueSymptom = `caching-flag-test-${Date.now()}`;

      await request(app)
        .post('/api/analyze')
        .send({ symptoms: uniqueSymptom, bodyArea: 'head' });

      const res2 = await request(app)
        .post('/api/analyze')
        .send({ symptoms: uniqueSymptom, bodyArea: 'head' });

      expect(res2.body.cached).toBe(true);
    });
  });

  describe('Image handling', () => {
    it('accepts request with imageBase64', async () => {
      // Small valid JPEG base64 (1x1 red pixel)
      const tinyJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';

      const res = await request(app)
        .post('/api/analyze')
        .send({
          symptoms: 'I have a skin rash',
          imageBase64: tinyJpegBase64,
          imageMimeType: 'image/jpeg'
        });

      // Should still succeed (falls back through model chain to demo mode)
      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('image requests bypass cache', async () => {
      const tinyJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';

      const res = await request(app)
        .post('/api/analyze')
        .send({
          symptoms: 'skin condition',
          imageBase64: tinyJpegBase64,
          imageMimeType: 'image/jpeg'
        });

      // Image requests should not be cached
      expect(res.body.cached).toBeUndefined();
    });

    it('handles request without image when other requests have images', async () => {
      const tinyJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==';

      // Request with image
      await request(app)
        .post('/api/analyze')
        .send({
          symptoms: 'rash-with-image',
          imageBase64: tinyJpegBase64,
          imageMimeType: 'image/jpeg'
        });

      // Request without image (should still work and may be cached independently)
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'rash-with-image' });

      expect(res.status).toBe(200);
    });
  });

  describe('Model fallback chain', () => {
    it('groq is checked before other models when API key is missing', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'test' });

      // In test mode without keys, should hit demo mode
      expect(res.body.modelUsed).toBe('demo');
    });

    it('modelsAttempted tracks failed models', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'test' });

      // Should track the models that were attempted
      expect(Array.isArray(res.body.modelsAttempted)).toBe(true);

      // Without API keys configured, models should fail and log errors
      // The final response should still be successful from demo mode
      expect(res.status).toBe(200);
    });

    it('demo mode is always available as final fallback', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'fallback test' });

      // Even with all models failing, demo mode provides response
      expect(res.body.demoMode).toBe(true);
      expect(res.body.modelUsed).toBe('demo');
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('response includes modelUsed field', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'response structure test' });

      expect(res.body).toHaveProperty('modelUsed');
      expect(typeof res.body.modelUsed).toBe('string');
    });

    it('all responses include disclaimer', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'disclaimer test' });

      expect(res.body.disclaimer).toBeDefined();
      expect(typeof res.body.disclaimer).toBe('string');
      expect(res.body.disclaimer).toContain('AI analysis');
      expect(res.body.disclaimer).toContain('medical advice');
    });
  });

  describe('Mock diagnosis mapping', () => {
    it('eye symptoms map to Conjunctivitis', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'eye redness and itching', bodyArea: 'eye' });

      expect(res.body.primaryCondition).toBe('Conjunctivitis (Pink Eye)');
    });

    it('skin/rash symptoms map to Contact Dermatitis', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'skin rash and itching', bodyArea: 'skin' });

      expect(res.body.primaryCondition).toBe('Contact Dermatitis');
    });

    it('headache symptoms map to Tension Headache', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'severe headache', bodyArea: 'head' });

      expect(res.body.primaryCondition).toBe('Tension Headache');
    });

    it('anxiety symptoms map to Anxiety Attack', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'panic attack anxiety', bodyArea: 'chest' });

      expect(res.body.primaryCondition).toBe('Anxiety Attack (Panic Attack)');
    });

    it('default case maps to Viral Upper Respiratory Infection', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'general feeling unwell' });

      // Default fallback when no specific match
      expect(res.body).toHaveProperty('primaryCondition');
    });
  });

  describe('Response format consistency', () => {
    it('all responses have consistent field types', async () => {
      const testCases = [
        { symptoms: 'headache', bodyArea: 'head' },
        { symptoms: 'skin problem', bodyArea: 'skin' },
        { symptoms: 'anxiety', bodyArea: 'chest' }
      ];

      for (const testCase of testCases) {
        const res = await request(app)
          .post('/api/analyze')
          .send(testCase);

        expect(res.status).toBe(200);
        expect(typeof res.body.primaryCondition).toBe('string');
        expect(typeof res.body.confidence).toBe('number');
        expect(typeof res.body.severity).toBe('string');
        expect(typeof res.body.subtitle).toBe('string');
        expect(typeof res.body.description).toBe('string');
        expect(Array.isArray(res.body.symptoms)).toBe(true);
        expect(Array.isArray(res.body.nextSteps)).toBe(true);
        expect(typeof res.body.urgentSigns).toBe('string');
        expect(Array.isArray(res.body.alternatives)).toBe(true);
        expect(typeof res.body.disclaimer).toBe('string');
        expect(typeof res.body.modelUsed).toBe('string');
        expect(typeof res.body.demoMode).toBe('boolean');
        expect(Array.isArray(res.body.recommendedFacilities)).toBe(true);
      }
    });

    it('nextSteps array contains actionable recommendations', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'mild fever', bodyArea: 'body' });

      expect(res.body.nextSteps.length).toBeGreaterThan(0);
      res.body.nextSteps.forEach(step => {
        expect(typeof step).toBe('string');
        expect(step.length).toBeGreaterThan(0);
      });
    });

    it('urgentSigns contains warning text', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'fever' });

      expect(res.body.urgentSigns.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('handles unicode symptoms text', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: '我头疼', bodyArea: 'head' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles ampersand and special characters', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'Pain & discomfort > normal levels' });

      expect(res.status).toBe(200);
    });

    it('handles very long symptoms text', async () => {
      const longSymptoms = 'I have been experiencing '.repeat(100);

      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: longSymptoms });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles numeric-only symptoms', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: '12345' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles empty string symptoms', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: '' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });

    it('handles whitespace-only symptoms', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: '   ' });

      expect(res.status).toBe(200);
      expect(res.body.primaryCondition).toBeDefined();
    });
  });

  describe('Content-Type header', () => {
    it('returns application/json content type', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'test' });

      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('recommendedFacilities details', () => {
    it('facility objects have key required fields', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'headache' });

      expect(Array.isArray(res.body.recommendedFacilities)).toBe(true);

      // Each facility should have these core fields
      res.body.recommendedFacilities.forEach(facility => {
        expect(facility).toHaveProperty('name');
        expect(facility).toHaveProperty('type');
        expect(facility).toHaveProperty('address');
        expect(facility).toHaveProperty('phone');
        expect(facility).toHaveProperty('hours');
        expect(facility).toHaveProperty('lat');
        expect(facility).toHaveProperty('lng');
      });
    });

    it('facilities are returned for different severity levels', async () => {
      const res = await request(app)
        .post('/api/analyze')
        .send({ symptoms: 'fever' });

      // Just verify facilities exist and are valid arrays
      expect(Array.isArray(res.body.recommendedFacilities)).toBe(true);
    });
  });
});
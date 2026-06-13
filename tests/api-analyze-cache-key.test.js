// Regression tests for the /api/analyze cache key.
// Bug 1: cache key omitted bodyRegions, so two users with identical symptom
// text but different clicked heatmap regions shared cached diagnoses.
// Bug 2: demoMode responses were cached for an hour, so a brief AI outage
// would freeze every user on mock data until the cache expired.

const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-mediscan-cache-key-tests';
process.env.DATA_ENC_KEY = 'a'.repeat(64);
process.env.RATE_LIMIT_WINDOW = '1';
process.env.AI_RATE_LIMIT_MAX = '10000';
process.env.RATE_LIMIT_MAX = '10000';

// No AI keys configured so every code path resolves to demo mode.
process.env.GROQ_API_KEY = '';
process.env.NVIDIA_API_KEY = '';
process.env.VISION_API_KEY = '';

require('./setup');

const { createApp } = require('../Server-v2.js');
const { makeTestToken } = require('../auth/middleware-supabase.js');

describe('/api/analyze cache key includes bodyRegions (privacy fix)', () => {
  let app;
  let testToken;

  beforeAll(() => {
    app = createApp();
    testToken = makeTestToken();
  });

  const analyzeRequest = (body) => request(app)
    .post('/api/analyze')
    .set('Authorization', `Bearer ${testToken}`)
    .send(body);

  it('different bodyRegions with same symptoms do NOT share cached diagnosis', async () => {
    const symptoms = `headache-${Date.now()}-${Math.random()}`;

    const res1 = await analyzeRequest({
      symptoms,
      bodyRegions: [{ area: 'chest', name: 'Chest', intensity: 0.8 }],
    });
    expect(res1.status).toBe(200);

    const res2 = await analyzeRequest({
      symptoms,
      bodyRegions: [{ area: 'head', name: 'Head', intensity: 0.8 }],
    });
    expect(res2.status).toBe(200);
    // Pre-fix, res2 would carry the chest diagnosis from cache.
    expect(res2.body.cached).not.toBe(true);
  });

  it('identical bodyRegions still hit cache (no false negatives)', async () => {
    const symptoms = `same-regions-${Date.now()}-${Math.random()}`;
    const regions = [{ area: 'chest', name: 'Chest', intensity: 0.8 }];

    const first = await analyzeRequest({ symptoms, bodyRegions: regions });
    expect(first.status).toBe(200);
    const second = await analyzeRequest({ symptoms, bodyRegions: regions });
    expect(second.status).toBe(200);
    expect(second.body.cached).toBe(true);
  });

  it('region order is normalized so the cache still hits', async () => {
    const symptoms = `order-${Date.now()}-${Math.random()}`;

    await analyzeRequest({
      symptoms,
      bodyRegions: [
        { area: 'chest', name: 'Chest', intensity: 0.8 },
        { area: 'head', name: 'Head', intensity: 0.6 },
      ],
    });
    const res2 = await analyzeRequest({
      symptoms,
      bodyRegions: [
        { area: 'head', name: 'Head', intensity: 0.6 },
        { area: 'chest', name: 'Chest', intensity: 0.8 },
      ],
    });
    expect(res2.body.cached).toBe(true);
  });

  it('translated region names do not break cache (i18n stability)', async () => {
    const symptoms = `i18n-${Date.now()}-${Math.random()}`;

    await analyzeRequest({
      symptoms,
      bodyRegions: [{ area: 'chest', name: 'Chest', intensity: 0.8 }],
    });
    const res2 = await analyzeRequest({
      symptoms,
      // Same area+intensity, name swapped to an Amharic translation.
      bodyRegions: [{ area: 'chest', name: 'ደረት', intensity: 0.8 }],
    });
    expect(res2.body.cached).toBe(true);
  });
});

describe('/api/analyze does NOT cache demoMode responses', () => {
  let app;
  let testToken;

  beforeAll(() => {
    app = createApp();
    testToken = makeTestToken();
  });

  const analyzeRequest = (body) => request(app)
    .post('/api/analyze')
    .set('Authorization', `Bearer ${testToken}`)
    .send(body);

  it('demoMode fallback in production path is not cached (outage recovery)', async () => {
    // The test-mode shortcut at the top of /api/analyze always returns
    // demoMode=true and caches (existing behavior used by other suites).
    // We need to exercise the real production loop, so flip NODE_ENV just
    // for these two requests. With no AI keys set, the loop falls through
    // groq/nvidia/ollama and lands on the 'demo' case, which used to
    // setCached the mock response.
    const symptoms = `demo-no-cache-${Date.now()}-${Math.random()}`;
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res1 = await analyzeRequest({ symptoms, bodyArea: 'head' });
      expect(res1.status).toBe(200);
      expect(res1.body.demoMode).toBe(true);

      const res2 = await analyzeRequest({ symptoms, bodyArea: 'head' });
      expect(res2.status).toBe(200);
      expect(res2.body.demoMode).toBe(true);
      // Pre-fix, res2 would be served from the poisoned cache.
      expect(res2.body.cached).not.toBe(true);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

// Tests for P1 hardening fixes in /api/analyze:
//   1. normalizeAIResponse severity/urgency type coercion (no silent downgrade)
//   2. extractJSON balanced-brace walk (survives prose with stray braces)
//   3. AbortController + 4s timeout on AI providers (stays under Vercel 10s cap)

// Configure env BEFORE requiring Server-v2.js so the groq client is instantiated.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-hardening-suite-only';
process.env.DATA_ENC_KEY = 'a'.repeat(64);
process.env.RATE_LIMIT_WINDOW = '1';
process.env.RATE_LIMIT_MAX = '10000';
process.env.AI_RATE_LIMIT_MAX = '10000';
process.env.GROQ_API_KEY = 'test-groq-key';
process.env.NVIDIA_API_KEY = '';
process.env.VISION_API_KEY = '';

// jest.mock factory cannot close over outer locals; route configuration via global.
global.__aiMockConfig = { delayMs: 0 };

jest.mock('openai', () => {
  const successContent = JSON.stringify({
    primaryCondition: 'Mocked Condition',
    confidence: 70,
    severity: 'low',
    subtitle: 'sub',
    description: 'desc',
    symptoms: ['s1'],
    nextSteps: ['step1'],
    urgentSigns: 'sign',
    alternatives: [{ name: 'alt', confidence: 30 }],
    disclaimer: 'd'
  });

  class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: (_payload, opts) => {
            const cfg = global.__aiMockConfig || { delayMs: 0 };
            const signal = opts && opts.signal;
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                resolve({ choices: [{ message: { content: successContent } }] });
              }, cfg.delayMs || 0);
              if (signal) {
                if (signal.aborted) {
                  clearTimeout(timer);
                  const err = new Error('aborted');
                  err.name = 'APIUserAbortError';
                  reject(err);
                  return;
                }
                signal.addEventListener('abort', () => {
                  clearTimeout(timer);
                  const err = new Error('aborted');
                  err.name = 'APIUserAbortError';
                  reject(err);
                });
              }
            });
          }
        }
      };
    }
  }
  return { OpenAI: MockOpenAI };
});

require('./setup');
const request = require('supertest');
const { createApp, normalizeAIResponse, extractJSON } = require('../Server-v2.js');

describe('normalizeAIResponse severity type coercion (Bug 1)', () => {
  it('extracts "high" from object form {level:"high"} (not silent downgrade to low)', () => {
    const r = normalizeAIResponse({
      primaryCondition: 'X',
      confidence: 80,
      severity: { level: 'high' }
    });
    expect(r.severity).toBe('high');
  });

  it('extracts "high" from array form ["high"]', () => {
    const r = normalizeAIResponse({
      primaryCondition: 'X',
      confidence: 80,
      severity: ['high']
    });
    expect(r.severity).toBe('high');
  });

  it('extracts "medium" from object form {value:"medium"}', () => {
    const r = normalizeAIResponse({
      primaryCondition: 'X',
      severity: { value: 'medium' }
    });
    expect(r.severity).toBe('medium');
  });

  it('null severity falls through to keyword inference (defaults low for benign condition)', () => {
    const r = normalizeAIResponse({
      primaryCondition: 'Mild common cold',
      severity: null
    });
    expect(['low', 'medium', 'high']).toContain(r.severity);
    expect(r.severity).toBe('low');
  });

  it('null severity still escalates to high via keyword inference (regression check)', () => {
    const r = normalizeAIResponse({
      primaryCondition: 'Possible heart attack',
      severity: null
    });
    expect(r.severity).toBe('high');
  });

  it('extracts severity from urgency object when severity is missing', () => {
    const r = normalizeAIResponse({
      primaryCondition: 'X',
      urgency: { level: 'high' }
    });
    expect(r.severity).toBe('high');
  });

  it('plain string severity still works (no regression)', () => {
    const r = normalizeAIResponse({
      primaryCondition: 'X',
      severity: 'medium'
    });
    expect(r.severity).toBe('medium');
  });
});

describe('extractJSON balanced-brace walk (Bug 2)', () => {
  it('parses prose with stray braces before the real JSON object', () => {
    const raw = 'Here is the analysis (see {below} for details): {"condition":"x"}';
    const got = extractJSON(raw);
    expect(got).toEqual({ condition: 'x' });
  });

  it('fast-path: plain JSON parses (no regression)', () => {
    expect(extractJSON('{"a":"b"}')).toEqual({ a: 'b' });
  });

  it('throws cleanly when no JSON object at all (no regression)', () => {
    expect(() => extractJSON('garbage no json at all')).toThrow();
  });

  it('respects strings: braces inside string literals do not break parsing', () => {
    expect(extractJSON('{"msg":"contains {nested} braces"}'))
      .toEqual({ msg: 'contains {nested} braces' });
  });

  it('strips ```json fences before parsing (no regression)', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('walks past prose with chain-of-thought braces before real JSON', () => {
    const raw = 'reasoning: the model thought {hmm, maybe X}. Final: {"primaryCondition":"Migraine","confidence":75}';
    const got = extractJSON(raw);
    expect(got.primaryCondition).toBe('Migraine');
    expect(got.confidence).toBe(75);
  });

  it('handles escaped quotes inside JSON strings', () => {
    expect(extractJSON('{"q":"she said \\"hi\\""}'))
      .toEqual({ q: 'she said "hi"' });
  });
});

describe('AI provider timeout (Bug 3)', () => {
  let app;
  let savedNodeEnv;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    global.__aiMockConfig = { delayMs: 0 };
    // The /api/analyze handler has a test-mode shortcut that returns demo
    // mock data without hitting any AI provider. Flip NODE_ENV so the real
    // provider path runs (with our jest-mocked openai SDK). /api/analyze
    // has no auth, so no Supabase calls are made.
    savedNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  it('aborts groq call at ~4s when provider hangs and falls back', async () => {
    global.__aiMockConfig = { delayMs: 10000 }; // 10s > 4s timeout
    const uniq = 'timeout-test-' + Date.now();
    const start = Date.now();
    const res = await request(app)
      .post('/api/analyze')
      .send({ symptoms: uniq });
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    // 4s timeout + demo fallback should clear in under 5.5s (well under Vercel 10s cap)
    expect(elapsed).toBeLessThan(5500);

    expect(Array.isArray(res.body.modelsAttempted)).toBe(true);
    const hadTimeout = res.body.modelsAttempted.some(m =>
      m && m.error && /timeout/i.test(m.error)
    );
    expect(hadTimeout).toBe(true);
  }, 8000);

  it('does not time out when provider responds quickly', async () => {
    global.__aiMockConfig = { delayMs: 50 };
    const uniq = 'quick-test-' + Date.now();
    const res = await request(app)
      .post('/api/analyze')
      .send({ symptoms: uniq });
    expect(res.status).toBe(200);
    expect(res.body.modelUsed).toBe('groq');
  });
});

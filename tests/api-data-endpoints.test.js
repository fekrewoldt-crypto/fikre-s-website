// Regression test for the "Failed to get profile / appointments / reminders"
// 500s on 2026-06-13.
//
// db/supabase.js exports the Supabase client DIRECTLY (module.exports =
// supabase). Three DAOs imported it destructured — `const { supabase } =
// require('./supabase')` — so the client was `undefined` and the first
// `.from()` threw "Cannot read properties of undefined", surfacing as HTTP 500
// on GET /api/profile, /api/appointments, and /api/medicine-reminders. The bug
// shipped because these DAOs had ZERO test coverage. This suite exercises each
// endpoint through the real route + DAO so a broken client import 500s here.

const request = require('supertest');
const { createApp } = require('../Server-v2.js');

describe('Authenticated data endpoints reach their DAO (no undefined-client 500)', () => {
  const app = createApp();
  const TOKEN = 'test-token-data-endpoints'; // test-mode verifyToken accepts test-token-*

  const endpoints = [
    '/api/profile',
    '/api/appointments',
    '/api/medicine-reminders',
    '/api/doctors',
  ];

  test.each(endpoints)('GET %s does not 500 (DAO client is defined)', async (ep) => {
    const res = await request(app).get(ep).set('Authorization', `Bearer ${TOKEN}`);
    // The import bug produced 500 "Failed to get ...". Any non-500 means the
    // query chain ran against a real client.
    expect(res.status).not.toBe(500);
    expect(res.status).toBeLessThan(500);
  });

  test('PUT /api/profile reaches the DAO and does not 500', async () => {
    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ language_preference: 'en' });
    expect(res.status).not.toBe(500);
  });

  test('every DAO that uses the supabase client imported the default export (not destructured)', () => {
    // Guards the exact root cause: db/supabase.js exports the client directly,
    // so the value each DAO holds must be the client itself (has .from), never
    // an object whose .supabase is undefined.
    for (const mod of ['../db/profiles', '../db/appointments', '../db/medicine-reminders']) {
      jest.resetModules();
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(path.join(__dirname, mod + '.js'), 'utf8');
      expect(src).not.toMatch(/const\s*\{\s*supabase\s*\}\s*=\s*require\(['"]\.\/supabase['"]\)/);
      expect(src).toMatch(/const\s+supabase\s*=\s*require\(['"]\.\/supabase['"]\)/);
    }
  });
});

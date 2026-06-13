// Regression test for the "Google sign-in loads forever" bug (root cause found
// 2026-06-13, fixed alongside the CSRF and rate-limit fixes).
//
// The /auth/oauth-callback bridge page is built as a backtick TEMPLATE LITERAL
// in auth/supabase-auth.js. Its inline <script> contained `split('\n')`. Inside
// a template literal, `\n` is an escape that Node turns into a REAL newline in
// the sent HTML — producing `split('<newline>')`, a single-quoted string broken
// across two lines, which is a fatal JS syntax error. The browser aborted the
// ENTIRE inline script before any line ran: the spinner showed, no fetch fired,
// no redirect, no timeout — an endless "Signing you in…" spinner on every
// browser. node -c and the rest of the suite never caught it because the bridge
// JS is a STRING, not executed code. This test renders the route and actually
// parse-checks the served script.

const request = require('supertest');
const { createApp } = require('../Server-v2.js');

describe('OAuth bridge page (/auth/oauth-callback) served inline JS', () => {
  let scriptBody;

  beforeAll(async () => {
    const app = createApp();
    const res = await request(app).get('/auth/oauth-callback');
    expect(res.status).toBe(200);
    const html = res.text;
    const start = html.indexOf('<script>');
    const end = html.indexOf('</script>', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    scriptBody = html.slice(start + '<script>'.length, end);
  });

  test('the rendered inline script is syntactically valid JavaScript', () => {
    // new Function() compiles (parses) the body without running it. A syntax
    // error in the SERVED script — e.g. a template-literal escape that became a
    // raw newline inside a string literal — throws here. This is the
    // authoritative guard against the endless-spinner regression.
    expect(() => new Function(scriptBody)).not.toThrow();
  });

  test('the newline split uses the escaped form, not a raw newline', () => {
    // The bug shipped `split('\n')` inside a template literal, which Node turned
    // into a real newline. The correct served output is the escaped two-char
    // sequence backslash-n inside the quotes.
    expect(scriptBody).toContain("split('\\n')");
  });

  test('the script still wires up the session POST and the success redirect', () => {
    // Guard against accidentally gutting the bridge while fixing escaping.
    expect(scriptBody).toContain('/auth/oauth-session');
    expect(scriptBody).toContain("google_login=");   // built as '/?google_login=' + status
    expect(scriptBody).toContain("finish('success')");
    expect(scriptBody).toContain('setTimeout');       // the guaranteed timeout
  });
});

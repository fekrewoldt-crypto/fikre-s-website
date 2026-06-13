// Locks in the 2026-06-13 silent-refresh fix: when the in-memory
// access token expires (~1 hour) the wrapper trades the HttpOnly
// refresh cookie for a fresh token and retries the original request
// ONCE, so logged-in users aren't bounced to the login modal after
// every 401. String-level assertions only — no jsdom — because
// IIndex.html is a 9000-line script soup that JSDOM struggles with.
const fs = require('fs');
const path = require('path');

describe('Frontend: silent token refresh on 401', () => {
  let html;

  beforeAll(() => {
    const htmlPath = path.join(__dirname, '../IIndex.html');
    html = fs.readFileSync(htmlPath, 'utf8');
  });

  describe('Wrapper helpers exist', () => {
    it('defines window.authedFetch', () => {
      expect(html).toMatch(/window\.authedFetch\s*=\s*async\s+function/);
    });

    it('defines window.tryRefreshToken', () => {
      expect(html).toMatch(/window\.tryRefreshToken\s*=\s*async\s+function/);
    });

    it('tryRefreshToken hits /auth/refresh with credentials', () => {
      const fnMatch = html.match(/window\.tryRefreshToken\s*=\s*async\s+function[\s\S]*?\n\};/);
      expect(fnMatch).not.toBeNull();
      const fn = fnMatch[0];
      expect(fn).toMatch(/\/auth\/refresh/);
      expect(fn).toMatch(/method:\s*['"]POST['"]/);
      expect(fn).toMatch(/credentials:\s*['"]same-origin['"]/);
      // Must stash the new token so subsequent calls inherit it.
      expect(fn).toMatch(/window\.authToken\s*=\s*data\.token/);
    });
  });

  describe('authedFetch retries on 401 only', () => {
    let fnBody;

    beforeAll(() => {
      const m = html.match(/window\.authedFetch\s*=\s*async\s+function[\s\S]*?\n\};/);
      expect(m).not.toBeNull();
      fnBody = m[0];
    });

    it('returns the original response when status is not 401', () => {
      // The fall-through must check `!== 401` (not just `!ok`) so that
      // 403 (EMAIL_NOT_VERIFIED) is NOT retried — refresh won't help.
      expect(fnBody).toMatch(/res\.status\s*!==\s*401/);
    });

    it('does NOT call tryRefreshToken on a 403 path', () => {
      // No `=== 403` branch that triggers a refresh.
      expect(fnBody).not.toMatch(/status\s*===\s*403[\s\S]{0,100}tryRefreshToken/);
    });

    it('calls tryRefreshToken at most once and retries fetch at most once', () => {
      const refreshCalls = (fnBody.match(/tryRefreshToken\s*\(/g) || []).length;
      expect(refreshCalls).toBe(1);
      // Inside authedFetch: one initial fetch + one retry fetch = 2 fetch() calls.
      const fetchCalls = (fnBody.match(/\bfetch\s*\(/g) || []).length;
      expect(fetchCalls).toBe(2);
    });

    it('sets Authorization from window.authToken before retry', () => {
      // The retry must use the FRESH token, not the stale one in headers.
      expect(fnBody).toMatch(/options\.headers\[['"]Authorization['"]\]\s*=\s*['"]Bearer ['"]\s*\+\s*window\.authToken[\s\S]*return\s+fetch\(url,\s*options\)/);
    });
  });

  describe('Protected fetch sites converted to authedFetch', () => {
    // Each of these previously did `fetch(url, { headers: ...Bearer })`
    // and would pop the auth modal on 401. They now go through
    // authedFetch so a fresh refresh-cookie exchange happens silently.
    const protectedSites = [
      '/api/heatmap',
      '/api/profile',
      '/api/medicine-reminders',
      '/api/appointments',
    ];

    for (const site of protectedSites) {
      it(`${site} uses authedFetch`, () => {
        // Either a literal `authedFetch('/api/x'` or `authedFetch(\`/api/x/...`.
        const literal = new RegExp(`authedFetch\\(\\s*['"\`]${site.replace(/\//g, '\\/')}`);
        const template = new RegExp(`authedFetch\\(\\s*\`${site.replace(/\//g, '\\/')}`);
        expect(html.match(literal) || html.match(template)).toBeTruthy();
      });

      it(`${site} has NO leftover plain fetch with a Bearer header`, () => {
        // Scan a 200-char window after each plain `fetch('/api/x'` to
        // make sure none still attach an Authorization Bearer header.
        const escapedSite = site.replace(/\//g, '\\/');
        const re = new RegExp(`\\bfetch\\(\\s*['"\`]${escapedSite}[\\s\\S]{0,250}?Authorization`, 'g');
        const matches = html.match(re) || [];
        expect(matches).toEqual([]);
      });
    }

    it('chat endpoint (/api/chat via CHAT_URL) uses authedFetch', () => {
      expect(html).toMatch(/authedFetch\(\s*CHAT_URL/);
    });

    it('total authedFetch call sites (excluding the definition) is at least 11', () => {
      // 11 protected fetches converted: heatmap, chat, booking POST,
      // loadProfile GET, loadReminders GET, openEditReminderModal GET,
      // confirmDeleteReminder DELETE, reminder form POST/PUT, saveProfile
      // PUT, loadAppointments GET, cancelAppointment DELETE.
      const usages = html.match(/\bauthedFetch\s*\(/g) || [];
      // Filter out the definition itself: `window.authedFetch = async function(`
      // doesn't match `authedFetch(` so all hits are call sites.
      expect(usages.length).toBeGreaterThanOrEqual(11);
    });
  });

  describe('Public endpoints NOT wrapped', () => {
    // These must remain plain fetch() — they don't need a token and
    // wrapping them would add a needless refresh round-trip on errors.
    const publicSites = [
      '/api/analyze',
      '/api/health-news',
      '/api/status',
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/auth/logout',
      '/auth/google',
      '/auth/forgot-password',
      '/auth/resend-verification',
    ];

    for (const site of publicSites) {
      it(`${site} is NOT wrapped in authedFetch`, () => {
        const escapedSite = site.replace(/\//g, '\\/');
        const re = new RegExp(`authedFetch\\(\\s*['"\`]${escapedSite}`);
        expect(html).not.toMatch(re);
      });
    }

    it('SERVER_URL (/api/analyze constant) is NOT wrapped', () => {
      // /api/analyze is referenced via the SERVER_URL constant.
      expect(html).not.toMatch(/authedFetch\(\s*SERVER_URL/);
    });
  });
});

// Tests that auth routes are mounted exactly once (no duplicates)
const fs = require('fs');
const path = require('path');

describe('Route mounts in Server-v2.js', () => {
  let serverContent;

  beforeAll(() => {
    const serverPath = path.join(__dirname, '../Server-v2.js');
    serverContent = fs.readFileSync(serverPath, 'utf8');
  });

  function countMounts(pattern) {
    // Count occurrences of app.use with the given pattern
    // Only count non-commented lines (not preceded by // on same line)
    const lines = serverContent.split('\n');
    let count = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) continue; // skip commented lines
      if (trimmed.includes(`app.use('${pattern}'`) || trimmed.includes(`app.use("${pattern}"`)) {
        count++;
      }
    }
    return count;
  }

  it('mounts /api/heatmap exactly once', () => {
    // Sanity check: the heatmap API mount hasn't changed
    const count = countMounts('/api/heatmap');
    expect(count).toBe(1);
  });

  it('mounts auth routes exactly once (not duplicate routes)', () => {
    // /auth has 2 app.use calls: 1 for rate limiter, 1 for auth routes.
    // The key check: authRoutes is imported and mounted.
    const authRoutesImport = serverContent.includes("require('./auth/supabase-auth')") ||
                             serverContent.includes("require('./auth')");
    // Check that auth routes are mounted (not commented out)
    const hasAuthMount = /app\.use\s*\(\s*['"]\/auth['"]\s*,\s*authRoutes/.test(serverContent);
    expect(authRoutesImport).toBe(true);
    expect(hasAuthMount).toBe(true);
  });

  it('mounts timeline route exactly once (not duplicate)', () => {
    // /timeline has 2 app.use calls: 1 for rate limiter, 1 for timeline route with verifyToken.
    // Check timeline is protected by verifyToken
    const hasTimelineMount = /app\.use\s*\(\s*['"]\/timeline['"]\s*,\s*verifyToken/.test(serverContent);
    expect(hasTimelineMount).toBe(true);
  });

  it('does not mount /auth with authRoutes more than once', () => {
    const matches = serverContent.match(/app\.use\s*\(\s*['"]\/auth['"]\s*,\s*authRoutes/g) || [];
    expect(matches.length).toBe(1);
  });

  it('does not mount /timeline twice with same middleware', () => {
    const matches = serverContent.match(/app\.use\s*\(\s*['"]\/timeline['"]\s*,\s*verifyToken/g) || [];
    expect(matches.length).toBe(1);
  });

  it('mounts /auth with both apiLimiter and authRoutes', () => {
    // Verify /auth gets rate limiting before auth routes
    const lines = serverContent.split('\n');
    let authLimiterIndex = -1;
    let authRoutesIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/app\.use\s*\(\s*['"]\/auth['"]\s*,\s*apiLimiter/.test(lines[i])) {
        authLimiterIndex = i;
      }
      if (/app\.use\s*\(\s*['"]\/auth['"]\s*,\s*authRoutes/.test(lines[i])) {
        authRoutesIndex = i;
      }
    }
    expect(authLimiterIndex).toBeGreaterThan(-1);
    expect(authRoutesIndex).toBeGreaterThan(-1);
    expect(authLimiterIndex).toBeLessThan(authRoutesIndex);
  });

  it('mounts /timeline with both apiLimiter and verifyToken', () => {
    // Verify /timeline gets rate limiting before verifyToken + timeline
    const lines = serverContent.split('\n');
    let timelineLimiterIndex = -1;
    let timelineRoutesIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/app\.use\s*\(\s*['"]\/timeline['"]\s*,\s*apiLimiter/.test(lines[i])) {
        timelineLimiterIndex = i;
      }
      if (/app\.use\s*\(\s*['"]\/timeline['"]\s*,\s*verifyToken/.test(lines[i])) {
        timelineRoutesIndex = i;
      }
    }
    expect(timelineLimiterIndex).toBeGreaterThan(-1);
    expect(timelineRoutesIndex).toBeGreaterThan(-1);
    expect(timelineLimiterIndex).toBeLessThan(timelineRoutesIndex);
  });
});

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
    // Check that auth routes are imported and mounted with rate limiting
    const authRoutesImport = serverContent.includes("require('./auth/supabase-auth')") ||
                             serverContent.includes("require('./auth')");
    // /auth is mounted with apiLimiter, authRoutes (three args) — check that it's mounted via the
    // comma-separated pattern, not a comment
    const hasAuthMount = /app\.use\s*\(\s*['"]\/auth['"]\s*,\s*[/A-Za-z_$]/.test(serverContent);
    expect(authRoutesImport).toBe(true);
    expect(hasAuthMount).toBe(true);
  });

  it('mounts timeline route exactly once (not duplicate)', () => {
    // /timeline has apiLimiter, verifyToken + route (three args)
    const hasTimelineMount = /app\.use\s*\(\s*['"]\/timeline['"]\s*,\s*[/A-Za-z_$]/.test(serverContent);
    expect(hasTimelineMount).toBe(true);
  });

  it('does not mount /auth with authRoutes more than once', () => {
    // Count fully-qualified mount with authRoutes (the third arg in the middleware chain)
    const matches = serverContent.match(/app\.use\s*\(\s*['"]\/auth['"]\s*/g) || [];
    expect(matches.length).toBe(1);
  });

  it('does not mount /timeline twice with same middleware', () => {
    // Count mounts for /timeline
    const matches = serverContent.match(/app\.use\s*\(\s*['"]\/timeline['"]\s*/g) || [];
    expect(matches.length).toBe(1);
  });

  it('mounts /auth with both apiLimiter and authRoutes', () => {
    // Verify /auth gets rate limiting before auth routes
    // The mount line is: app.use('/auth', apiLimiter, authRoutes)
    const allLines = serverContent.split('\n');
    let authLineIndex = -1;
    let authHasApiLimiter = false;
    let authHasAuthRoutes = false;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (line.includes(`app.use('/auth'`) || line.includes('app.use("/auth"')) {
        authLineIndex = i;
        // Check the mount line for apiLimiter and authRoutes in the middleware chain
        const rest = allLines[i];
        authHasApiLimiter = rest.includes('apiLimiter');
        authHasAuthRoutes = rest.includes('authRoutes');
        break;
      }
    }

    expect(authLineIndex).toBeGreaterThan(-1);
    expect(authHasApiLimiter).toBe(true);
    expect(authHasAuthRoutes).toBe(true);
    // apiLimiter appears before authRoutes in the same line (middleware chain)
    const authLine = allLines[authLineIndex];
    const limiterPos = authLine.indexOf('apiLimiter');
    const routesPos = authLine.indexOf('authRoutes');
    expect(limiterPos).toBeGreaterThan(-1);
    expect(routesPos).toBeGreaterThan(-1);
    expect(limiterPos).toBeLessThan(routesPos);
  });

  it('mounts /timeline with both apiLimiter and verifyToken', () => {
    // Verify /timeline gets rate limiting before verifyToken + timeline
    // The mount line is: app.use('/timeline', apiLimiter, verifyToken, ...)
    const allLines = serverContent.split('\n');
    let timelineLineIndex = -1;
    let timelineHasApiLimiter = false;
    let timelineHasVerifyToken = false;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (line.includes(`app.use('/timeline'`) || line.includes('app.use("/timeline"')) {
        timelineLineIndex = i;
        const rest = allLines[i];
        timelineHasApiLimiter = rest.includes('apiLimiter');
        timelineHasVerifyToken = rest.includes('verifyToken');
        break;
      }
    }

    expect(timelineLineIndex).toBeGreaterThan(-1);
    expect(timelineHasApiLimiter).toBe(true);
    expect(timelineHasVerifyToken).toBe(true);
    // apiLimiter appears before verifyToken in the same line (middleware chain)
    const timelineLine = allLines[timelineLineIndex];
    const limiterPos = timelineLine.indexOf('apiLimiter');
    const verifyPos = timelineLine.indexOf('verifyToken');
    expect(limiterPos).toBeGreaterThan(-1);
    expect(verifyPos).toBeGreaterThan(-1);
    expect(limiterPos).toBeLessThan(verifyPos);
  });
});
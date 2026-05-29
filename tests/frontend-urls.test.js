// Tests that frontend uses relative URLs, not hardcoded localhost
const fs = require('fs');
const path = require('path');

describe('Frontend URL configuration in IIndex.html', () => {
  let htmlContent;

  beforeAll(() => {
    const htmlPath = path.join(__dirname, '../IIndex.html');
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  });

  it('does not contain hardcoded http://localhost URLs', () => {
    const localhostMatch = htmlContent.match(/https?:\/\/localhost:\d+/g) || [];
    expect(localhostMatch).toEqual([]);
  });

  it('does not contain http://127.0.0.1 URLs', () => {
    const localMatch = htmlContent.match(/https?:\/\/127\.0\.0\.1:\d+/g) || [];
    expect(localMatch).toEqual([]);
  });

  it('uses relative /api/analyze endpoint', () => {
    // Should have fetch('/api/analyze') or "/api/analyze"
    expect(htmlContent).toMatch(/\/api\/analyze/);
  });

  it('uses relative /api/chat endpoint', () => {
    expect(htmlContent).toMatch(/\/api\/chat/);
  });

  it('login/register endpoints use relative paths', () => {
    // Should reference /auth/login, /auth/register as relative URLs
    expect(htmlContent).toMatch(/\/auth\/login/);
    expect(htmlContent).toMatch(/\/auth\/register/);
  });

  it('does not hardcode port 3000 in API calls', () => {
    // Extract all fetch/XMLHttpRequest URLs
    const fetchUrls = htmlContent.match(/fetch\s*\(\s*['"`][^'"`]*/g) || [];
    const xhrUrls = htmlContent.match(/open\s*\(\s*['"`][^'"`]*|url\s*:\s*['"`][^'"`]*/gi) || [];
    const allUrls = [...fetchUrls, ...xhrUrls];

    const hardcodedPorts = allUrls.filter(url =>
      /https?:\/\/[^'"`]*:\d{4,}/.test(url)
    );

    expect(hardcodedPorts).toEqual([]);
  });
});
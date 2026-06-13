// Locks in the 2026-06-13 P2 UX polish fixes in IIndex.html.
// String-level assertions only (no jsdom). Each `it` corresponds to one of
// the seven polish fixes; if a future refactor drops the fix the test
// fails with a pointer to which behavior regressed.
const fs = require('fs');
const path = require('path');

describe('Frontend polish (IIndex.html)', () => {
  let html;
  let showToastFn;
  let analyzeFn;
  let sendChatFn;
  let domContentLoadedBlock;

  beforeAll(() => {
    const htmlPath = path.join(__dirname, '../IIndex.html');
    html = fs.readFileSync(htmlPath, 'utf8');

    const showToastMatch = html.match(/function showToast\(message[\s\S]*?\n\}/);
    showToastFn = showToastMatch ? showToastMatch[0] : '';

    const analyzeMatch = html.match(/async function analyze\(\)\s*\{[\s\S]*?HEATMAP SYNC AFTER ANALYSIS/);
    analyzeFn = analyzeMatch ? analyzeMatch[0] : '';

    const sendChatMatch = html.match(/async function sendChat\(\)\s*\{[\s\S]*?\n\}/);
    sendChatFn = sendChatMatch ? sendChatMatch[0] : '';

    const dclMatch = html.match(/window\.addEventListener\('DOMContentLoaded'[\s\S]*?\}\);/);
    domContentLoadedBlock = dclMatch ? dclMatch[0] : '';
  });

  // Fix 1 — i18n helper exists
  it('Fix 1: tr(key, fallback) helper is defined', () => {
    expect(html).toMatch(/function tr\(key, fallback\)/);
    expect(html).toMatch(/TRANSLATIONS\[currentLang\]/);
  });

  it('Fix 1: at least 5 showToast call sites use tr()', () => {
    const trToastSites = html.match(/showToast\(tr\(/g) || [];
    expect(trToastSites.length).toBeGreaterThanOrEqual(5);
  });

  // Fix 2 — iOS Safari zoom mitigation
  it('Fix 2: @media (max-width: 480px) forces 16px on inputs', () => {
    expect(html).toMatch(/@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?font-size:\s*16px/);
  });

  // Fix 3 — toast cap + dedup
  it('Fix 3: showToast caps the container and removes the oldest', () => {
    expect(showToastFn).not.toBe('');
    expect(showToastFn).toMatch(/firstElementChild\?\.remove\(\)/);
  });

  it('Fix 3: showToast dedups recent identical messages', () => {
    expect(showToastFn).toMatch(/_recentToasts/);
    expect(showToastFn).toMatch(/2000/);
  });

  // Fix 4 — strip ?google_login query
  it('Fix 4: handleGoogleLoginRedirect strips query via history.replaceState', () => {
    const handler = html.match(/async function handleGoogleLoginRedirect\(\)[\s\S]*?\n\}/);
    expect(handler).not.toBeNull();
    expect(handler[0]).toMatch(/history\.replaceState/);
  });

  // Fix 5 — offline detection
  it('Fix 5: navigator.onLine appears in boot listener + analyze + sendChat guards', () => {
    const occurrences = (html.match(/navigator\.onLine/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('Fix 5: initOfflineDetection registers both online and offline listeners', () => {
    expect(html).toMatch(/addEventListener\(['"]offline['"]/);
    expect(html).toMatch(/addEventListener\(['"]online['"]/);
  });

  it('Fix 5: analyze() bails when offline', () => {
    expect(analyzeFn).toMatch(/navigator\.onLine\s*===\s*false/);
  });

  it('Fix 5: sendChat() bails when offline', () => {
    expect(sendChatFn).toMatch(/navigator\.onLine\s*===\s*false/);
  });

  // Fix 6 — chat history persistence + chatContext separation
  it('Fix 6: chatHistory is persisted to sessionStorage', () => {
    expect(html).toMatch(/sessionStorage\.setItem\(CHAT_STORAGE_KEY/);
    expect(html).toMatch(/function persistChatHistory/);
    expect(html).toMatch(/function restoreChatHistory/);
  });

  it('Fix 6: chatContext is stored separately and prepended on each request', () => {
    expect(html).toMatch(/let chatContext\s*=/);
    expect(sendChatFn).toMatch(/chatContext/);
  });

  it('Fix 6: initChat seeds chatContext from primaryCondition, not the full result JSON', () => {
    const initChatMatch = html.match(/function initChat\(result\)\s*\{[\s\S]*?\n\}/);
    expect(initChatMatch).not.toBeNull();
    expect(initChatMatch[0]).toMatch(/chatContext\s*=/);
    expect(initChatMatch[0]).not.toMatch(/JSON\.stringify\(result\)/);
  });

  // Fix 7 — visualViewport keyboard handling
  it('Fix 7: visualViewport resize listener is registered', () => {
    expect(html).toMatch(/visualViewport/);
    expect(html).toMatch(/visualViewport\.addEventListener\(['"]resize['"]/);
  });

  it('Fix 7: keyboard-open detection scrolls chat input into view', () => {
    expect(html).toMatch(/scrollIntoView/);
  });

  // Boot — new init helpers wired into the single DOMContentLoaded handler
  it('DOMContentLoaded calls initOfflineDetection, initChatViewportFix, restoreChatHistory', () => {
    expect(domContentLoadedBlock).toMatch(/initOfflineDetection\(\)/);
    expect(domContentLoadedBlock).toMatch(/initChatViewportFix\(\)/);
    expect(domContentLoadedBlock).toMatch(/restoreChatHistory\(\)/);
  });
});

describe('locales/am.json polish keys', () => {
  let am;
  beforeAll(() => {
    const p = path.join(__dirname, '../locales/am.json');
    am = JSON.parse(fs.readFileSync(p, 'utf8'));
  });

  it('parses as valid JSON', () => {
    expect(typeof am).toBe('object');
    expect(am).not.toBeNull();
  });

  it('contains at least 5 of the 10 new toast keys', () => {
    const required = [
      'toast_network_error',
      'toast_server_error',
      'toast_session_expired',
      'toast_please_sign_in',
      'toast_email_not_verified',
      'toast_request_too_large',
      'toast_image_unsupported',
      'toast_demo_mode',
      'toast_copied',
      'toast_generic_error',
    ];
    const present = required.filter(k => typeof am[k] === 'string' && am[k].length > 0);
    expect(present.length).toBeGreaterThanOrEqual(5);
  });

  it('contains the offline_warning key', () => {
    expect(typeof am.offline_warning).toBe('string');
    expect(am.offline_warning.length).toBeGreaterThan(0);
  });
});

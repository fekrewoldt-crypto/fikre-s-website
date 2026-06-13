// Locks in the 2026-06-13 P1 UX hardening fixes in IIndex.html.
// String-level assertions only (no jsdom). Each `it` corresponds to one of
// the seven bugs in the audit; if a future refactor drops the fix the test
// fails with a pointer to which behavior regressed.
const fs = require('fs');
const path = require('path');

describe('Frontend UX hardening (IIndex.html)', () => {
  let html;
  let sendChatFn;
  let authedFetchFn;
  let processFileFn;
  let showResultsFn;
  let analyzeFn;
  let resendBlock;

  beforeAll(() => {
    const htmlPath = path.join(__dirname, '../IIndex.html');
    html = fs.readFileSync(htmlPath, 'utf8');

    const sendChatMatch = html.match(/async function sendChat\(\)\s*\{[\s\S]*?\n\}/);
    sendChatFn = sendChatMatch ? sendChatMatch[0] : '';

    const authedFetchMatch = html.match(/window\.authedFetch\s*=\s*async function[\s\S]*?\n\};/);
    authedFetchFn = authedFetchMatch ? authedFetchMatch[0] : '';

    const processFileMatch = html.match(/function processFile\(f\)\s*\{[\s\S]*?\n\}/);
    processFileFn = processFileMatch ? processFileMatch[0] : '';

    const showResultsMatch = html.match(/function showResults\(r\)\s*\{[\s\S]*?\n\}/);
    showResultsFn = showResultsMatch ? showResultsMatch[0] : '';

    // analyze() is long; capture everything up to the next top-level
    // section comment so we can run substring assertions against the body.
    const analyzeMatch = html.match(/async function analyze\(\)\s*\{[\s\S]*?HEATMAP SYNC AFTER ANALYSIS/);
    analyzeFn = analyzeMatch ? analyzeMatch[0] : '';

    // The resend-verification block lives inside showVerificationPending().
    const resendMatch = html.match(/const resendBtn = document\.getElementById\('auth-resend-btn'\);[\s\S]*?backBtn\.addEventListener/);
    resendBlock = resendMatch ? resendMatch[0] : '';
  });

  it('sendChat parsed out of source', () => {
    expect(sendChatFn).not.toBe('');
  });

  // Bug 1 — chat must not render auth errors as if the AI said them
  it('Bug 1: sendChat checks res.ok / res.status before reading data.reply', () => {
    expect(sendChatFn).toMatch(/res\.status\s*===\s*401/);
    expect(sendChatFn).toMatch(/!res\.ok/);
    // The old "data.reply || data.error" pattern leaked auth JSON. It must be gone.
    expect(sendChatFn).not.toMatch(/data\.reply\s*\|\|\s*data\.error/);
  });

  it('Bug 1: 401 in sendChat opens auth modal and removes typing bubble silently', () => {
    expect(sendChatFn).toMatch(/typing\.remove\(\)/);
    expect(sendChatFn).toMatch(/openAuthModal\(\)/);
  });

  // Bug 2 — authedFetch surfaces EMAIL_NOT_VERIFIED
  it('Bug 2: authedFetch handles EMAIL_NOT_VERIFIED', () => {
    expect(authedFetchFn).not.toBe('');
    expect(authedFetchFn).toMatch(/EMAIL_NOT_VERIFIED/);
    // Must use res.clone() so the caller can still read the body.
    expect(authedFetchFn).toMatch(/res\.clone\(\)/);
  });

  it('Bug 2: authedFetch still retries 401 once via tryRefreshToken', () => {
    expect(authedFetchFn).toMatch(/tryRefreshToken\(\)/);
  });

  // Bug 3 — resend button success branch re-enables and uses a cooldown
  it('Bug 3: resend success path re-enables the button (cooldown)', () => {
    expect(resendBlock).not.toBe('');
    // Either an explicit disabled=false or a cooldown that ends up enabling it.
    expect(resendBlock).toMatch(/startCooldown|resendBtn\.disabled\s*=\s*false/);
    // Look for the visible countdown text used by the new cooldown timer.
    expect(resendBlock).toMatch(/Resend in\s*\$\{/);
  });

  it('Bug 3: resend cooldown is at least 30 seconds', () => {
    expect(resendBlock).toMatch(/startCooldown\(30\)|setInterval[\s\S]*?1000/);
  });

  // Bug 4 — HEIC silent failure
  it('Bug 4: processFile installs img.onerror', () => {
    expect(processFileFn).not.toBe('');
    expect(processFileFn).toMatch(/img\.onerror\s*=/);
    // Toast must mention iPhone Settings → Camera → Formats for the user to fix it.
    expect(processFileFn).toMatch(/iPhone users/);
    expect(processFileFn).toMatch(/Most Compatible/);
  });

  // Bug 5 — demoMode server responses must be flagged in the UI
  it('Bug 5: showResults adds demo-mode class when demoMode === true', () => {
    expect(showResultsFn).not.toBe('');
    expect(showResultsFn).toMatch(/r\.demoMode\s*===\s*true/);
    expect(showResultsFn).toMatch(/classList\.add\(['"]demo-mode['"]\)/);
  });

  it('Bug 5: showResults injects a demo-mode warning banner', () => {
    expect(showResultsFn).toMatch(/demo-mode-banner/);
    expect(showResultsFn).toMatch(/demo result/i);
    expect(showResultsFn).toMatch(/AI services are currently unavailable/i);
  });

  // Bug 6 — analyzeInFlight / chatInFlight debounce
  it('Bug 6: analyzeInFlight flag declared at module scope', () => {
    expect(html).toMatch(/let\s+analyzeInFlight\s*=\s*false/);
  });

  it('Bug 6: analyze() short-circuits when in-flight and clears the flag in finally', () => {
    expect(analyzeFn).not.toBe('');
    expect(analyzeFn).toMatch(/if\s*\(analyzeInFlight\)\s*return/);
    expect(analyzeFn).toMatch(/analyzeInFlight\s*=\s*true/);
    expect(analyzeFn).toMatch(/}\s*finally\s*\{[\s\S]*?analyzeInFlight\s*=\s*false/);
    expect(analyzeFn).toMatch(/analyzeBtn\.disabled\s*=\s*true/);
  });

  it('Bug 6: sendChat short-circuits when in-flight', () => {
    expect(sendChatFn).toMatch(/if\s*\(chatInFlight\)\s*return/);
    expect(sendChatFn).toMatch(/chatInFlight\s*=\s*true/);
    expect(sendChatFn).toMatch(/}\s*finally\s*\{[\s\S]*?chatInFlight\s*=\s*false/);
  });

  // Bug 7 — /api/status cache TTL
  it('Bug 7: /api/status response is cached with a 60s TTL', () => {
    expect(html).toMatch(/API_STATUS_TTL_MS\s*=\s*60000/);
    expect(html).toMatch(/apiStatusCache/);
    // Reading the cache must short-circuit the fetch.
    expect(analyzeFn).toMatch(/apiStatusCache/);
  });
});

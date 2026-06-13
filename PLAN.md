# MediScan Comprehensive Fix Plan

**Date:** 2026-06-10
**Status:** Audit Complete -- Fixes Not Yet Applied

This document consolidates the findings from a full fan-out audit of the MediScan system. Tests pass locally (291/291) but real users experience failures in production. The root cause: the test suite runs in `NODE_ENV=test` using mocks, so production-only code paths (especially in auth, AI analysis, and the frontend runtime) are never exercised by tests.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [P0 Critical Bugs (Production-Blocking)](#p0-critical-bugs)
3. [P1 High Bugs (Major Degradation)](#p1-high-bugs)
4. [P2 Medium Bugs (Noticeable UX)](#p2-medium-bugs)
5. [P3 Low Bugs / Technical Debt](#p3-low-bugs)
6. [Phase-Based Fix Schedule](#phase-based-fix-schedule)
7. [Per-File Fix Checklist](#per-file-fix-checklist)
8. [Verification Steps](#verification-steps)
9. [Prevention (How to Avoid This Again)](#prevention)

---

## Executive Summary

| Category | Count | Summary |
|----------|-------|---------|
| P0 Critical | 4 | Break login, AI analysis, or all authenticated calls |
| P1 High | 5 | Major data loss, incorrect analysis, or production gaps |
| P2 Medium | 6 | Confusing UX, missing rate limits, minor data issues |
| P3 Low | 5 | Code smells, naming issues, edge cases |

**Root cause:** `NODE_ENV=test` bypasses all real Supabase, AI, and frontend runtime interactions. The test suite tests mocked logic but never touches the actual production paths that real users hit.

**The login system is broken** because two independent bugs (#1 and #2 below) prevent both Google OAuth and all authenticated API calls from working.

**The AI analysis is unreliable** because image-only submissions bypass the AI entirely, heatmap data is discarded, and the prompt structure confuses models.

---

## P0 Critical Bugs

### P0.1 -- OAuth `const user` Scope Crash (Breaks Google Login)

- **File:** `auth/supabase-auth.js`, lines 576-606
- **Bug:** `const user` is declared inside a `try` block but referenced after it closes. This causes `ReferenceError: user is not defined` on every successful Google OAuth login.
- **Impact:** Google login is completely broken. The spinner hangs forever.
- **Fix:** Move `const user = data.user;` to BEFORE the `try` block. Or declare `let user;` before the block and assign inside.

```javascript
// BEFORE (broken)
try {
  const { data, error } = await supabase.auth.getUser(access_token);
  const user = data.user;  // const scoped to try block
} catch (err) { ... }
// Code here references `user.id` -> ReferenceError: user is not defined

// AFTER (fixed)
let user;
try {
  const { data, error } = await supabase.auth.getUser(access_token);
  user = data.user;
} catch (err) { ... }
// Code here can now reference user.id and user.email
```

### P0.2 -- `window.getAuthHeaders` is Undefined (Breaks All Authenticated Calls)

- **File:** `IIndex.html` (global inline JS, multiple call sites)
- **Bug:** `window.getAuthHeaders()` is called throughout the file but never defined. Every authenticated `fetch` (chat, appointments, reminders, profile, heatmap) throws `TypeError: window.getAuthHeaders is not a function`.
- **Impact:** After login (if it ever works), no protected feature functions. Chat, appointments, reminders, profile, and heatmap all fail.
- **Fix:** Add a global function definition at the top of the inline JS block:

```javascript
window.getAuthHeaders = function() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.authToken) {
    headers['Authorization'] = 'Bearer ' + window.authToken;
  }
  return headers;
};
```

- **Affected call sites:**
  - `IIndex.html:5796` -- chat fetch
  - `IIndex.html:6236` -- submitBooking
  - `IIndex.html:6861` -- appointment API calls
  - `IIndex.html:8361` -- loadReminders
  - `IIndex.html:8678` -- medicine-reminder form submission
  - `IIndex.html:8535` -- edit-reminder fetch

### P0.3 -- `imageBase64` Nullified Before Text-Model Loop (Breaks Image Analysis)

- **File:** `Server-v2.js`, line 1101
- **Bug:** After NVIDIA vision processes the image, `imageBase64` is explicitly set to `null`. The subsequent model loop (for text-only models like Groq) skips all models because none support images when `imageBase64` is present. The fix for non-vision models already exists at line 1112-1118, but `imageBase64` is prematurely set to `null` before that logic.
- **Impact:** Patients who upload an image but have no text symptoms get the demo fallback instead of real AI analysis.
- **Fix:** Remove or move the `imageBase64 = null;` assignment. Or change the logic at 1112 to check a flag instead of `imageBase64`.

```javascript
// BEFORE (broken)
aggregatedPrompt = prompt;
imageBase64 = null;  // <-- this is wrong

// AFTER (fixed)
aggregatedPrompt = prompt;
// Let the loop at line 1112 handle image support naturally
```

### P0.4 -- Double System Prompt Confuses AI Models

- **File:** `IIndex.html:5431-5452` (frontend buildPrompt) + `Server-v2.js:829` (server system prompt)
- **Bug:** The frontend sends a prompt that starts with "You are an educational medical AI demonstration for a science fair project..." The server then wraps it as the `user` content with a system prompt saying "Respond ONLY with valid JSON." This creates a conflict: the user message claims to be a system prompt, and the model may get confused about expectations.
- **Impact:** Models may return malformed JSON or deviate from the expected schema, causing the response normalizer to fail and the demo fallback to trigger.
- **Fix:** The frontend should only send the user's actual input (symptoms, body area, context) without system-role framing. The server should prepend its system prompt. Alternatively, strip the frontend's system-role prefix before wrapping.

---

## P1 High Bugs

### P1.5 -- Heatmap Data Silently Discarded

- **File:** `Server-v2.js:1000-1001` and `1080-1098`
- **Bug:** The server destructures `bodyArea` (a single string) from `req.body` but ignores `bodyHeatmapData` and `bodyRegions`. The AI only sees a single body area string like "Head" instead of the rich multi-region heatmap data.
- **Fix:** Update the destructuring to include `bodyHeatmapData` and `bodyRegions`, then incorporate them into `aggregatedPrompt`.

### P1.6 -- `user_profiles` Never Created for Google OAuth Users

- **File:** `auth/supabase-auth.js` (OAuth session handler)
- **Bug:** `user_profiles` row creation only happens at `/auth/register`. Google OAuth users at `/auth/oauth-session` never get a row. Their role defaults to `'student'` and admin roles are impossible.
- **Fix:** After session validation in the OAuth handler, create a `user_profiles` row (handling 23505 duplicate key gracefully).

### P1.7 -- `hospitals-gondar.json` Not in Vercel Bundle

- **File:** `vercel.json` (includeFiles)
- **Bug:** `hospitals-gondar.json` is read at runtime but not included in the Vercel serverless function bundle. The try/catch swallows the error and returns an empty array.
- **Fix:** Add `"hospitals-gondar.json"` to `vercel.json` `includeFiles`.

### P1.8 -- Image Description Lost in Demo Fallback

- **File:** `Server-v2.js:501-511`
- **Bug:** `getMockDiagnosis()` only receives raw `symptoms` and `bodyArea`, not the `imageDescription` from the vision model. Image-only patients get generic "Viral Cold" for most unmatched cases.
- **Fix:** Pass `imageDescription` as a third parameter to `getMockDiagnosis()` and include it in keyword matching.

### P1.9 -- JWT Stored in `sessionStorage` for Google Login

- **File:** `IIndex.html:9131-9139`
- **Bug:** After Google OAuth, the token is briefly stored in `sessionStorage`. This violates the requirement (stated in CLAUDE.md) that JWT should be in JS memory only, never localStorage/sessionStorage.
- **Fix:** Pass the token directly via the URL hash, a one-time POST body, or another in-memory transfer method. Do not use `sessionStorage`.

---

## P2 Medium Bugs

### P2.10 -- Language Not Passed in Chat Request

- **File:** `IIndex.html:5796`
- **Bug:** The `/api/chat` request body is `{ prompt: fullPrompt }` with no `lang` field. The server defaults to `'en'`. Non mowing Amharic/Oromo/Tigrinya users get English responses after a correctly translated analysis.
- **Fix:** Add `lang: currentLang` to the request body.

### P2.11 -- Response Cache Key Missing `lang`

- **File:** `Server-v2.js:307-309`
- **Bug:** Cache key only includes `symptoms` and `bodyArea`. Translated responses are cached and reused across languages. An Amharic user's response might be served to an English user.
- **Fix:** Include `lang` in the cache key.

### P2.12 -- `/api/chat` Lacks Input Length Validation

- **File:** `Server-v2.js:1210`
- **Bug:** The `prompt` field is used directly without length cap. A user can send a 10MB prompt, consuming AI quota.
- **Fix:** Add validation: if `prompt.length > 2000`, return 400.

### P2.13 -- `/auth/verify-status` Has No Rate Limit

- **File:** `auth/supabase-auth.js:645`
- **Bug:** This endpoint accepts a valid token and leaks email verification status with no rate limit. A compromised token can be probed indefinitely.
- **Fix:** Apply `loginLimiter` or `apiLimiter` to this route.

### P2.14 -- Skeleton Persists on Auth Failure

- **File:** `IIndex.html:8751-8789` (loadAppointments), `IIndex.html:8342` (loadReminders)
- **Bug:** If the user is not authenticated, the loading skeleton is shown, then the function returns early without clearing it.
- **Fix:** If `!window.authToken`, replace the skeleton with a "Please log in" message before returning.

### P2.15 -- Greeting Uses Email Prefix, Never Actual Name

- **File:** `IIndex.html:5897-5900`
- **Bug:** `window.currentUser.name` is never populated. The greeting falls back to `email.split('@')[0]`.
- **Fix:** Populate `window.currentUser.name` from the user's profile data during login.

---

## P3 Low Bugs / Technical Debt

### P3.16 -- `emailConfirm: true` Comment is Misleading

- **File:** `auth/supabase-auth.js:148`
- **Bug:** The comment says "require email verification" but `emailConfirm: true` actually auto-confirms the email (skips confirmation). The behavior and comment contradict each other.
- **Fix:** Correct the comment or the flag.

### P3.17 -- UTF-8 Body Size Underestimated

- **File:** `Server-v2.js:1007-1009`
- **Bug:** `JSON.stringify(req.body).length` counts string characters, not UTF-8 bytes. Amharic and other multi-byte scripts underestimate size.
- **Fix:** Use `Buffer.byteLength(JSON.stringify(req.body), 'utf8')`.

### P3.18 -- `logout` Endpoint Not Authenticated

- **File:** `auth/supabase-auth.js:268`
- **Bug:** Anyone can hit `/auth/logout` and clear the refresh cookie. Harmless but unusual.
- **Fix:** Add `verifyToken` middleware.

### P3.19 -- Chat Shows Confusing Error for Unauthenticated Users

- **File:** `IIndex.html:5392`, `IIndex.html:5517`
- **Bug:** `initChat()` runs even when the user is not logged in. The server's /api/chat returns 401, but the frontend shows a generic error.
- **Fix:** Only call `initChat()` if the user is authenticated.

### P3.20 -- `/api/status` Frontend Mismatches Server

- **File:** `IIndex.html:5399-5410`
- **Bug:** The frontend checks `status.models.gemini.available`, `status.models.claude.available`, etc. The server only returns `groq`, `nvidia`, and `ollama`.
- **Fix:** Align frontend checks with server response keys.

---

## Phase-Based Fix Schedule

### Phase 1: Unblock Login (P0)

| Task | File | Effort |
|------|------|--------|
| Fix `const user` scope crash in OAuth session | `auth/supabase-auth.js` | 5 min |
| Define `window.getAuthHeaders` globally | `IIndex.html` | 5 min |
| Fix `imageBase64` nullification | `Server-v2.js` | 5 min |
| Remove double system prompt | `IIndex.html` + `Server-v2.js` | 10 min |
| *After Phase 1:* Run `npm test` to ensure no regressions | | 2 min |

### Phase 2: AI Analysis Quality (P1)

| Task | File | Effort |
|------|------|--------|
| Pass `bodyHeatmapData` in prompt | `Server-v2.js` | 15 min |
| Pass `imageDescription` to demo fallback | `Server-v2.js` | 10 min |
| Add `lang` to cache key | `Server-v2.js` | 5 min |
| Add `hospitals-gondar.json` to Vercel bundle | `vercel.json` | 2 min |
| Create `user_profiles` for Google OAuth | `auth/supabase-auth.js` | 10 min |
| Remove JWT from `sessionStorage` | `IIndex.html` | 10 min |
| *After Phase 2:* Deploy to staging and test with real image | | 15 min |

### Phase 3: UX Polish (P2)

| Task | File | Effort |
|------|------|--------|
| Pass `lang` in chat request | `IIndex.html` | 5 min |
| Rate-limit `verify-status` | `auth/supabase-auth.js` | 5 min |
| Add chat input length limit | `Server-v2.js` | 5 min |
| Fix skeleton persistence | `IIndex.html` | 10 min |
| Fix greeting name | `IIndex.html` | 5 min |

### Phase 4: Cleanup (P3)

| Task | File | Effort |
|------|------|--------|
| Fix `emailConfirm` comment | `auth/supabase-auth.js` | 2 min |
| Fix UTF-8 byte length check | `Server-v2.js` | 5 min |
| Authenticate `logout` endpoint | `auth/supabase-auth.js` | 5 min |
| Align `/api/status` frontend check | `IIndex.html` | 5 min |

---

## Per-File Fix Checklist

### `auth/supabase-auth.js`

- [ ] P0.1 -- Move `const user` declaration out of try block (OAuth session)
- [ ] P1.6 -- Create `user_profiles` row for Google OAuth logins
- [ ] P2.13 -- Add rate limit to `/auth/verify-status`
- [ ] P3.16 -- Correct `emailConfirm: true` comment
- [ ] P3.18 -- Add `verifyToken` to `/auth/logout`

### `auth/middleware-supabase.js`

- [ ] P0 -- `user.confirmed_at` does not exist; fix `pending` logic at line 669

### `Server-v2.js`

- [ ] P0.3 -- Remove or move `imageBase64 = null` at line 1101
- [ ] P0.4 -- Simplify/ strip frontend system prompt before wrapping
- [ ] P1.5 -- Read `bodyHeatmapData` and `bodyRegions` from req.body
- [ ] P1.8 -- Pass `imageDescription` to `getMockDiagnosis`
- [ ] P2.11 -- Add `lang` to response cache key
- [ ] P2.12 -- Add input length validation for `/api/chat`
- [ ] P3.17 -- Use `Buffer.byteLength` for body size check

### `IIndex.html`

- [ ] P0.2 -- Define `window.getAuthHeaders` globally
- [ ] P1.9 -- Remove JWT from `sessionStorage` in Google OAuth flow
- [ ] P2.10 -- Pass `lang` in chat request body
- [ ] P2.14 -- Fix loading skeleton on auth failure (appointments, reminders)
- [ ] P2.15 -- Populate `window.currentUser.name` during login
- [ ] P3.19 -- Only call `initChat()` for authenticated users
- [ ] P3.20 -- Align `/api/status` checks with server response keys

### `vercel.json`

- [ ] P1.7 -- Add `hospitals-gondar.json` to `includeFiles`

---

## Verification Steps

After applying patches, verify each fix:

1. **Login test**
   - [ ] Google OAuth login completes and redirects to app
   - [ ] Email-password login works
   - [ ] After login, `window.getAuthHeaders()` returns correct headers
   - [ ] Chat, appointments, reminders, profile all load successfully

2. **AI analysis test**
   - [ ] Upload an image with NO text symptoms → gets real AI analysis (not demo)
   - [ ] Select multiple heatmap regions → AI prompt includes region details
   - [ ] Amharic language → AI result and chat are in Amharic
   - [ ] Submit same request in English and Amharic → different cache keys (no cross-pollution)

3. **Production deployment test**
   - [ ] Deploy to Vercel staging
   - [ ] Facility recommendations appear in analysis results
   - [ ] Static assets (modules, images) load with 200 OK
   - [ ] Rate limits work as expected

4. **Regression test**
   - [ ] `npm test` still passes 291/291
   - [ ] `NODE_ENV=test` correctly bypasses real Supabase/AI

---

## Prevention

**Why these bugs existed:**

1. **Test-mode tunnel vision.** The suite runs in `NODE_ENV=test` with mocked Supabase/AI. Production-only code paths (OAuth session, real AI model loops, frontend runtime DOM) are never exercised.
2. **Frontend globals not checked.** `window.getAuthHeaders` was used but never defined, and no static analysis caught it because the file is a single inline HTML blob.
3. **Vercel-specific files not in bundle.** `hospitals-gondar.json` was added to the codebase but not to `includeFiles`.

**How to avoid this in the future:**

1. **Add integration tests that run in production mode.** Create a test script that boots the server with `NODE_ENV=production` and hits real endpoints (or a test Supabase project).
2. **Add a frontend health check.** A small script that loads `IIndex.html` into jsdom and checks for undefined globals (`window.getAuthHeaders`, etc.).
3. **Vercel bundle audit.** Before each deploy, run a script that checks all files referenced by `fs.readFileSync` or `express.static` are listed in `includeFiles`.
4. **End-to-end smoke tests.** Use Playwright to open the deployed site, log in, upload an image, and verify the result.

---

*Plan prepared by Claude after full fan-out audit of auth, API, frontend, and production deployment.*
*Next session: Apply fixes starting with Phase 1 (Unblock Login).*

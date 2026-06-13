# Real-User Bugs Fix Plan (2026-06-13)

Source: parallel sub-agent sweep across 5 user-flow areas. All findings carry file:line evidence; the two most explosive (OAuth ReferenceError, cross-user cache leak) were re-verified against source. Findings the existing test suite cannot catch because `NODE_ENV=test` shortcuts every external call.

Existing plans (`FIX-PLAN.md`, `PLAN.md`) cover structural and security work. This file is scoped to **runtime bugs that real users hit on https://fikre-s-website.vercel.app**.

---

## P0 — Showstoppers (every real user blocked)

### 1. Google OAuth is 100% broken in production
`auth/supabase-auth.js:577` reads `const user = data.user;` outside the try block where `data` is later destructured at line 582. Two stacked errors:
- Line 577 throws `ReferenceError: data is not defined` before the try block runs.
- Even if `data` existed, line 587 `user = data.user;` reassigns a `const`.

The `NODE_ENV === 'test'` shortcut returns at line 574, so `auth-google.test.js` never hits the broken code. **Every real Google sign-in returns HTTP 500 from `/auth/oauth-session`, the bridge page redirects to `/?google_login=error`, user sees "Could not complete sign in".**

**Fix**: declare `let user;` outside try, populate from the destructured `data` inside, return 500 only from catch. Add a Playwright or supertest assertion that hits the non-test path with mocked Supabase.

### 2. AI response cache leaks across users
`Server-v2.js:307-309` keys on `symptoms:bodyArea:lang`. Frontend sends heatmap data in separate fields `bodyHeatmapData` / `bodyRegions` (`IIndex.html:5437-5442`); when the heatmap is used, `selectedBody` is empty. **User A with chest-pain heatmap and user B with head-pain heatmap, both typing "headache", share a cache key. B receives A's diagnosis.**

**Fix**: include a stable hash of `bodyRegions` (sorted by area) in `getCacheKey`. Drop demo-mode and error responses from the cache (`setCached` at `Server-v2.js:1176` runs unconditionally on success path — verify it never caches `demoMode:true`). Add a regression test that varies `bodyRegions` and asserts distinct keys.

### 3. JWT silent expiry — every authenticated session dies after ~1 hour
Frontend only calls `/auth/refresh` once at boot (`IIndex.html:7118-7129`). Every 401 from a protected route jumps straight to `openAuthModal()` (e.g. `:8263, :8336, :8748`). HttpOnly refresh cookie remains valid but is never used after boot.

**User impact**: a student researching their profile, browsing reminders, or chatting with the doctor gets bounced to the login modal every hour. Forms in progress are lost.

**Fix**: wrap the fetch helper. On 401, attempt one `/auth/refresh`. If refresh succeeds, retry the original request with the new token. If it fails, open auth modal.

---

## P1 — Major user-facing failures

### 4. Chat: auth errors render as if the AI said them
`IIndex.html:5764-5776` does `data.reply || data.error || ...`. When JWT expires mid-conversation, the 403 body text `"Invalid or expired token"` is shown inside the chat bubble as a bot message. No 401/403 status check.

**Fix**: in `sendChat`, branch on `!res.ok`. Re-auth on 401, show clear "verify your email" prompt on 403 `EMAIL_NOT_VERIFIED`.

### 5. Auth UX: every Supabase login error becomes "Invalid email or password"
`auth/supabase-auth.js:237-241` collapses all errors. The `Email not confirmed` case is the worst — user has the right password, gets told it's wrong, tries password reset, gets a reset link that won't work.

**Fix**: map at least `Email not confirmed` to its own 403 with code `EMAIL_NOT_VERIFIED`. Frontend already handles a similar code from middleware — share the path.

### 6. EMAIL_NOT_VERIFIED 403 reaches no UI
`auth/middleware-supabase.js:87-92` returns `{code:'EMAIL_NOT_VERIFIED'}`. Frontend grep for that code returns zero matches. Users hit profile/reminders/appointments → see "Failed to load… try again" → retry forever.

**Fix**: add a single response interceptor for 403 + `EMAIL_NOT_VERIFIED` that opens the resend-verification UI.

### 7. Resend-verification button stays disabled after success
`IIndex.html:8159` disables; success branch at `:8172-8176` updates status but never re-enables. User clicks, email never arrives (spam filter / Supabase free tier), button is dead until they close + reopen the auth modal.

**Fix**: re-enable the button in success branch too. Add a 30s cooldown countdown if you want to prevent spam.

### 8. iPhone photos (HEIC) fail silently
`IIndex.html:4983-5007` reads as data URL, sets `img.src`, no `img.onerror`. Chrome/Firefox/Android cannot decode HEIC; `onload` never fires; no toast; `imageBase64` stays null or stale from a prior upload. **User taps "analyze", expecting their new photo to count, gets analysis of nothing or of the previous picture.**

**Fix**: add `img.onerror = () => showToast(...)`. Either reject HEIC up front with a friendly "iPhone? Set Camera → Format → Most Compatible" message, or use a HEIC decoder library.

### 9. Demo-mode responses are presented as real medical advice
`Server-v2.js:1199-1207` returns `demoMode:true, fallbackReason:'All AI models unavailable'`. Frontend at `IIndex.html:5574` always *removes* the `demo-mode` class on success. The amber-watermark CSS at `:698, :715` is never activated by server-driven `demoMode`. The only signal is the muted line "Analyzed with Demo mode (0ms)".

**User impact**: AI keys exhausted → user gets confident mock condition (`getMockDiagnosis` at `Server-v2.js:507`) with no banner. Real safety risk.

**Fix**: when `responseData.demoMode === true`, add the `demo-mode` class to results and render a clear "this is a demo result, not a diagnosis" banner. Disable the chat / next-steps CTA.

### 10. `normalizeAIResponse` silently downgrades high severity
`Server-v2.js:586` `String(r.severity || '').toLowerCase()`. If a model returns `severity: {level:"high"}` (object) or `["high"]` (array), the string becomes `"[object object]"` or `"high"` — falls through to keyword inference (`:610-618`) which defaults to `low`. **Urgent presentations show as low risk.**

Commit `f260d56` fixed object-shape handling for `primaryCondition`, `symptoms`, etc. — but missed `severity`.

**Fix**: extend the same hardening pass to `severity`. Test with each provider's known response shape.

### 11. `extractJSON` breaks on prose with stray braces before the real JSON
`Server-v2.js:515-521` slices from `indexOf('{')` to `lastIndexOf('}')`. NVIDIA gpt-oss-120b occasionally prefixes with `"(see {below} for details): { real json }"` — slice includes garbage prose, `JSON.parse` fails, fallback regex misses. Surfaces as "Analysis failed: AI returned malformed JSON".

**Fix**: try a strict-JSON-only parse first; on failure, walk braces with a depth counter (`{`/`}` matched, ignoring those inside strings) to find the first balanced JSON object.

### 12. No client-side fetch timeout, no Vercel function `maxDuration`
Zero `AbortController` in `IIndex.html`. `vercel.json` has no `maxDuration` set → Hobby plan default 10s. If Groq stalls 9s before throwing, NVIDIA tries next, function exceeds 10s, Vercel kills it, user sees Vercel-branded HTML where the client expected JSON → "Analysis failed: Unexpected token <".

**Fix**: set per-provider client timeouts (8s Groq, 8s NVIDIA) on the server. Add `AbortController` to client `fetch` with 15s overall budget. Set `vercel.json` function `maxDuration: 30` (Hobby allows up to 60s; verify your plan).

### 13. Analyze button has no debounce or in-flight guard
`IIndex.html:5320` registers `click`, `5326` registers keyboard shortcut. `analyzeBtn.disabled` is never set. Double-tap on flaky mobile fires 2-3 concurrent requests → burns `aiLimiter` (5/min) → user blocked from real attempts.

**Fix**: at the top of `analyze()`, check an `inFlight` flag, set it, set `analyzeBtn.disabled = true`, clear both in `finally`. Same for `sendChat`.

### 14. Cold start before analyze: `/api/status` is fetched first, no cache
`IIndex.html:5367-5379` awaits `/api/status` before every analyze. Adds 3-5s to the cold-start path and double-bills Vercel's 10s timeout window.

**Fix**: cache the status for 60s in memory. Or remove the gate entirely — `/api/analyze` returns a useful error if no model is available.

---

## P2 — UX / polish / safety hygiene

### 15. App chrome is English-only for am/om/ti users
60+ `showToast(...)` calls pass literal English. `locales/am.json` has `error_*` keys at lines 107-110 that are never referenced. MyMemory only translates AI result content. **Amharic users get a fully translated diagnosis with English error chrome — half-localized.**

**Fix**: wrap `showToast` to look up `TRANSLATIONS[currentLang][key]` first, fall back to English. Populate am/om/ti for the top 10 error strings.

### 16. iOS Safari input zoom on every focus
`.chat-input` 0.9rem (≈14.4px, `:913`), `.modal input` 0.95rem (`:1227`), `.auth-tab` 0.85rem (`:3368`). All below the 16px iOS no-zoom threshold. Viewport allows zoom. Every tap on chat or login zooms the page; user must pinch out manually.

**Fix**: bump all input/textarea/select font-size to `16px` on screens ≤ 480px (CSS media query). Keep visual rhythm with line-height.

### 17. Toast container has no cap or dedup
`IIndex.html:4584-4592` appends indefinitely. A retry loop or fast errors can stack 20+ toasts and lock the form on small screens.

**Fix**: cap container at 4 toasts; if a duplicate message comes in within 2s, increment a counter instead of stacking.

### 18. Provider names leak in `modelsAttempted`
`Server-v2.js:1184` pushes raw `error.message` (Groq SDK errors include "429 ... groq", model names). `Server-v2.js:1169` returns it as `modelsAttempted` in the JSON response.

**Fix**: in production, return only provider id (`"groq"`, `"nvidia"`), not error messages. Keep details in server logs.

### 19. Cancelled Google consent is shown as a scary configuration error
`auth/supabase-auth.js:481-488` bridge only inspects `window.location.hash`. Cancellation returns `?error=access_denied` in the query string — bridge falls through to a misconfig message.

**Fix**: in the inline bridge script, check `searchParams.get('error') === 'access_denied'` and redirect to `/?google_login=cancelled` with a friendly toast.

### 20. `SUPABASE_ANON_KEY` fallback to service key
`auth/supabase-auth.js:389-392` falls back to `SUPABASE_SERVICE_KEY` if `SUPABASE_ANON_KEY` is missing. `.env.example` and `CLAUDE.md` list only the service key, so production may be running without anon. Supabase rejects the service key for OAuth signin → `data.url` undefined → 500. Also: sending the service key to any client-bound OAuth path is a security smell.

**Fix**: error fast at startup if `SUPABASE_ANON_KEY` is unset. Document it in `.env.example` and `CLAUDE.md`. Verify it is configured in Vercel.

### 21. No `Vary: Origin` on CORS responses
`grep "Vary"` in `Server-v2.js` finds nothing. Vercel edge CDN may cache one origin's CORS headers for another.

**Fix**: middleware that sets `res.setHeader('Vary', 'Origin')` after `cors(...)`. Or pass `{ ... }` config to express-cors so it sets Vary automatically.

### 22. `?google_login=success` query persists in history, retoasts on back
`IIndex.html:9113` toasts on the query, no `history.replaceState`. Back-navigation re-fires the toast.

**Fix**: after handling, call `history.replaceState({}, '', '/')`.

### 23. No offline detection
Zero `navigator.onLine` references. Mobile users on intermittent 3G see "Analysis failed: Failed to fetch" with no indication their wifi dropped.

**Fix**: listen for `offline` / `online` events. Show a persistent banner when offline.

### 24. Chat history is in-memory only; full result JSON is the first user message
`IIndex.html:4596` `chatHistory = []`, no persistence. `:5727` seeds chatHistory[0] with `JSON.stringify(result)` (often 4-8 KB). Once `MAX_CHAT_HISTORY=20` trim evicts index 0, the model loses diagnosis context entirely. Refresh kills the conversation.

**Fix**: pin the seed message as a non-evictable "system context" or move it into the `system` prompt server-side. Optionally persist to sessionStorage so refresh keeps history.

### 25. Aggressive logout cookie clear may not match `Set-Cookie` flags on iOS
`auth/supabase-auth.js:272` calls `res.clearCookie('refreshToken')` with no options. Original Set-Cookie used `secure` + `sameSite:lax`. On iOS Safari, mismatched flags can cause `Clear-Cookie` to be ignored; "logged out" user reload silently re-authenticates.

**Fix**: pass the same `{ httpOnly:true, secure, sameSite:'lax', path:'/' }` to `clearCookie`.

### 26. Stack traces logged in production (Ethiopian DPP minimization)
`Server-v2.js:1543-1549` global handler always `console.error('Unhandled error:', err)` regardless of env. Vercel retains logs; if symptom text or PHI rides on the request, it sits in log retention.

**Fix**: in production, log a sanitized error (status, request id, message only). Strip request body from any structured logger.

### 27. Mobile keyboard pushes chat input off-screen
No `visualViewport` listener, no scroll-into-view on chat input focus. `.chat-messages` `max-height:380px` (`:880`, 320 mobile `:2216`). User cannot see what they type with the keyboard open.

**Fix**: on `chat-input` focus, scroll the form into view. Use `visualViewport.addEventListener('resize', ...)` to recalculate.

### 28. `/auth/oauth-session` does not set cookie when Supabase omits `refresh_token`
`auth/supabase-auth.js:588-594` is conditional. Supabase sometimes omits `refresh_token` on re-auth of a linked account. Without the cookie, next `/auth/refresh` returns 401, the access token expires in an hour, user logs out silently.

**Fix**: when `refresh_token` is absent and we already have a valid access token, set a shorter-lived cookie with just access_token, OR fall back to calling `supabase.auth.refreshSession()` from the server side to mint one, OR show the user "please sign in again next visit" with clear messaging.

---

## Not fixed — already addressed or intentionally out-of-scope

- Recent commit `a7a1486` fixed bridge-page error stringification (object → safe string). Verified: re-flag only if a new failure mode surfaces.
- Recent commit `60e6aef` improved bridge error path and mobile support.
- Recent commit `f260d56` hardened `normalizeAIResponse` for object-shape `primaryCondition`, `symptoms`, `nextSteps`, `alternatives`. Severity was not in that pass — covered by item 10 above.

---

## Execution order recommendation

1. **Same hour**: items 1 (OAuth ReferenceError), 2 (cache leak), 9 (demo-mode banner) — these are safety/privacy critical.
2. **Same day**: items 3 (silent JWT expiry), 4-7 (auth UX), 8 (HEIC), 10-12 (AI response/timeout), 13 (debounce).
3. **Same week**: items 14-28 — group by area, write tests for each.

For each P0/P1, add a Jest test that fails on the bug and passes after the fix. Most are currently invisible to the suite because of `NODE_ENV=test` shortcuts.

## Open questions before fixes ship

- Is `SUPABASE_ANON_KEY` set in Vercel? (Item 20 is moot if yes.)
- What Vercel plan? (Item 12 `maxDuration` cap depends on Hobby vs Pro.)
- Is chat usage common enough to warrant items 24/27, or is it a future bet?

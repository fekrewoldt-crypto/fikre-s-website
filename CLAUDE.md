# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**MediScan** — AI-powered medical diagnostic assistant. Won 1st place in Gondar city-wide secondary school software competition (May 2026). Clinical-grade personal health record system targeting students in Gondar, Ethiopia. Deployed at https://fikre-s-website.vercel.app/.

## Commands

```bash
npm install              # install dependencies
npm start                # run server on http://localhost:3000
npm run dev              # alias for start
npm test                 # run all Jest tests (12 suites, 284 tests)
npm test -- tests/auth-integration.test.js  # single test file
npm test -- -t "413"     # single test by name pattern
npm run vercel-build     # no-op for Vercel deploy
```

To run the server with a port other than 3000: `PORT=3001 npm start`. To run a fresh `node Server-v2.js` test session with dummy env vars, see the test-mode setup in `tests/setup.js` — it sets `NODE_ENV=test` which bypasses Supabase and the startup env-var check.

## Architecture

```
Browser (IIndex.html, ~9200 lines of inline CSS+JS)
  ↓
Vercel edge (CDN) → Express function (Server-v2.js, ~1584 lines)
  ↓
Multi-model AI fallback chain: Groq → NVIDIA → Gemini → Ollama → demo mode
  ↓
Supabase (PostgreSQL + Auth + RLS)
  ├── auth.users   — managed by Supabase Auth
  ├── records      — AES-256-GCM encrypted health data
  ├── profiles, appointments, medicine_reminders, doctors
  └── audit        — auth action logs
```

### Backend (Express)

`Server-v2.js` is the only entry point. Exports `createApp()` for tests. Vercel bundle includes root files explicitly listed in `vercel.json` `includeFiles` — anything not listed there 404s in production (see Vercel serverless gotchas below).

**Middleware order** (declared as a numbered comment sequence in `Server-v2.js`):
```
1. express.json({ limit: '4mb' })
2. entity.too.large handler → 413 JSON
3. inline cookie parser (populates req.cookies from the Cookie header)
4. CORS (allowlist from ALLOWED_ORIGINS)
5. helmet
6. CSRF protection (defined here, applied only on the /auth mount)
7. path-traversal rejection (.. and \0 in decoded path)
8. express.static(publicDir, { dotfiles: 'deny', index: false, maxAge: '5m' })
9. STATIC_CONTENT_TYPES / STATIC_ASSET_WHITELIST route handlers
   (explicit routes for /modules/:file, /locales/:file, and a regex for
   root-level PNG / CSS / JS assets)
10. request logging (NODE_ENV !== 'production')
11. /auth, /timeline, /api/* mounts
```

`tests/route-mounts.test.js` enforces that route mounts are non-duplicate and that `/auth` has `apiLimiter` before `authRoutes`. It does NOT lock the overall middleware order — keep that in sync by hand if you reorder.

**Routes (each is its own router file):**
- `auth/supabase-auth.js` — `/register`, `/login`, `/logout`, `/refresh`, `/forgot-password`, `/resend-verification`, `/verify-email`, `/verify-status`, `/google`, `/oauth-callback`, `/oauth-session`, `/callback` (legacy PKCE redirect)
- `timeline.js` (root) — protected, JWT-required
- `api/heatmap.js`, `api/profile.js`, `api/appointments.js`, `api/doctors.js`, `api/medicine-reminders.js` — each protected with `verifyToken` + `requireVerifiedEmail`
- `db/` — Supabase DAOs: `records-supabase.js` (AES-256-GCM encrypted), `audit-supabase.js`, `profiles.js`, `appointments.js`, `medicine-reminders.js`, `news.js`. `db/supabase.js` is the service-role client singleton. `db/migrations/` holds the SQL schema history; `db/migrations.sql.bak` is a one-off backup.

**Other API endpoints (defined inline in `Server-v2.js`):**
- `POST /api/analyze` — `aiLimiter` only (no JWT). Primary AI diagnostic endpoint.
- `POST /api/chat` — `aiLimiter` + `verifyToken` + `requireVerifiedEmail`. Authenticated follow-up chat.
- `GET /api/health-news` — public, no auth.
- `GET /api/health` — public liveness probe.
- `GET /api/status` — public service status.
- `GET /` — serves `IIndex.html` (the SPA).

**AI fallback** (`/api/analyze`): tries models in `MODEL_PRIORITY` order. If a model fails 3 times in a row it falls through to the next. Cached by symptom-hash for 1 hour (`responseCache` Map). `extractJSON()` parses AI responses and tolerates schema drift between providers; `normalizeAIResponse()` ensures the client always gets the same shape.

**Supabase Auth flow** (managed via `@supabase/supabase-js`):
1. `POST /auth/register` → `supabase.auth.signUp()` with `data: { role }` in user metadata. First user gets `admin` role.
2. `POST /auth/login` → `supabase.auth.signInWithPassword()` → returns `{ token: accessToken }` + sets HttpOnly refresh cookie.
3. Frontend stores `authToken` in JS memory only (never localStorage). All API calls use `Authorization: Bearer <token>`.
4. `POST /auth/refresh` → `supabase.auth.refreshSession({ refresh_token })` → new access token.
5. Google OAuth via `POST /auth/google` → returns Supabase OAuth URL → user bounces through Google → lands on `/auth/oauth-callback` (HTML bridge page) → POSTs session to `/auth/oauth-session` → redirected to `/?google_login=success`.

JWT verified server-side via `supabase.auth.getUser(token)` in `auth/middleware-supabase.js`.

### Frontend (Vanilla JS + Glassmorphism, no build step)

- **IIndex.html** — single-file app. Capital I is intentional, do not rename. Inline CSS (tokens, glassmorphism, premium motion/color vars) and inline JS (~176 KB across 4 script blocks). References modules via `<script src="modules/…">`. Loaded from root `/`.
- **API URLs** — always relative (`/api/analyze`, `/auth/login`). No `localhost:3000` references.
- **modules/** — vanilla ES6 class modules loaded as scripts (no bundler):
  - `heatmap-switcher.js` — orchestrator
  - `heatmap-state.js` — localStorage persistence
  - `body-heatmap.js` — ~10 standard regions
  - `body-heatmap-muscles.js` — ~70 muscle regions
  - `demo-body-heatmap-simple.js` — fallback UI
  - `nvidiaVisionClient.js` — vision API client
  - `translations.js` — i18n strings
- **prototype-*.html** — standalone UI experiments. Stable features get folded into `IIndex.html`.
- **timeline.js** — timeline visualization page (served at `/timeline.js`).
- **hospital-map.js / hospital-map.css** — Leaflet-based facility map.
- **hospitals-gondar.json** — static facility data.
- **locales/am.json** — Amharic overrides for MyMemory-translated content.

### Key patterns

- **TDD**: `tests/` is the source of truth for behaviour. New features ship RED → GREEN → refactor. Per-file `*.test.js` next to feature folders.
- **Supabase DAOs are async**: all DAO functions return Promises. Route handlers must `await`.
- **HeatmapSwitcher**: initialize with `await heatmap.init()`, get data with `heatmap.getEnhancedFormat()`.
- **Test-mode shortcuts**: `NODE_ENV=test` makes auth routes bypass Supabase (return mock users), DAO calls become no-ops, the timeline endpoint skips DB, and the auth middleware accepts any `test-token-*`. Lets the suite run in ~7s without external rate limits.
- **Factory app for testing**: `Server-v2.js` exports `createApp()` so each test file gets a fresh Express app with its own rate-limiter instance. No shared state between suites.
- **Inline cookie parser** (no `cookie-parser` dep): populates `req.cookies` from `Cookie` header.

## Vercel serverless gotchas

These are real bugs that only show up on the deployed URL, not under `node Server-v2.js` locally. They cost hours in 2026-06.

**1. Static files 404 unless explicitly bundled.** Vercel's `@vercel/node` doesn't include the project root in the function bundle. So `express.static(publicDir)` sees an empty directory. The fix:
- `vercel.json` → `builds[0].config.includeFiles` lists every PNG/CSS/JS that needs to ship.
- A `STATIC_ASSET_WHITELIST` in `Server-v2.js` plus explicit `/modules/:file`, `/locales/:file`, and root-asset routes serve them.
- Path-traversal middleware (`..` and `\0` rejection) sits in front; `dotfiles: 'deny'` keeps `.env` from leaking.
- **Any new PNG/JS/CSS asset at the project root must be added to BOTH `STATIC_ASSET_WHITELIST` (Server-v2.js) AND `includeFiles` (vercel.json).** Tests in `tests/static-files.test.js` enforce the whitelist side.

**2. Request bodies > ~4.5 MB are rejected at the edge with plain-text 413.** Vercel returns `FUNCTION_PAYLOAD_TOO_LARGE`. The frontend's `JSON.parse` fails and the raw text surfaces as "Analysis failed: Request Entity Too Large…" — looks like "Internal server error" to a user. Three layers of defence:
- Client: `compressImageToLimit()` in `IIndex.html` progressively shrinks JPEG to under 1.5 MB base64 before upload. Both `capturePhoto()` and `processFile()` use it.
- Server: `express.json({ limit: '4mb' })` matches Vercel's edge cap so local and prod behave the same. A custom `entity.too.large` handler returns clean JSON `{"error":"Image is too large…"}`.
- Frontend pre-flight: if `body.length > 4_000_000` before fetch, throw a friendly error. Plus detection of 413 / `FUNCTION_PAYLOAD_TOO_LARGE` in the response path.

**3. Supabase URL Configuration is the OAuth localhost trap.** If the user lands on `http://localhost:3000` after Google sign-in, the Supabase dashboard's `Site URL` and `Redirect URLs` allowlist are the cause — not our code. The fix is in the Supabase dashboard (Authentication → URL Configuration), not in this repo. The dynamic `redirectTo` we pass via `getOAuthCallbackUrl()` is correct on Vercel because `x-forwarded-host` is set; it gets silently dropped if Supabase's allowlist doesn't include it.

## Environment variables

```
# Supabase (required)
SUPABASE_URL=                  # e.g., https://iaylskrenjvcxjdywscv.supabase.co
SUPABASE_SERVICE_KEY=          # service-role key (server-side only)

# Encryption
DATA_ENC_KEY=                  # 64 hex chars (32 bytes) for AES-256-GCM record encryption

# AI models (at least one needed)
GEMINI_API_KEY=                # primary (gemini-2.0-flash)
GROQ_API_KEY=                  # secondary (llama-3.3-70b-versatile)
NVIDIA_API_KEY=                # text + vision
VISION_API_KEY=                # alt NVIDIA vision key (optional)

# Translation (MyMemory — automatic, no key required)
# Translates AI result content into am/om/ti based on the user's language.
# Free tier: 5,000 words/day per source IP, no key needed. Anonymous.

# Rate limiting
RATE_LIMIT_WINDOW=1            # minutes
RATE_LIMIT_MAX=20              # requests per window per IP
LOGIN_RATE_LIMIT_MAX=20        # /auth/login specific
AI_RATE_LIMIT_MAX=5            # /api/analyze specific

# CORS (comma-separated origins, or * for any)
ALLOWED_ORIGINS=https://fikre-s-website.vercel.app,http://localhost:3000

# OAuth (optional escape hatch)
APP_BASE_URL=                  # if set, getOAuthCallbackUrl() pins to this instead of x-forwarded-host
LOG_OAUTH=1                    # log resolved OAuth callback URL (visible in Vercel logs)

# Server
PORT=3000
NODE_ENV=production            # enables secure cookies, disables request logging
```

## Compliance

PHI (Personal Health Information) target is Ethiopian Data Protection Proclamation No. 132/2020:
- Health records encrypted at rest (AES-256-GCM, application layer)
- JWT access token stored in JS memory only (never localStorage)
- Refresh token in HttpOnly, Secure, sameSite=lax cookie
- All auth actions logged to `audit` table
- RLS policies enforce user isolation at the database level

## Testing

12 Jest suites, 284 tests, ~7s run time:
- `auth-integration.test.js`, `auth-middleware.test.js`, `auth-rate-limit.test.js`, `auth-google.test.js` — full auth flow incl. Google OAuth
- `api-analyze.test.js` — analyze endpoint + 413 body cap
- `api-heatmap.test.js`, `encryption.test.js`, `records.test.js`, `users.test.js` — data layer
- `route-mounts.test.js` — enforces that route mounts are non-duplicate and that `/auth` has `apiLimiter` before `authRoutes`
- `frontend-urls.test.js` — no `localhost:3000` references in IIndex.html
- `static-files.test.js` — whitelist + path-traversal protection

Each test file uses `createApp()` to get a fresh app with isolated rate-limiter state. `tests/setup.js` sets the test env vars and exports AES constants.

## File map (do not rename)

- `IIndex.html` — capital I is intentional (legacy filename); do not rename.
- `Server-v2.js` — current Express server. `Server.js` and `Server-free.js` are legacy, do not use.
- `modules/vista3d-client.js` — DELETED (was legacy 3D heatmap GPU client).
- `db/index.js`, `db/records.js`, `db/audit.js`, `db/users.js` — DELETED (SQLite era, replaced by Supabase DAOs).
- `data/` — DELETED (SQLite files).

## Known issues

None currently blocking. The two Vercel-only bugs (static 404s and analyze 413) and the Supabase OAuth localhost trap are all documented above and have tests guarding against regression.

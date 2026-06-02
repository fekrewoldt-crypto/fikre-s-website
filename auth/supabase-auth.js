// Supabase‑based authentication routes.
// Mirrors the original Express routes (register, login, logout, refresh) but
// delegates all user management to Supabase Auth. The response shape is kept
// identical to the original implementation so the frontend does not need to change.

require('dotenv').config();
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const supabase = require('../db/supabase');
const auditDAO = require('../db/audit-supabase');
// Simple in-memory user store for test mode
const testUsers = {};

// Helper: build the absolute OAuth callback URL for the current request.
// Used by the Google OAuth flow so Supabase can redirect back to the same
// origin (and port) the request came from.
//
// The order of preference is:
//   1. APP_BASE_URL env var, if set — lets ops pin a specific public URL
//      regardless of proxy headers. Useful when x-forwarded-host is being
//      stripped (e.g. some Cloudflare setups) or when the request is
//      reaching the function from a path that mangles the Host header.
//   2. x-forwarded-proto + x-forwarded-host (Vercel / most reverse proxies
//      set both).
//   3. req.protocol + req.headers.host (last resort).
function getOAuthCallbackUrl(req) {
  if (process.env.APP_BASE_URL) {
    try {
      const base = new URL(process.env.APP_BASE_URL);
      return `${base.protocol}//${base.host}/auth/oauth-callback`;
    } catch (_) { /* fall through to header-based detection */ }
  }
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}/auth/oauth-callback`;
}

// Per-router register limiter: more generous than the global apiLimiter
// so legitimate signups aren't blocked by login/refresh traffic sharing
// the same /auth namespace. 10 attempts per 5 minutes is enough for a
// user to fix typos without inviting brute-force abuse.
const registerLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many registration attempts. Please wait a few minutes and try again.'
});

// Login limiter: 20 attempts per minute matches the prior global apiLimiter
// behaviour that auth-rate-limit.test.js depends on.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.LOGIN_RATE_LIMIT_MAX
    ? parseInt(process.env.LOGIN_RATE_LIMIT_MAX)
    : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please wait a moment and try again.'
});

// Resend limiter: 5 per 10 minutes. Email sends cost real $$ from Supabase
// and we don't want a script to hammer this endpoint.
const resendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many resend attempts. Please wait a few minutes and try again.'
});

// Forgot-password limiter: 5 per 10 minutes. Same rationale as resend.
const forgotLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many password reset requests. Please wait a few minutes and try again.'
});

// ------------------------------------------------------------------
// Auto-admin helper: check if this is the first user in the system.
// Grants admin to the first user; subsequent users get 'student' role.
// If the profiles table check fails, defaults to admin (first user scenario).
// ------------------------------------------------------------------
async function determineInitialRole() {
  try {
    const { count, error } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true });
    // If count is 0 or query failed (table may not exist yet), grant admin
    if (error) {
      console.warn('Could not check profiles count, defaulting to admin:', error.message);
      return 'admin';
    }
    return count === 0 ? 'admin' : 'student';
  } catch (err) {
    console.warn('Profiles check error, defaulting to admin:', err.message);
    return 'admin';
  }
}

// ------------------------------------------------------------------
// Register – POST /auth/register
// Enables email confirmation flow. Supabase sends a verification email
// to the user. The user must click the confirmation link before full access.
// ------------------------------------------------------------------
router.post('/register', registerLimiter, async (req, res) => {
  const { email, password } = req.body;

  // Basic validation (same as original)
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\-_]).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ error: 'Password must include uppercase, lowercase, number, and a special character' });
  }

  try {
    // Determine role: first user gets admin, others get student
    const role = await determineInitialRole();

    // In test mode, bypass Supabase to avoid rate limits
    if (process.env.NODE_ENV === 'test') {
      const fakeUserId = 'test-user-' + Date.now();
      testUsers[email] = fakeUserId;
      // Skip audit logging in test mode
      return res.status(201).json({ userId: fakeUserId });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role }, // store role in user_metadata
        emailConfirm: true, // require email verification
      },
    });
    if (error) {
      // Supabase uses 400 for validation errors, 422 for invalid email/password, 429 for rate limit
      if (error.status === 400 || error.status === 422) {
        console.error('Supabase signUp validation error:', error.message);
        return res.status(400).json({ error: 'Invalid registration details' });
      }
      if (error.status === 409 || (error.message && error.message.toLowerCase().includes('already registered'))) {
        return res.status(409).json({ error: 'An account with this email may already exist' });
      }
      if (error.status === 429 || (error.message && error.message.includes('rate limit'))) {
        console.warn('Supabase rate limit hit on /auth/register');
        return res.status(429).json({
          error: 'Supabase is rate-limiting registrations. Please wait a few minutes and try again.'
        });
      }
      console.error('Supabase signUp error:', error);
      return res.status(500).json({ error: 'Registration failed, please try again' });
    }

    // The user ID is data.user.id
    const userId = data.user.id;
    const userEmail = data.user.email;

    // Check if email confirmation is required
    // If data.session is null, user needs to confirm email
    if (!data.session) {
      // Email confirmation required - Supabase sends verification email
      await auditDAO.logAction({ userId, action: 'register_pending_verification' });
      return res.status(201).json({
        userId,
        message: 'Registration successful. Please check your email to verify your account.',
        pendingVerification: true
      });
    }

    // Email already confirmed (can happen if "Confirm email" is disabled in Supabase)
    await auditDAO.logAction({ userId, action: 'register' });
    return res.status(201).json({ userId });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Login – POST /auth/login
// ------------------------------------------------------------------
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }
  try {
    // In test mode, simulate authentication against in‑memory store
    if (process.env.NODE_ENV === 'test') {
      const storedId = testUsers[email];
      if (!storedId) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const fakeToken = 'test-token-' + Date.now();
      // Set a dummy refresh cookie
      res.cookie('refreshToken', 'test-refresh-' + Date.now(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      return res.json({ token: fakeToken });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Supabase returns 400 for wrong credentials
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = data.user;
    // Create a short‑lived access token (15 min) – we reuse the JWT that Supabase issues
    // Supabase already encodes an exp claim, but we can enforce a custom TTL by
    // generating our own JWT if needed. For simplicity we forward the Supabase access_token.
    const accessToken = data.session.access_token;
    const refreshToken = data.session.refresh_token;

    await auditDAO.logAction({ userId: user.id, action: 'login' });

    // Set HttpOnly refresh cookie to match the original implementation
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return res.json({ token: accessToken });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Logout – POST /auth/logout
// ------------------------------------------------------------------
router.post('/logout', async (req, res) => {
  try {
    // Supabase does not have a direct logout endpoint; we simply clear the cookie.
    // Optionally you can revoke the refresh token via the admin API.
    res.clearCookie('refreshToken');
    return res.json({ message: 'logout' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Refresh – POST /auth/refresh
// ------------------------------------------------------------------
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  // In test mode, only provide a dummy token if a refresh cookie is present
  if (process.env.NODE_ENV === 'test') {
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }
    const newToken = 'test-token-' + Date.now();
    res.cookie('refreshToken', 'test-refresh-' + Date.now(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    return res.json({ token: newToken });
  }

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }
  try {
    // Use Supabase admin to refresh the session
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error) return res.status(401).json({ error: 'Session expired, please login again' });
    const newAccess = data.session.access_token;
    const newRefresh = data.session.refresh_token;
    // Reset cookie with new refresh token
    res.cookie('refreshToken', newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    return res.json({ token: newAccess });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Verify Email – GET /auth/verify-email
// Handles the email confirmation link from Supabase.
// Supabase redirects users to this endpoint after they click the
// confirmation link in the email.
// ------------------------------------------------------------------
router.get('/verify-email', async (req, res) => {
  // Supabase uses a hash fragment (#) which is not sent to the server.
  // Instead, we provide instructions on how to handle it.
  // In production, you would configure Supabase to redirect to your frontend
  // which then exchanges the token.
  //
  // For a proper implementation, set your Supabase email redirect URL to:
  // https://yourdomain.com/auth/callback
  // and handle the token exchange there.

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Email Verification</title>
  <style>
    body { font-family: 'DM Sans', sans-serif; background: linear-gradient(135deg, #e8f4ef, #d4edda); min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .container { background: white; padding: 3rem; border-radius: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    h1 { color: #1a6b4a; font-size: 1.5rem; margin-bottom: 1rem; }
    p { color: #6b6b60; line-height: 1.6; }
    .success { color: #1a6b4a; font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">&#10003;</div>
    <h1>Email Verified</h1>
    <p>Your email has been successfully verified. You can now close this page and use MediScan.</p>
  </div>
</body>
</html>
  `;
  res.send(html);
});

// ------------------------------------------------------------------
// Google OAuth – GET /auth/google
// Returns a Supabase-generated OAuth URL that the frontend redirects to.
// The user lands on Google's consent screen, then is bounced to
// /auth/oauth-callback with a session in the URL hash fragment.
// ------------------------------------------------------------------
router.get('/google', async (req, res) => {
  // Test-mode shortcut: skip the round-trip to Supabase and return a URL
  // that points at our local callback with a fake session in the hash.
  // This keeps the test suite independent of Supabase rate limits.
  if (process.env.NODE_ENV === 'test') {
    return res.json({
      url: '/auth/oauth-callback#access_token=test-google-token&refresh_token=test-google-refresh&provider=google'
    });
  }

  // Log the resolved callback URL so a misconfigured Supabase allowlist
  // (Site URL pointing at localhost, missing redirect URL) is visible in
  // Vercel logs. Most "OAuth lands on localhost" complaints trace to
  // Supabase's URL Configuration, not to this code.
  const callbackUrl = getOAuthCallbackUrl(req);
  if (process.env.NODE_ENV !== 'production' || process.env.LOG_OAUTH === '1') {
    console.log('[oauth/google] callback URL →', callbackUrl);
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const anonClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY
    );
    const { data, error } = await anonClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error || !data?.url) {
      console.error('Google OAuth URL error:', error?.message || 'no url returned');
      return res.status(500).json({ error: 'Could not start Google sign in' });
    }
    return res.json({ url: data.url });
  } catch (err) {
    console.error('Google OAuth error:', err);
    return res.status(500).json({ error: 'Could not start Google sign in' });
  }
});

// ------------------------------------------------------------------
// OAuth Callback Page – GET /auth/oauth-callback
// Serves a tiny HTML page that reads the session from the URL hash
// and posts it to /auth/oauth-session, which sets the HttpOnly refresh
// cookie and returns the access token. The page then redirects to /.
// ------------------------------------------------------------------
router.get('/oauth-callback', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Signing you in…</title>
  <style>
    body { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: linear-gradient(135deg, #e8f4ef, #d4edda); min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; color: #1a6b4a; }
    .container { text-align: center; padding: 2rem; }
    .spinner { width: 48px; height: 48px; border: 4px solid #cce8d9; border-top-color: #1a6b4a; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>Signing you in…</h1>
    <p>Completing your Google sign in.</p>
  </div>
  <script>
    (function() {
      function finish(status) {
        var target = '/?google_login=' + status;
        if (status === 'success') {
          // Slight delay so the cookie is set before the next page loads.
          setTimeout(function() { window.location.replace(target); }, 200);
        } else {
          window.location.replace(target);
        }
      }
      try {
        var hash = window.location.hash || '';
        if (hash.charAt(0) === '#') hash = hash.substring(1);
        var params = new URLSearchParams(hash);
        var accessToken = params.get('access_token');
        var refreshToken = params.get('refresh_token');
        if (!accessToken) { finish('missing_token'); return; }
        fetch('/auth/oauth-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken || '' })
        }).then(function(r) {
          if (!r.ok) return r.json().then(function(b) { throw new Error(b.error || 'session failed'); });
          return r.json();
        }).then(function(data) {
          if (data && data.token) {
            try { sessionStorage.setItem('mediscan_google_token', data.token); } catch (e) {}
            finish('success');
          } else {
            finish('invalid');
          }
        }).catch(function(err) {
          console.error('OAuth session error:', err);
          finish('error');
        });
      } catch (e) {
        console.error('OAuth callback error:', e);
        finish('error');
      }
    })();
  </script>
</body>
</html>`);
});

// ------------------------------------------------------------------
// OAuth Session – POST /auth/oauth-session
// Receives access_token + refresh_token from the OAuth callback page,
// sets the HttpOnly refresh cookie, returns the access token.
// ------------------------------------------------------------------
router.post('/oauth-session', async (req, res) => {
  const { access_token, refresh_token } = req.body || {};
  if (!access_token) {
    return res.status(400).json({ error: 'Missing access token' });
  }

  // Test-mode shortcut: accept any token starting with 'test-' and
  // return a fake session. Skips Supabase round-trip.
  if (process.env.NODE_ENV === 'test') {
    if (!access_token.startsWith('test-')) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    res.cookie('refreshToken', refresh_token || 'test-google-refresh', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    return res.json({ token: access_token, email: 'test-google@example.com' });
  }

  try {
    // Verify the access token by calling getUser; this also fetches the
    // canonical user object so we can record the audit entry and return
    // the email to the frontend.
    const { data, error } = await supabase.auth.getUser(access_token);
    if (error || !data?.user) {
      console.error('OAuth session verify error:', error?.message || 'no user');
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    const user = data.user;
    if (refresh_token) {
      res.cookie('refreshToken', refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    }
    await auditDAO.logAction({ userId: user.id, action: 'login_google' });
    return res.json({ token: access_token, email: user.email });
  } catch (err) {
    console.error('OAuth session error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Auth Callback – GET /auth/callback
// Receives the token from Supabase email confirmation redirect.
// Used when Supabase redirects back to the app with a token in the URL.
// ------------------------------------------------------------------
router.get('/callback', async (req, res) => {
  const { token, type } = req.query;

  if (!token || type !== 'signup') {
    return res.redirect('/?verification=invalid');
  }

  try {
    // Verify the token with Supabase
    const { data, error } = await supabase.auth.verifyOtp({
      type: 'signup',
      token: token
    });

    if (error) {
      console.error('OTP verification error:', error.message);
      return res.redirect('/?verification=error');
    }

    // Token verified successfully
    // Redirect to the app with success message
    res.redirect('/?verification=success');
  } catch (err) {
    console.error('Verification callback error:', err);
    res.redirect('/?verification=error');
  }
});

// ------------------------------------------------------------------
// Check Verification Status – GET /auth/verify-status
// Protected route. Checks if the current user's email is verified.
// ------------------------------------------------------------------
router.get('/verify-status', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // In test mode, simulate verified user
  if (process.env.NODE_ENV === 'test') {
    if (token.startsWith('test-token')) {
      return res.json({ verified: true, email: 'test@example.com' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const user = data.user;
    const emailConfirmed = user.email_confirmed_at !== null;
    const pending = !emailConfirmed && !user.confirmed_at;

    return res.json({
      verified: emailConfirmed,
      email: user.email,
      pending: !emailConfirmed,
      lastConfirmed: user.email_confirmed_at
    });
  } catch (err) {
    console.error('Verify status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Resend Verification Email – POST /auth/resend-verification
// Sends a new verification email to the user.
// ------------------------------------------------------------------
router.post('/resend-verification', resendLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // In test mode, simulate success
  if (process.env.NODE_ENV === 'test') {
    return res.json({ message: 'Verification email resent (test mode)' });
  }

  try {
    // Generate a new signup confirmation
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email
    });

    if (error) {
      console.error('Resend verification error:', error.message);
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    return res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (err) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------
// Forgot password – POST /auth/forgot-password
// Sends a password recovery email via Supabase. Always returns a
// generic success message to prevent email-enumeration attacks.
// ------------------------------------------------------------------
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const generic = { message: 'If an account exists for that email, a password reset link has been sent.' };

  // In test mode, simulate success without hitting Supabase
  if (process.env.NODE_ENV === 'test') {
    return res.json(generic);
  }

  try {
    // Build a redirect URL that lands the user back on the app.
    // The token will be in the URL hash, which the client picks up.
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectTo = `${proto}://${host}/`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      // Log the internal detail but never leak it to the caller.
      console.error('Reset password error:', error.message);
      // Still return generic to prevent enumeration
    }

    return res.json(generic);
  } catch (err) {
    console.error('Reset password error:', err);
    // Generic success even on internal error to prevent enumeration
    return res.json(generic);
  }
});

module.exports = router;
// Internal helpers exported only for unit tests; the router is what
// production code consumes.
module.exports._getOAuthCallbackUrl = getOAuthCallbackUrl;
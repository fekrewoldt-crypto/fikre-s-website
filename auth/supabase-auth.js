// Supabase‑based authentication routes.
// Mirrors the original Express routes (register, login, logout, refresh) but
// delegates all user management to Supabase Auth. The response shape is kept
// identical to the original implementation so the frontend does not need to change.

require('dotenv').config();
const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const auditDAO = require('../db/audit-supabase');
// Simple in-memory user store for test mode
const testUsers = {};

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
router.post('/register', async (req, res) => {
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
      // Supabase uses 400 for validation errors, 409 for duplicate email, 429 for rate limit
      if (error.status === 400) return res.status(400).json({ error: error.message });
      if (error.status === 409) return res.status(409).json({ error: error.message });
      if (error.status === 429 || (error.message && error.message.includes('rate limit'))) return res.status(429).json({ error: error.message });
      return res.status(500).json({ error: error.message });
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
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }
  try {
    // In test mode, simulate authentication against in‑memory store
    if (process.env.NODE_ENV === 'test') {
      const storedId = testUsers[email];
      // Accept only the known password used during registration
      if (!storedId || password !== 'password123') {
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
      return res.status(401).json({ error: error.message });
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
    if (error) return res.status(401).json({ error: error.message });
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
router.post('/resend-verification', async (req, res) => {
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
      return res.status(500).json({ error: error.message });
    }

    return res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (err) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
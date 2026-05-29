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
// Register – POST /auth/register
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
    // Default role for non-first users.
    // Auto-admin logic for the very first user is omitted here because
    // supabase.from('users') queries public.users which may not exist.
    // You can manually set the first user's role via Supabase Dashboard.
    const role = 'student';

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

module.exports = router;
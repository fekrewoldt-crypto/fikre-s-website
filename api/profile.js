const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth/middleware-supabase');
const { getProfile, updateProfile } = require('../db/profiles');

// GET /api/profile - Get current user's profile
router.get('/', verifyToken, async (req, res) => {
  try {
    const profile = await getProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PUT /api/profile - Update current user's profile
router.put('/', verifyToken, async (req, res) => {
  try {
    const allowedFields = [
      'full_name', 'phone', 'date_of_birth', 'gender', 'blood_type',
      'emergency_contact_name', 'emergency_contact_phone',
      'address', 'city', 'language_preference', 'notification_enabled'
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await updateProfile(req.user.id, updates);
    const profile = await getProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
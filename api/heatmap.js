// Heatmap persistence API (protected)
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth/middleware-supabase');
const recordsDAO = require('../db/records-supabase');
const auditDAO = require('../db/audit-supabase');

router.use(verifyToken);

// POST /api/heatmap - save current heatmap state for the user
router.post('/', async (req, res) => {
  const userId = req.user.id;
  const state = req.body; // Expected to be the object returned by HeatmapState.getEnhancedFormat()
  if (!state) {
    return res.status(400).json({ error: 'Missing heatmap state' });
  }
  try {
    // Store as a new record (could also update existing; simplified)
    const recordId = await recordsDAO.createRecord(userId, state);
    await auditDAO.logAction({ userId, action: 'save_heatmap', recordId });
    return res.status(201).json({ recordId });
  } catch (err) {
    console.error('Heatmap save error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

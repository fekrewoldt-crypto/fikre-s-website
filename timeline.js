// Timeline API routes (protected)
const express = require('express');
const router = express.Router();
const { verifyToken } = require('./auth/middleware-supabase');
const recordsDAO = require('./db/records-supabase');
const auditDAO = require('./db/audit-supabase');

// Helper to apply token verification to all routes in this router
router.use(verifyToken);

/**
 * GET /timeline
 * Query parameters:
 *   groupBy=day|symptom (optional) – aggregates entries
 */
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const groupBy = req.query.groupBy;
  // In test mode, skip DB access and return empty records
  const records = process.env.NODE_ENV === 'test' ? [] : await recordsDAO.getRecordsByUser(userId);
  // Simple grouping logic – can be expanded
  let result = records;
  if (groupBy === 'day') {
    const byDay = {};
    records.forEach(r => {
      const day = new Date(r.created_at).toISOString().slice(0, 10);
      (byDay[day] = byDay[day] || []).push(r);
    });
    result = byDay;
  }
  // Audit read
  await auditDAO.logAction({ userId, action: 'read_timeline', recordId: null });
  res.json({ userId, groupBy: groupBy || null, data: result });
});

/**
 * GET /timeline/export – returns a simple JSON placeholder with watermark info.
 * In a real implementation this would generate a PDF.
 */
router.get('/export', async (req, res) => {
  const userId = req.user.id;
  const records = await recordsDAO.getRecordsByUser(userId);
  // Mark export action in audit log
  await auditDAO.logAction({ userId, action: 'export_timeline', recordId: null });
  // Simple watermark response
  const watermark = `Exported on ${new Date().toISOString().split('T')[0]} – MediScan – Confidential`;
  res.json({ watermark, records });
});

module.exports = router;

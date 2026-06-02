const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth/middleware-supabase');
const { getReminders, createReminder, updateReminder, deleteReminder } = require('../db/medicine-reminders');

// UUID validation helper
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id) {
  if (!uuidRegex.test(id)) {
    return false;
  }
  return true;
}

// GET /api/medicine-reminders
router.get('/', verifyToken, async (req, res) => {
  try {
    const reminders = await getReminders(req.user.id);
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get reminders' });
  }
});

// GET /api/medicine-reminders/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    if (!validateUUID(req.params.id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    const { getReminderById } = require('../db/medicine-reminders');
    const reminder = await getReminderById(req.params.id, req.user.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get reminder' });
  }
});

// POST /api/medicine-reminders
router.post('/', verifyToken, async (req, res) => {
  try {
    const { medicine_name, dosage, frequency, times, start_date, end_date, notes } = req.body;
    if (!medicine_name) return res.status(400).json({ error: 'Medicine name required' });

    const reminder = await createReminder(req.user.id, {
      medicine_name, dosage, frequency, times, start_date, end_date, notes
    });
    res.status(201).json(reminder);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PUT /api/medicine-reminders/:id
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (!validateUUID(req.params.id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    await updateReminder(req.params.id, req.user.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /api/medicine-reminders/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!validateUUID(req.params.id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    await deleteReminder(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

module.exports = router;
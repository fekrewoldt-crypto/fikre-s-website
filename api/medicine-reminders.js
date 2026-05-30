const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth/middleware-supabase');
const { getReminders, createReminder, updateReminder, deleteReminder } = require('../db/medicine-reminders');

// GET /api/medicine-reminders
router.get('/', verifyToken, async (req, res) => {
  try {
    const reminders = await getReminders(req.user.id);
    res.json(reminders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get reminders' });
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
    await updateReminder(req.params.id, req.user.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /api/medicine-reminders/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await deleteReminder(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth/middleware-supabase');
const { getDoctors, getAppointments, createAppointment, cancelAppointment } = require('../db/appointments');

// GET /api/appointments/doctors - list all doctors
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await getDoctors();
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get doctors' });
  }
});

// GET /api/appointments - list user's appointments
router.get('/', verifyToken, async (req, res) => {
  try {
    const appointments = await getAppointments(req.user.id);
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get appointments' });
  }
});

// POST /api/appointments - book new appointment
router.post('/', verifyToken, async (req, res) => {
  try {
    const { doctor_id, appointment_date, time_slot, reason } = req.body;
    if (!doctor_id || !appointment_date || !time_slot) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const appointment = await createAppointment(req.user.id, {
      doctor_id, appointment_date, time_slot, reason, status: 'pending'
    });
    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// DELETE /api/appointments/:id - cancel appointment
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await cancelAppointment(req.params.id, req.user.id);
    res.json({ success: true, message: 'Appointment cancelled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../auth/middleware-supabase');
const { getDoctors, getDoctor } = require('../db/appointments');

// GET /api/doctors - List all doctors
router.get('/', verifyToken, async (req, res) => {
  try {
    const doctors = await getDoctors();
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get doctors' });
  }
});

// GET /api/doctors/:id - Get single doctor by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const doctor = await getDoctor(req.params.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    res.json(doctor);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get doctor' });
  }
});

module.exports = router;
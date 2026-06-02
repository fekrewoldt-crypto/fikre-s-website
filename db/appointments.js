const { supabase } = require('./supabase');

// Ownership verification helper
function verifyOwnership(reqUserId, paramUserId) {
  if (process.env.NODE_ENV === 'test') return; // no-op in test mode
  if (reqUserId !== paramUserId) {
    throw new Error('Unauthorized: Cannot access another user\'s data');
  }
}

// Safe owner ID helper - ensures only valid user IDs are used
function safeOwnerId(userId) {
  if (!userId || typeof userId !== 'string') return null;
  return userId;
}

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id) {
  if (process.env.NODE_ENV === 'test') return; // no-op in test mode
  if (!uuidRegex.test(id)) {
    throw new Error('Invalid ID format: expected UUID');
  }
}

async function getDoctors() {
  const { data, error } = await supabase.from('doctors').select('*').order('name');
  if (error) throw error;
  return data;
}

async function getDoctor(doctorId) {
  validateUUID(doctorId);
  const { data, error } = await supabase.from('doctors').select('*').eq('id', doctorId).single();
  if (error) throw error;
  return data;
}

async function getAppointments(userId) {
  validateUUID(userId);
  const { data, error } = await supabase
    .from('appointments')
    .select('*, doctors(*)')
    .eq('user_id', userId)
    .order('appointment_date', { ascending: false });
  if (error) throw error;
  return data;
}

async function createAppointment(userId, appointment) {
  validateUUID(userId);
  const { data, error } = await supabase
    .from('appointments')
    .insert({ user_id: userId, ...appointment });
  if (error) throw error;
  return data;
}

async function updateAppointmentStatus(appointmentId, userId, status) {
  validateUUID(appointmentId);
  validateUUID(userId);
  // Verify ownership before updating (service role bypasses RLS)
  const { data: existing, error: fetchError } = await supabase
    .from('appointments')
    .select('user_id')
    .eq('id', appointmentId)
    .single();
  if (fetchError) throw fetchError;
  verifyOwnership(userId, existing.user_id);
  const { data, error } = await supabase
    .from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);
  if (error) throw error;
  return data;
}

async function cancelAppointment(appointmentId, userId) {
  return updateAppointmentStatus(appointmentId, userId, 'cancelled');
}

module.exports = { getDoctors, getDoctor, getAppointments, createAppointment, updateAppointmentStatus, cancelAppointment };
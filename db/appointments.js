const { supabase } = require('./supabase');

async function getDoctors() {
  const { data, error } = await supabase.from('doctors').select('*').order('name');
  if (error) throw error;
  return data;
}

async function getDoctor(doctorId) {
  const { data, error } = await supabase.from('doctors').select('*').eq('id', doctorId).single();
  if (error) throw error;
  return data;
}

async function getAppointments(userId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, doctors(*)')
    .eq('user_id', userId)
    .order('appointment_date', { ascending: false });
  if (error) throw error;
  return data;
}

async function createAppointment(userId, appointment) {
  const { data, error } = await supabase
    .from('appointments')
    .insert({ user_id: userId, ...appointment });
  if (error) throw error;
  return data;
}

async function updateAppointmentStatus(appointmentId, userId, status) {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

async function cancelAppointment(appointmentId, userId) {
  return updateAppointmentStatus(appointmentId, userId, 'cancelled');
}

module.exports = { getDoctors, getDoctor, getAppointments, createAppointment, updateAppointmentStatus, cancelAppointment };
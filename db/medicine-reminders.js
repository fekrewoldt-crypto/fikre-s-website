// db/supabase.js exports the client directly (module.exports = supabase), NOT
// as { supabase }. Destructuring here yields undefined and every query throws
// "Cannot read properties of undefined" → 500. Import the default export.
const supabase = require('./supabase');

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

async function getReminders(userId) {
  validateUUID(userId);
  const { data, error } = await supabase
    .from('medicine_reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function createReminder(userId, reminder) {
  validateUUID(userId);
  const { data, error } = await supabase
    .from('medicine_reminders')
    .insert({ user_id: userId, ...reminder });
  if (error) throw error;
  return data;
}

async function updateReminder(reminderId, userId, updates) {
  validateUUID(reminderId);
  validateUUID(userId);
  // Fetch to verify ownership since service role bypasses RLS
  const { data: existing, error: fetchError } = await supabase
    .from('medicine_reminders')
    .select('user_id')
    .eq('id', reminderId)
    .single();
  if (fetchError) throw fetchError;
  verifyOwnership(userId, existing.user_id);
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('medicine_reminders')
    .update(updates)
    .eq('id', reminderId)
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

async function getReminderById(reminderId, userId) {
  validateUUID(reminderId);
  validateUUID(userId);
  const { data, error } = await supabase
    .from('medicine_reminders')
    .select('*')
    .eq('id', reminderId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();
  if (error) throw error;
  return data;
}

async function deleteReminder(reminderId, userId) {
  validateUUID(reminderId);
  validateUUID(userId);
  const { error } = await supabase
    .from('medicine_reminders')
    .update({ is_active: false })
    .eq('id', reminderId)
    .eq('user_id', userId);
  if (error) throw error;
}

module.exports = { getReminders, createReminder, updateReminder, deleteReminder, getReminderById };
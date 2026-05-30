const { supabase } = require('./supabase');

async function getReminders(userId) {
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
  const { data, error } = await supabase
    .from('medicine_reminders')
    .insert({ user_id: userId, ...reminder });
  if (error) throw error;
  return data;
}

async function updateReminder(reminderId, userId, updates) {
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('medicine_reminders')
    .update(updates)
    .eq('id', reminderId)
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

async function deleteReminder(reminderId, userId) {
  const { error } = await supabase
    .from('medicine_reminders')
    .update({ is_active: false })
    .eq('id', reminderId)
    .eq('user_id', userId);
  if (error) throw error;
}

module.exports = { getReminders, createReminder, updateReminder, deleteReminder };
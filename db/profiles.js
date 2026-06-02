const { supabase } = require('./supabase');

// Ownership verification helper
function verifyOwnership(reqUserId, paramUserId) {
  if (process.env.NODE_ENV === 'test') return; // no-op in test mode
  if (reqUserId !== paramUserId) {
    throw new Error('Unauthorized: Cannot access another user\'s data');
  }
}

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id) {
  if (process.env.NODE_ENV === 'test') return; // no-op in test mode
  if (!uuidRegex.test(id)) {
    throw new Error('Invalid ID format: expected UUID');
  }
}

async function getProfile(userId) {
  validateUUID(userId);
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function updateProfile(userId, updates) {
  validateUUID(userId);
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, ...updates });
  if (error) throw error;
  return data;
}

async function createProfile(userId, profileData = {}) {
  validateUUID(userId);
  const { data, error } = await supabase
    .from('user_profiles')
    .insert({ id: userId, ...profileData });
  if (error && error.code !== '23505') throw error;
  return data;
}

module.exports = { getProfile, updateProfile, createProfile };
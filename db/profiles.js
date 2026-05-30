const { supabase } = require('./supabase');

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function updateProfile(userId, updates) {
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, ...updates });
  if (error) throw error;
  return data;
}

async function createProfile(userId, profileData = {}) {
  const { data, error } = await supabase
    .from('user_profiles')
    .insert({ id: userId, ...profileData });
  if (error && error.code !== '23505') throw error;
  return data;
}

module.exports = { getProfile, updateProfile, createProfile };
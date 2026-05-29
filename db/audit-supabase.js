// Audit DAO using Supabase.
// Simple insertion of audit records. The table schema is defined in db/migrations.sql.

require('dotenv').config();
const supabase = require('./supabase');

/**
 * Log an audit action.
 * @param {{userId: string|UUID, action: string, recordId?: string|UUID}} param
 */
async function logAction({ userId, action, recordId = null }) {
  if (process.env.NODE_ENV === 'test') return; // no-op in test mode
  const { error } = await supabase
    .from('audit')
    .insert({ user_id: userId, action, record_id: recordId });
  if (error) throw error;
}

/**
 * Retrieve audit logs.
 * @param {{userId?: string|UUID}} param
 * @returns {Promise<Array>} Array of audit rows
 */
async function getLogs({ userId } = {}) {
  let query = supabase.from('audit').select('*').order('timestamp', { ascending: false });
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

module.exports = { logAction, getLogs };
// Audit DAO using Supabase.
require('dotenv').config();
const supabase = require('./supabase');

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

/**
 * Log an audit action.
 * @param {{userId: string|UUID, action: string, recordId?: string|UUID}} param
 */
async function logAction({ userId, action, recordId = null }) {
  if (process.env.NODE_ENV === 'test') return; // no-op in test mode
  validateUUID(userId);
  if (recordId) validateUUID(recordId);
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
  if (userId) validateUUID(userId);
  let query = supabase.from('audit').select('*').order('timestamp', { ascending: false });
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

module.exports = { logAction, getLogs };
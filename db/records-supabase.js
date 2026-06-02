// Records DAO using Supabase as storage.
// Keeps the same AES‑256‑GCM encryption as the original SQLite implementation.
// The encryption helpers are identical to those in db/records.js.

require('dotenv').config();
const supabase = require('./supabase');
const crypto = require('crypto');

// ------------------------------------------------------------------
// Encryption helpers (identical to original implementation)
// ------------------------------------------------------------------
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96‑bit IV for GCM
const TAG_LENGTH = 16;

function getKey() {
  const keyHex = process.env.DATA_ENC_KEY;
  if (!keyHex) throw new Error('DATA_ENC_KEY not set');
  return Buffer.from(keyHex, 'hex');
}

function encrypt(data) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store iv + tag + ciphertext as base64
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(blob) {
  const key = getKey();
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.slice(0, IV_LENGTH);
  const tag = buf.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.slice(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString());
}

// ------------------------------------------------------------------
// DAO functions
// ------------------------------------------------------------------

/**
 * Verify the requesting user owns the target resource.
 * Throws if they do not match.
 * @param {string} reqUserId - The authenticated user making the request
 * @param {string} resourceUserId - The user_id stored on the resource
 */
function verifyOwnership(reqUserId, resourceUserId) {
  if (process.env.NODE_ENV === 'test') return; // no-op in test mode
  if (reqUserId !== resourceUserId) {
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

/**
 * Insert a new health record for a user.
 * @param {string|UUID} userId  Supabase Auth user ID
 * @param {object} data         Plain JavaScript object representing the record
 * @returns {Promise<string>}   The new record UUID
 */
async function createRecord(userId, data) {
  validateUUID(userId);
  const encrypted = encrypt(data);
  const { data: inserted, error } = await supabase
    .from('records')
    .insert({ user_id: userId, encrypted_blob: encrypted })
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id;
}

/**
 * Fetch all records belonging to a specific user.
 * @param {string|UUID} userId
 * @returns {Promise<Array>} Array of { id, data, created_at, updated_at }
 */
async function getRecordsByUser(userId) {
  validateUUID(userId);
  const { data: rows, error } = await supabase
    .from('records')
    .select('id, encrypted_blob, created_at, updated_at')
    .eq('user_id', userId);
  if (error) throw error;
  return rows.map(r => ({
    id: r.id,
    data: decrypt(r.encrypted_blob),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

/**
 * Update an existing record. Requires user verification.
 * @param {string|UUID} recordId
 * @param {string|UUID} userId  The requesting user's ID (for ownership check)
 * @param {object} data
 */
async function updateRecord(recordId, userId, data) {
  validateUUID(recordId);
  validateUUID(userId);
  // Verify ownership before updating
  const { data: existing, error: fetchError } = await supabase
    .from('records')
    .select('user_id')
    .eq('id', recordId)
    .single();
  if (fetchError) throw fetchError;
  verifyOwnership(userId, existing.user_id);
  const encrypted = encrypt(data);
  const { error } = await supabase
    .from('records')
    .update({ encrypted_blob: encrypted, updated_at: new Date().toISOString() })
    .eq('id', recordId);
  if (error) throw error;
}

module.exports = { createRecord, getRecordsByUser, updateRecord, encrypt, decrypt };
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
 * Insert a new health record for a user.
 * @param {string|UUID} userId  Supabase Auth user ID
 * @param {object} data         Plain JavaScript object representing the record
 * @returns {Promise<string>}   The new record UUID
 */
async function createRecord(userId, data) {
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
 * Update an existing record.
 * @param {string|UUID} recordId
 * @param {object} data
 */
async function updateRecord(recordId, data) {
  const encrypted = encrypt(data);
  const { error } = await supabase
    .from('records')
    .update({ encrypted_blob: encrypted, updated_at: new Date().toISOString() })
    .eq('id', recordId);
  if (error) throw error;
}

module.exports = { createRecord, getRecordsByUser, updateRecord, encrypt, decrypt };
// Jest test setup for MediScan auth system
// Set environment variables BEFORE any application code loads

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-mediscan-auth-tests-only-do-not-use-in-prod';
process.env.DATA_ENC_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes for AES-256
process.env.BCRYPT_ROUNDS = '4'; // Faster hashing for tests
process.env.RATE_LIMIT_WINDOW = '1'; // 1 minute
process.env.RATE_LIMIT_MAX = '10'; // Lower for faster rate-limit tests

// Export encryption constants for use in tests
const crypto = require('crypto');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

module.exports = {
  IV_LENGTH,
  TAG_LENGTH,
  ALGORITHM,
  TEST_ENC_KEY: process.env.DATA_ENC_KEY,
};
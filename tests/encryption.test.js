// Comprehensive tests for AES-256-GCM encryption in records-supabase.js

// Use the test setup to configure environment BEFORE other modules
const { IV_LENGTH, TAG_LENGTH } = require('./setup');
require('./setup');

const { encrypt, decrypt } = require('../db/records-supabase');

describe('Encryption (AES-256-GCM)', () => {
  describe('round-trip encryption/decryption', () => {
    it('encrypt() then decrypt() returns original data', () => {
      const original = { name: 'John Doe', age: 30, active: true };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
      expect(decrypted.name).toBe('John Doe');
      expect(decrypted.age).toBe(30);
      expect(decrypted.active).toBe(true);
    });

    it('round-trip works with deeply nested objects', () => {
      const original = {
        user: {
          profile: {
            name: 'Alice',
            settings: {
              notifications: true,
              theme: 'dark',
            },
          },
        },
        records: [{ id: 1 }, { id: 2 }],
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
      expect(decrypted.user.profile.name).toBe('Alice');
      expect(decrypted.user.profile.settings.theme).toBe('dark');
      expect(decrypted.records).toHaveLength(2);
    });

    it('round-trip works with large arrays', () => {
      const original = {
        items: Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item-${i}` })),
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
      expect(decrypted.items).toHaveLength(100);
      expect(decrypted.items[99].value).toBe('item-99');
    });
  });

  describe('unique IVs (ciphertext uniqueness)', () => {
    it('encrypting same data twice produces different ciphertext', () => {
      const data = { id: '12345', type: 'test' };

      const encrypted1 = encrypt(data);
      const encrypted2 = encrypt(data);

      // Ciphertexts should be different
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same original data
      expect(decrypt(encrypted1)).toEqual(data);
      expect(decrypt(encrypted2)).toEqual(data);
    });

    it('multiple encryptions of empty object produce unique ciphertexts', () => {
      const data = {};

      const encrypted1 = encrypt(data);
      const encrypted2 = encrypt(data);
      const encrypted3 = encrypt(data);

      expect(new Set([encrypted1, encrypted2, encrypted3]).size).toBe(3);
    });

    it('IVs are different even for consecutive encryptions', () => {
      const data = { timestamp: Date.now() };

      const results = new Set();
      for (let i = 0; i < 10; i++) {
        const encrypted = encrypt(data);
        results.add(encrypted);
      }

      // All 10 encryptions should produce unique ciphertexts
      expect(results.size).toBe(10);
    });
  });

  describe('decryption with wrong key', () => {
    let originalDataEncKey;

    beforeEach(() => {
      // Store the original key
      originalDataEncKey = process.env.DATA_ENC_KEY;
    });

    afterEach(() => {
      // Restore the original key
      process.env.DATA_ENC_KEY = originalDataEncKey;
    });

    it('throws error when decrypting with wrong key', () => {
      // Encrypt with the correct key
      const data = { secret: 'information' };
      const encrypted = encrypt(data);

      // Change to a different key
      process.env.DATA_ENC_KEY = 'b'.repeat(64); // Different key

      expect(() => decrypt(encrypted)).toThrow();
    });

    it('throws error when key is corrupted', () => {
      const data = { test: true };
      const encrypted = encrypt(data);

      // Corrupt the key
      process.env.DATA_ENC_KEY = 'c'.repeat(63) + 'z';

      expect(() => decrypt(encrypted)).toThrow();
    });

    it('throws error when key is too short', () => {
      const data = { test: true };
      const encrypted = encrypt(data);

      // Short key
      process.env.DATA_ENC_KEY = 'a'.repeat(32); // Only 16 bytes, not 32

      expect(() => decrypt(encrypted)).toThrow();
    });

    it('data encrypted with one key cannot be decrypted with another', () => {
      // Encrypt with key A
      const data = { sensitive: 'data' };
      const encryptedWithKeyA = encrypt(data);

      // Switch to key B
      const originalKey = originalDataEncKey;
      process.env.DATA_ENC_KEY = 'f'.repeat(64);
      const encryptedWithKeyB = encrypt(data);

      // After switching to Key B:
      // - Encryption with Key B works
      expect(() => decrypt(encryptedWithKeyB)).not.toThrow();
      // - Decryption of Key A data fails with Key B
      expect(() => decrypt(encryptedWithKeyA)).toThrow();
    });
  });

  describe('edge cases for data types', () => {
    it('handles empty object', () => {
      const original = {};
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual({});
    });

    it('handles null values in object', () => {
      const original = { name: 'Test', value: null, count: 5 };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
      expect(decrypted.value).toBeNull();
    });

    it('handles undefined values in object', () => {
      const original = { name: 'Test', value: undefined };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      // JSON.stringify converts undefined to null, but JSON.parse returns undefined
      // So we just verify the key is absent (or undefined)
      expect(decrypted.name).toBe('Test');
      // value is undefined because JSON.parse ignores keys with undefined values
      expect(decrypted.value).toBeUndefined();
    });

    it('handles unicode characters', () => {
      const original = {
        text: 'Hello 世界 🌍 مرحبا',
        emojis: '🎉🎊🎁',
        chinese: '中文测试',
        arabic: 'مرحبا بكم',
        special: 'ñiño façade',
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
      expect(decrypted.text).toBe('Hello 世界 🌍 مرحبا');
    });

    it('handles special characters in JSON', () => {
      const original = {
        html: '<div class="test">&</div>',
        json: '{"key": "value"}',
        backslash: 'path\\to\\file',
        quotes: 'He said "hello"',
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('handles boolean values', () => {
      const original = {
        yes: true,
        no: false,
        zero: 0,
        emptyString: '',
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('handles negative numbers', () => {
      const original = {
        negative: -123,
        decimal: -45.67,
        scientific: -1e10,
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('handles arrays of primitives', () => {
      const original = {
        numbers: [1, 2, 3, -4, 5.5],
        strings: ['a', 'b', 'c'],
        mixed: [1, 'two', true, null],
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('handles date objects (stored as strings)', () => {
      // JSON.stringify converts Date to ISO string
      const original = {
        date: new Date('2024-01-15T10:30:00Z'),
        timestamp: Date.now(),
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(typeof decrypted.date).toBe('string');
      expect(decrypted.timestamp).toBe(original.timestamp);
    });
  });

  describe('large payloads', () => {
    it('handles 10KB string payload', () => {
      const longString = 'A'.repeat(10 * 1024);
      const original = { data: longString };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted.data).toBe(longString);
      expect(decrypted.data.length).toBe(10 * 1024);
    });

    it('handles 100KB string payload', () => {
      const longString = 'B'.repeat(100 * 1024);
      const original = { bigData: longString };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted.bigData).toBe(longString);
      expect(decrypted.bigData.length).toBe(100 * 1024);
    });

    it('handles 1MB string payload', () => {
      const hugeString = 'C'.repeat(1024 * 1024);
      const original = { hugeData: hugeString };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted.hugeData).toBe(hugeString);
      expect(decrypted.hugeData.length).toBe(1024 * 1024);
    }, 10000); // 10 second timeout for large payload

    it('handles large object with many fields', () => {
      const original = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: { nested: true, value: Math.random() },
        })),
      };
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted.items).toHaveLength(1000);
      expect(decrypted.items[999].name).toBe('Item 999');
      expect(decrypted.items[500].data.nested).toBe(true);
    });

    it('handles deeply nested structure', () => {
      // Build a deeply nested object - each level is a new object with a 'level' key
      // At the deepest level (100), add a value
      const buildNested = (depth, targetDepth, value) => {
        if (depth === targetDepth) {
          return { value };
        }
        return { level: buildNested(depth + 1, targetDepth, value) };
      };

      const original = buildNested(0, 100, 42);
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      // Navigate to the value at depth 100
      let target = decrypted;
      for (let i = 0; i < 100; i++) {
        target = target.level;
      }
      expect(target.value).toBe(42);
    });
  });

  describe('base64 output format', () => {
    it('returns base64 encoded string', () => {
      const original = { test: true };
      const encrypted = encrypt(original);

      // Verify it's valid base64
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();

      // Verify it's a string
      expect(typeof encrypted).toBe('string');
    });

    it('encrypted output can be stored and later decrypted', () => {
      const original = { storage: 'test' };
      const encrypted = encrypt(original);

      // Simulate storage/retrieval
      const stored = encrypted;
      const retrieved = stored;

      const decrypted = decrypt(retrieved);
      expect(decrypted).toEqual(original);
    });
  });

  describe('tamper detection', () => {
    it('detects tampered ciphertext - modified character', () => {
      const original = { important: 'data' };
      const encrypted = encrypt(original);

      // Tamper with the ciphertext
      const buffer = Buffer.from(encrypted, 'base64');
      buffer[20] = buffer[20] ^ 0xFF; // Flip bits in the middle
      const tampered = buffer.toString('base64');

      expect(() => decrypt(tampered)).toThrow();
    });

    it('detects truncated ciphertext', () => {
      const original = { data: 'test' };
      const encrypted = encrypt(original);

      // Truncate the ciphertext
      const buffer = Buffer.from(encrypted, 'base64');
      const truncated = buffer.slice(0, Math.floor(buffer.length / 2)).toString('base64');

      expect(() => decrypt(truncated)).toThrow();
    });

    it('detects extended ciphertext', () => {
      const original = { data: 'test' };
      const encrypted = encrypt(original);

      // Extend the ciphertext with garbage
      const buffer = Buffer.from(encrypted, 'base64');
      const extended = Buffer.concat([buffer, Buffer.from('garbage')]).toString('base64');

      expect(() => decrypt(extended)).toThrow();
    });

    it('detects modified last bytes', () => {
      const original = { secure: true };
      const encrypted = encrypt(original);

      // Modify the last few bytes (part of ciphertext)
      const buffer = Buffer.from(encrypted, 'base64');
      const lastIndex = IV_LENGTH + TAG_LENGTH; // After IV and tag
      buffer[lastIndex] = buffer[lastIndex] ^ 0x01;
      const tampered = buffer.toString('base64');

      expect(() => decrypt(tampered)).toThrow();
    });
  });
});
// Jest test setup for MediScan auth system
// Set environment variables BEFORE any application code loads

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-mediscan-auth-tests-only-do-not-use-in-prod';
process.env.DATA_ENC_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes for AES-256
process.env.BCRYPT_ROUNDS = '4'; // Faster hashing for tests
// process.env.DB_PATH = ':memory:'; // SQLite removed
process.env.RATE_LIMIT_WINDOW = '1'; // 1 minute
process.env.RATE_LIMIT_MAX = '10'; // Lower for faster rate-limit tests

// Suppress console during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };
}

// Clean up any existing database connections before each test run
// This prevents "Database is locked" errors between test files
beforeAll(() => {
  // Ensure we have a fresh in-memory DB
  // process.env.DB_PATH = ':memory:'; // SQLite removed
});

// afterAll cleanup removed – no SQLite connection
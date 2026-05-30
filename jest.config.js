module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  verbose: true,
  // Don't run in parallel since we share a single SQLite connection
  maxConcurrency: 1,
  // Clear mocks between tests
  clearMocks: true,
  // Module file extensions
  moduleFileExtensions: ['js', 'json', 'node'],
  // JUnit XML reporter for CI/CD artifact uploads
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'reports',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' > ',
      usePathForSuiteName: true,
    }],
  ],
};
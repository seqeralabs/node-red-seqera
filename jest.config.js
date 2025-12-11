module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  testMatch: ["**/test/**/*.test.js"],
  // Skip polling/monitor tests for now - they have complex async timing issues
  testPathIgnorePatterns: ["/node_modules/"],
  collectCoverageFrom: ["nodes/**/*.js", "!nodes/**/*.html"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "html", "lcov"],
  // Coverage thresholds - raised to reflect comprehensive test coverage
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 85,
      statements: 85,
    },
  },
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
};

/**
 * Global test setup for Jest
 */
const nock = require("nock");

// Disable real HTTP requests during tests
beforeAll(() => {
  nock.disableNetConnect();
});

// Clean up nock after each test
afterEach(() => {
  nock.cleanAll();
});

// Re-enable connections after all tests
afterAll(() => {
  nock.enableNetConnect();
});

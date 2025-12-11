/**
 * Shared test utilities
 */

/**
 * Creates a mock Seqera config object (for direct use, not as a node)
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock seqera config
 */
function createMockSeqeraConfig(overrides = {}) {
  return {
    id: "seqera-config-id",
    baseUrl: "https://api.cloud.seqera.io",
    workspaceId: "test-workspace-id",
    credentials: {
      token: "test-token-123",
      ...overrides.credentials,
    },
    ...overrides,
  };
}

/**
 * Creates a mock message object
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock message
 */
function createMockMsg(overrides = {}) {
  return {
    payload: {},
    _msgid: "test-msg-id-" + Math.random().toString(36).substr(2, 9),
    ...overrides,
  };
}

/**
 * Asserts that node status was updated with expected values
 * @param {Object} node - Mock node instance
 * @param {Object} expectedStatus - Expected status properties
 */
function expectStatusUpdate(node, expectedStatus) {
  expect(node.status).toHaveBeenCalledWith(expect.objectContaining(expectedStatus));
}

/**
 * Asserts that node status was set to error (red)
 * @param {Object} node - Mock node instance
 */
function expectErrorStatus(node) {
  expect(node.status).toHaveBeenCalledWith(
    expect.objectContaining({
      fill: "red",
    }),
  );
}

/**
 * Asserts that node status was set to success (green)
 * @param {Object} node - Mock node instance
 */
function expectSuccessStatus(node) {
  expect(node.status).toHaveBeenCalledWith(
    expect.objectContaining({
      fill: "green",
      shape: "dot",
    }),
  );
}

/**
 * Asserts that input message properties are passed through to output
 * @param {Object} outputMsg - Output message
 * @param {Object} inputMsg - Input message
 * @param {string[]} excludeKeys - Keys to exclude from comparison
 */
function expectMessagePassthrough(outputMsg, inputMsg, excludeKeys = []) {
  const defaultExclude = ["payload", "workflowId", "datasetId", "studioId", "files"];
  const allExclude = [...defaultExclude, ...excludeKeys];

  Object.keys(inputMsg).forEach((key) => {
    if (!allExclude.includes(key)) {
      expect(outputMsg[key]).toEqual(inputMsg[key]);
    }
  });
}

/**
 * Waits for a condition to be true
 * @param {Function} condition - Function returning boolean
 * @param {number} timeout - Max wait time in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise} Resolves when condition is true
 */
async function waitFor(condition, timeout = 5000, interval = 50) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

/**
 * Creates a deferred promise for async testing
 * @returns {Object} Object with promise, resolve, and reject
 */
function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Waits for node.send to be called
 * @param {Object} node - Mock node instance
 * @param {number} timeout - Max wait time
 * @returns {Promise<Object>} Resolves with sent message
 */
async function waitForSend(node, timeout = 5000) {
  await waitFor(() => node.send.mock.calls.length > 0, timeout);
  return node.send.mock.calls[0][0];
}

/**
 * Extracts all messages sent by a node
 * @param {Object} node - Mock node instance
 * @returns {Array} Array of sent messages
 */
function getSentMessages(node) {
  return node.send.mock.calls.map((call) => call[0]);
}

/**
 * Flushes the promise queue to allow async operations to complete
 * This is necessary when testing code that uses axios or other async operations
 * with fake timers.
 * @param {number} iterations - Number of flush iterations (default 10)
 */
async function flushPromises(iterations = 10) {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
  // Also run any pending jest timers that might have been scheduled
  (await jest.runAllTimersAsync?.()) || jest.runAllTicks?.();
}

/**
 * Advances fake timers and runs any pending promises
 * @param {number} ms - Milliseconds to advance
 */
async function advanceTimersAndFlush(ms) {
  jest.advanceTimersByTime(ms);
  // Flush pending promises (multiple iterations for axios chain)
  await flushPromises();
}

module.exports = {
  createMockSeqeraConfig,
  createMockMsg,
  expectStatusUpdate,
  expectErrorStatus,
  expectSuccessStatus,
  expectMessagePassthrough,
  waitFor,
  createDeferred,
  waitForSend,
  getSentMessages,
  advanceTimersAndFlush,
  flushPromises,
};

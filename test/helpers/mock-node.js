/**
 * Mock Node instance factory
 *
 * Creates mock node instances with common methods and properties
 * for testing Node-RED custom nodes.
 */

/**
 * Creates a mock node instance
 * @param {Object} config - Node configuration
 * @returns {Object} Mock node instance
 */
function createMockNode(config = {}) {
  const eventHandlers = {};
  const contextData = {};

  const node = {
    // Node identity
    id: config.id || "test-node-id",
    name: config.name || "test-node",
    type: config.type || "test-node-type",
    z: config.z || "test-flow-id",

    // Seqera config reference (commonly used)
    seqeraConfig: config.seqeraConfig || null,

    // Credentials
    credentials: config.credentials || {},

    // Node-RED methods
    on: jest.fn((event, handler) => {
      eventHandlers[event] = handler;
    }),

    send: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    status: jest.fn(),
    done: jest.fn(),

    // Context storage
    context: jest.fn(() => ({
      get: jest.fn((key) => contextData[key]),
      set: jest.fn((key, value) => {
        contextData[key] = value;
      }),
      keys: jest.fn(() => Object.keys(contextData)),
    })),

    // Test helpers
    _eventHandlers: eventHandlers,
    _contextData: contextData,

    /**
     * Trigger input event handler
     * @param {Object} msg - Input message
     * @param {Function} send - Send function (defaults to node.send)
     * @param {Function} done - Done callback
     * @returns {Promise} Resolves when handler completes
     */
    _triggerInput: async function (msg, send, done) {
      const handler = eventHandlers.input;
      if (!handler) {
        throw new Error("No input handler registered");
      }
      return handler.call(this, msg, send || this.send, done || jest.fn());
    },

    /**
     * Trigger close event handler
     * @param {boolean} removed - Whether node is being removed
     * @param {Function} done - Done callback
     * @returns {Promise} Resolves when handler completes
     */
    _triggerClose: async function (removed, done) {
      const handler = eventHandlers.close;
      if (!handler) {
        return; // Close handler is optional
      }
      // Handle both (done) and (removed, done) signatures
      if (handler.length === 1) {
        return handler.call(this, done || jest.fn());
      }
      return handler.call(this, removed, done || jest.fn());
    },

    /**
     * Get stored context value
     */
    _getContext: (key) => contextData[key],

    /**
     * Set context value directly (for test setup)
     */
    _setContext: (key, value) => {
      contextData[key] = value;
    },
  };

  // Copy any additional config properties to node
  Object.keys(config).forEach((key) => {
    if (!["id", "name", "type", "z", "seqeraConfig", "credentials"].includes(key)) {
      node[key] = config[key];
    }
  });

  return node;
}

/**
 * Creates a mock seqera-config node
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock seqera-config node
 */
function createMockSeqeraConfigNode(overrides = {}) {
  return {
    id: overrides.id || "seqera-config-id",
    name: overrides.name || "test-seqera-config",
    type: "seqera-config",
    baseUrl: overrides.baseUrl || "https://api.cloud.seqera.io",
    workspaceId: overrides.workspaceId || "test-workspace-id",
    credentials: {
      token: overrides.token || "test-token-123",
      ...overrides.credentials,
    },
    ...overrides,
  };
}

module.exports = { createMockNode, createMockSeqeraConfigNode };

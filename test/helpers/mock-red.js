/**
 * Mock Node-RED runtime factory
 *
 * Provides a reusable factory for mocking the RED runtime object
 * that Node-RED passes to node modules.
 */

/**
 * Creates a mock RED runtime object
 * @param {Object} options - Configuration options
 * @param {Object} options.nodes - Pre-registered nodes (id -> node)
 * @param {Object} options.credentials - Pre-registered credentials (nodeId -> creds)
 * @returns {Object} Mock RED object
 */
function createMockRED(options = {}) {
  const nodes = new Map(Object.entries(options.nodes || {}));
  const credentials = new Map(Object.entries(options.credentials || {}));
  const registeredTypes = new Map();
  const httpEndpoints = { get: new Map(), post: new Map() };

  const RED = {
    nodes: {
      /**
       * Mock createNode - initializes node properties
       */
      createNode: jest.fn((node, config) => {
        node.id = config.id || "test-node-id";
        node.name = config.name || "";
        node.type = config.type || "test-node-type";
        node.z = config.z || "test-flow-id";

        // Set up event handlers storage
        node._eventHandlers = {};
        node.on = jest.fn((event, handler) => {
          node._eventHandlers[event] = handler;
        });

        // Standard Node-RED node methods
        node.send = jest.fn();
        node.error = jest.fn();
        node.warn = jest.fn();
        node.log = jest.fn();
        node.debug = jest.fn();
        node.trace = jest.fn();
        node.status = jest.fn();
        node.done = jest.fn();

        // Context (flow/global storage)
        const contextData = {};
        node._contextData = contextData;
        node.context = jest.fn(() => ({
          get: jest.fn((key) => contextData[key]),
          set: jest.fn((key, value) => {
            contextData[key] = value;
          }),
          keys: jest.fn(() => Object.keys(contextData)),
        }));

        /**
         * Test helper: Trigger input event handler
         * @param {Object} msg - Input message
         * @param {Function} send - Send function (defaults to node.send)
         * @param {Function} done - Done callback
         * @returns {Promise} Resolves when handler completes
         */
        node._triggerInput = async function (msg, send, done) {
          const handler = node._eventHandlers.input;
          if (!handler) {
            throw new Error("No input handler registered");
          }
          return handler.call(node, msg, send || node.send, done || jest.fn());
        };

        /**
         * Test helper: Trigger close event handler
         * @param {boolean} removed - Whether node is being removed
         * @param {Function} done - Done callback
         * @returns {Promise} Resolves when handler completes
         */
        node._triggerClose = async function (removed, done) {
          const handler = node._eventHandlers.close;
          if (!handler) {
            return; // Close handler is optional
          }
          // Handle both (done) and (removed, done) signatures
          if (handler.length === 1) {
            return handler.call(node, done || jest.fn());
          }
          return handler.call(node, removed, done || jest.fn());
        };

        /**
         * Test helper: Get stored context value
         */
        node._getContext = (key) => contextData[key];

        /**
         * Test helper: Set context value directly (for test setup)
         */
        node._setContext = (key, value) => {
          contextData[key] = value;
        };
      }),

      /**
       * Mock registerType - stores node constructor for later retrieval
       */
      registerType: jest.fn((type, constructor, opts) => {
        registeredTypes.set(type, { constructor, opts });
      }),

      /**
       * Mock getNode - returns node by ID from registry
       */
      getNode: jest.fn((id) => nodes.get(id) || null),

      /**
       * Mock getCredentials - returns credentials for a node
       */
      getCredentials: jest.fn((id) => credentials.get(id) || {}),
    },

    util: {
      /**
       * Mock evaluateNodeProperty - evaluates typed input properties
       */
      evaluateNodeProperty: jest.fn((value, type, node, msg) => {
        switch (type) {
          case "str":
            return value;
          case "num":
            return Number(value);
          case "bool":
            return value === "true" || value === true;
          case "json":
            try {
              return typeof value === "string" ? JSON.parse(value) : value;
            } catch {
              return value;
            }
          case "msg":
            return getNestedProperty(msg, value);
          case "flow":
            return node.context?.().get(value);
          case "global":
            return node.context?.().get(value);
          default:
            return value;
        }
      }),

      /**
       * Mock prepareJSONataExpression - returns expression object
       */
      prepareJSONataExpression: jest.fn((expr, node) => ({
        _expr: expr,
        _node: node,
      })),

      /**
       * Mock evaluateJSONataExpression - evaluates JSONata (simplified)
       */
      evaluateJSONataExpression: jest.fn((prepared, msg, callback) => {
        // Simple mock - just return payload by default
        // Tests can override this for specific JSONata behavior
        try {
          callback(null, msg.payload);
        } catch (err) {
          callback(err, null);
        }
      }),

      /**
       * Clone a message (simplified deep clone)
       */
      cloneMessage: jest.fn((msg) => JSON.parse(JSON.stringify(msg))),
    },

    httpAdmin: {
      /**
       * Mock GET endpoint registration
       */
      get: jest.fn((path, ...handlers) => {
        const handler = handlers[handlers.length - 1];
        httpEndpoints.get.set(path, handler);
      }),

      /**
       * Mock POST endpoint registration
       */
      post: jest.fn((path, ...handlers) => {
        const handler = handlers[handlers.length - 1];
        httpEndpoints.post.set(path, handler);
      }),
    },

    /**
     * Test helpers for accessing internal state
     */
    _testHelpers: {
      nodes,
      credentials,
      registeredTypes,
      httpEndpoints,

      /**
       * Add a node to the registry
       */
      addNode: (id, node) => nodes.set(id, node),

      /**
       * Add credentials for a node
       */
      addCredentials: (id, creds) => credentials.set(id, creds),

      /**
       * Get registered node type
       */
      getRegisteredType: (type) => registeredTypes.get(type),

      /**
       * Get HTTP endpoint handler
       */
      getHttpHandler: (method, path) => httpEndpoints[method.toLowerCase()]?.get(path),

      /**
       * Simulate HTTP request to registered endpoint
       */
      async simulateHttpRequest(method, path, options = {}) {
        const handler = httpEndpoints[method.toLowerCase()]?.get(path);
        if (!handler) {
          throw new Error(`No handler registered for ${method} ${path}`);
        }

        const req = {
          params: options.params || {},
          query: options.query || {},
          body: options.body || {},
          ...options.req,
        };

        let responseData = null;
        let responseStatus = 200;
        const res = {
          json: jest.fn((data) => {
            responseData = data;
          }),
          status: jest.fn((code) => {
            responseStatus = code;
            return res;
          }),
          send: jest.fn((data) => {
            responseData = data;
          }),
        };

        await handler(req, res);

        return { data: responseData, status: responseStatus, res };
      },
    },
  };

  return RED;
}

/**
 * Helper to get nested property from object using dot notation
 */
function getNestedProperty(obj, path) {
  if (!path) return obj;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Simulate an HTTP request to a handler
 * @param {Function} handler - The HTTP handler function
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response object with statusCode and body
 */
async function simulateHttpRequest(handler, options = {}) {
  const req = {
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    ...options.req,
  };

  let responseBody = null;
  let statusCode = 200;

  const res = {
    statusCode: 200,
    body: null,
    json: jest.fn((data) => {
      res.body = data;
      responseBody = data;
    }),
    status: jest.fn((code) => {
      res.statusCode = code;
      statusCode = code;
      return res;
    }),
    send: jest.fn((data) => {
      res.body = data;
      responseBody = data;
    }),
  };

  await handler(req, res);

  return { res, statusCode, body: responseBody };
}

module.exports = { createMockRED, getNestedProperty, simulateHttpRequest };

/**
 * Shared test utilities for Node-RED Seqera plugin tests.
 *
 * This module provides common setup, mock factories, and helper functions
 * used across all test files.
 */

const helper = require("node-red-node-test-helper");
const nock = require("nock");

// Initialize the test helper with the Node-RED runtime
helper.init(require.resolve("node-red"));

// Default base URL used in tests
const DEFAULT_BASE_URL = "https://api.cloud.seqera.io";

// Default test credentials
const DEFAULT_CREDENTIALS = {
  token: "test-api-token-12345",
};

// Default workspace ID for tests
const DEFAULT_WORKSPACE_ID = "12345678";

/**
 * Creates a mock seqera-config node configuration for use in test flows.
 *
 * @param {Object} overrides - Properties to override in the default config
 * @returns {Object} A config node definition for use in test flows
 */
function createConfigNode(overrides = {}) {
  return {
    id: "config-node-1",
    type: "seqera-config",
    name: "Test Config",
    baseUrl: DEFAULT_BASE_URL,
    workspaceId: DEFAULT_WORKSPACE_ID,
    ...overrides,
  };
}

/**
 * Creates credentials object for a config node.
 *
 * @param {string} nodeId - The ID of the node to create credentials for
 * @param {Object} overrides - Properties to override in the default credentials
 * @returns {Object} Credentials object keyed by node ID
 */
function createCredentials(nodeId = "config-node-1", overrides = {}) {
  return {
    [nodeId]: {
      ...DEFAULT_CREDENTIALS,
      ...overrides,
    },
  };
}

/**
 * Sets up common nock interceptors for Seqera API endpoints.
 * Call this in beforeEach() to prepare API mocks.
 *
 * @param {string} baseUrl - The base URL to mock (default: DEFAULT_BASE_URL)
 * @returns {Object} The nock scope for additional configuration
 */
function setupNock(baseUrl = DEFAULT_BASE_URL) {
  return nock(baseUrl);
}

/**
 * Cleans up nock interceptors. Call this in afterEach().
 */
function cleanupNock() {
  nock.cleanAll();
}

/**
 * Creates a mock workflow response object.
 *
 * @param {Object} overrides - Properties to override
 * @returns {Object} A workflow response object
 */
function createWorkflowResponse(overrides = {}) {
  return {
    workflow: {
      id: "workflow-123",
      status: "running",
      runName: "test-run",
      projectName: "test-project",
      userName: "testuser",
      submit: "2024-01-01T00:00:00Z",
      dateCreated: "2024-01-01T00:00:00Z",
      ...overrides,
    },
  };
}

/**
 * Creates a mock pipeline response object.
 *
 * @param {Object} overrides - Properties to override
 * @returns {Object} A pipelines response object
 */
function createPipelinesResponse(pipelines = []) {
  const defaultPipelines = [
    {
      pipelineId: 1,
      name: "test-pipeline",
      description: "A test pipeline",
      repository: "https://github.com/test/pipeline",
    },
  ];

  return {
    pipelines: pipelines.length > 0 ? pipelines : defaultPipelines,
  };
}

/**
 * Creates a mock launch config response object.
 *
 * @param {Object} overrides - Properties to override
 * @returns {Object} A launch config response object
 */
function createLaunchConfigResponse(overrides = {}) {
  return {
    launch: {
      id: "launch-123",
      computeEnv: {
        id: "ce-123",
        name: "test-compute-env",
      },
      pipeline: "https://github.com/test/pipeline",
      workDir: "s3://bucket/work",
      revision: "main",
      paramsText: "{}",
      ...overrides,
    },
  };
}

/**
 * Creates a mock Data Link response object.
 *
 * @param {Object} overrides - Properties to override
 * @returns {Object} A data links response object
 */
function createDataLinksResponse(dataLinks = []) {
  const defaultDataLinks = [
    {
      id: "dl-123",
      name: "test-datalink",
      type: "S3",
      provider: "aws",
      resourceRef: "s3://bucket/path",
      credentials: [{ id: "cred-123" }],
    },
  ];

  return {
    dataLinks: dataLinks.length > 0 ? dataLinks : defaultDataLinks,
  };
}

/**
 * Creates a mock Data Browser objects response.
 *
 * @param {Array} objects - Objects to include in the response
 * @returns {Object} A data browser response object
 */
function createDataBrowserResponse(objects = []) {
  const defaultObjects = [
    { name: "file1.txt", type: "FILE", size: 1024 },
    { name: "file2.csv", type: "FILE", size: 2048 },
    { name: "folder1", type: "FOLDER" },
  ];

  return {
    objects: objects.length > 0 ? objects : defaultObjects,
  };
}

/**
 * Creates a mock dataset response object.
 *
 * @param {Object} overrides - Properties to override
 * @returns {Object} A dataset response object
 */
function createDatasetResponse(overrides = {}) {
  return {
    dataset: {
      id: "dataset-123",
      name: "test-dataset",
      description: "A test dataset",
      mediaType: "text/csv",
      ...overrides,
    },
  };
}

/**
 * Creates a mock Studio response object.
 *
 * @param {Object} overrides - Properties to override
 * @returns {Object} A studio response object
 */
function createStudioResponse(overrides = {}) {
  return {
    sessionId: "studio-123",
    studio: {
      id: "studio-123",
      name: "test-studio",
      status: "running",
      ...overrides,
    },
  };
}

/**
 * Creates a mock user info response object.
 *
 * @param {Object} overrides - Properties to override
 * @returns {Object} A user info response object
 */
function createUserInfoResponse(overrides = {}) {
  return {
    user: {
      id: 123,
      userName: "testuser",
      email: "test@example.com",
      ...overrides,
    },
  };
}

/**
 * Creates a mock organizations response object.
 *
 * @param {Array} orgs - Organizations to include
 * @returns {Object} An organizations response object
 */
function createOrganizationsResponse(orgs = []) {
  const defaultOrgs = [
    {
      orgId: 1,
      name: "test-org",
      fullName: "Test Organization",
    },
  ];

  return {
    organizations: orgs.length > 0 ? orgs : defaultOrgs,
  };
}

/**
 * Creates a mock workspaces response object.
 *
 * @param {Array} workspaces - Workspaces to include
 * @returns {Object} A workspaces response object
 */
function createWorkspacesResponse(workspaces = []) {
  const defaultWorkspaces = [
    {
      id: 12345678,
      name: "test-workspace",
      fullName: "Test Workspace",
    },
  ];

  return {
    workspaces: workspaces.length > 0 ? workspaces : defaultWorkspaces,
  };
}

/**
 * Helper to wait for a node to emit a message.
 * Wraps the assertion in try/catch to properly report failures.
 *
 * @param {Object} node - The helper node to listen on
 * @param {Function} assertion - Function that receives the message and performs assertions
 * @param {Function} done - Mocha done callback
 */
function expectMessage(node, assertion, done) {
  node.on("input", function (msg) {
    try {
      assertion(msg);
      done();
    } catch (err) {
      done(err);
    }
  });
}

/**
 * Helper to wait for a specific number of messages.
 *
 * @param {Object} node - The helper node to listen on
 * @param {number} count - Number of messages to wait for
 * @param {Function} assertion - Function that receives all messages array
 * @param {Function} done - Mocha done callback
 */
function expectMessages(node, count, assertion, done) {
  const messages = [];
  node.on("input", function (msg) {
    messages.push(msg);
    if (messages.length === count) {
      try {
        assertion(messages);
        done();
      } catch (err) {
        done(err);
      }
    }
  });
}

module.exports = {
  helper,
  nock,
  DEFAULT_BASE_URL,
  DEFAULT_CREDENTIALS,
  DEFAULT_WORKSPACE_ID,
  createConfigNode,
  createCredentials,
  setupNock,
  cleanupNock,
  createWorkflowResponse,
  createPipelinesResponse,
  createLaunchConfigResponse,
  createDataLinksResponse,
  createDataBrowserResponse,
  createDatasetResponse,
  createStudioResponse,
  createUserInfoResponse,
  createOrganizationsResponse,
  createWorkspacesResponse,
  expectMessage,
  expectMessages,
};

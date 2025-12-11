/**
 * Axios/nock helper functions for mocking Seqera Platform API
 */
const nock = require("nock");

const BASE_URL = "https://api.cloud.seqera.io";

/**
 * Creates a nock scope for the Seqera API
 * @param {string} baseUrl - Override base URL
 * @returns {Object} Helper functions for mocking API endpoints
 */
function mockSeqeraAPI(baseUrl = BASE_URL) {
  return {
    /**
     * Mock user-info endpoint (connectivity check)
     */
    mockUserInfo: (response = { user: { userName: "testuser", email: "test@example.com" } }, status = 200) => {
      return nock(baseUrl)
        .get("/user-info")
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, response);
    },

    /**
     * Mock workflow launch endpoint
     */
    mockWorkflowLaunch: (response = { workflowId: "wf-123" }, status = 200) => {
      return nock(baseUrl)
        .post("/workflow/launch")
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, response);
    },

    /**
     * Mock workflow status endpoint
     */
    mockWorkflowStatus: (workflowId, workflow = {}, status = 200) => {
      const defaultWorkflow = {
        id: workflowId,
        status: "running",
        runName: "test-run",
        ...workflow,
      };
      return nock(baseUrl)
        .get(`/workflow/${workflowId}`)
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { workflow: defaultWorkflow });
    },

    /**
     * Mock workflow launch config endpoint (for resume)
     */
    mockWorkflowLaunchConfig: (workflowId, launch = {}, status = 200) => {
      const defaultLaunch = {
        id: "launch-123",
        computeEnv: { id: "ce-123" },
        pipeline: "https://github.com/test/pipeline",
        workDir: "s3://bucket/work",
        sessionId: "session-123",
        ...launch,
      };
      return nock(baseUrl)
        .get(`/workflow/${workflowId}/launch`)
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { launch: defaultLaunch });
    },

    /**
     * Mock pipelines list endpoint (launchpad search)
     */
    mockPipelines: (pipelines = [], status = 200) => {
      return nock(baseUrl)
        .get("/pipelines")
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { pipelines });
    },

    /**
     * Mock pipeline launch config endpoint
     */
    mockPipelineLaunchConfig: (pipelineId, launch = {}, status = 200) => {
      const defaultLaunch = {
        id: "launch-123",
        computeEnv: { id: "ce-123" },
        pipeline: "https://github.com/test/pipeline",
        workDir: "s3://bucket/work",
        paramsText: "{}",
        ...launch,
      };
      return nock(baseUrl)
        .get(`/pipelines/${pipelineId}/launch`)
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { launch: defaultLaunch });
    },

    /**
     * Mock data-links list endpoint
     */
    mockDataLinks: (dataLinks = [], status = 200) => {
      return nock(baseUrl)
        .get("/data-links")
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { dataLinks });
    },

    /**
     * Mock data-links search endpoint (with trailing slash)
     */
    mockDataLinksSearch: (dataLinks = [], status = 200) => {
      return nock(baseUrl)
        .get("/data-links/")
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { dataLinks });
    },

    /**
     * Mock data-link browse endpoint
     */
    mockDataLinkBrowse: (dataLinkId, objects = [], nextPageToken = null, status = 200) => {
      return nock(baseUrl)
        .get(new RegExp(`/data-links/${dataLinkId}/browse.*`))
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { objects, nextPageToken });
    },

    /**
     * Mock datasets create endpoint
     */
    mockDatasetCreate: (response = { dataset: { id: "ds-123" } }, status = 200) => {
      return nock(baseUrl)
        .post("/datasets")
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, response);
    },

    /**
     * Mock dataset upload endpoint
     */
    mockDatasetUpload: (datasetId, status = 200) => {
      return nock(baseUrl)
        .post(`/datasets/${datasetId}/upload`)
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { version: { id: "v-123" } });
    },

    /**
     * Mock studios create endpoint
     */
    mockStudiosCreate: (response = { sessionId: "studio-123" }, status = 200) => {
      return nock(baseUrl)
        .post("/studios")
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, response);
    },

    /**
     * Mock studio status endpoint
     */
    mockStudioStatus: (studioId, studio = {}, status = 200) => {
      const defaultStudio = {
        sessionId: studioId,
        status: "running",
        ...studio,
      };
      return nock(baseUrl)
        .get(`/studios/${studioId}`)
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, defaultStudio);
    },

    /**
     * Mock organizations list endpoint
     */
    mockOrganizations: (organizations = [], status = 200) => {
      return nock(baseUrl)
        .get("/orgs")
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { organizations });
    },

    /**
     * Mock workspaces list endpoint
     */
    mockWorkspaces: (orgId, workspaces = [], status = 200) => {
      return nock(baseUrl)
        .get(`/orgs/${orgId}/workspaces`)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { workspaces });
    },

    /**
     * Mock workflows list endpoint
     */
    mockWorkflowsList: (workflows = [], status = 200) => {
      return nock(baseUrl)
        .get("/workflow")
        .query(true)
        .matchHeader("authorization", /^Bearer .+/)
        .reply(status, { workflows });
    },

    /**
     * Mock any GET endpoint
     */
    mockGet: (path, response, status = 200) => {
      return nock(baseUrl).get(path).query(true).reply(status, response);
    },

    /**
     * Mock any POST endpoint
     */
    mockPost: (path, response, status = 200) => {
      return nock(baseUrl).post(path).query(true).reply(status, response);
    },

    /**
     * Mock error response
     */
    mockError: (method, path, errorCode, errorMessage = "Error") => {
      const scope = nock(baseUrl);
      const methodFn = method.toLowerCase() === "post" ? scope.post(path) : scope.get(path);
      return methodFn.query(true).reply(errorCode, { message: errorMessage });
    },

    /**
     * Mock network error
     */
    mockNetworkError: (method, path, errorCode = "ECONNREFUSED") => {
      const scope = nock(baseUrl);
      const methodFn = method.toLowerCase() === "post" ? scope.post(path) : scope.get(path);
      return methodFn.query(true).replyWithError({ code: errorCode });
    },
  };
}

/**
 * Clean all nock interceptors
 */
function cleanNock() {
  nock.cleanAll();
}

/**
 * Check if all nock interceptors were used
 */
function assertNockDone() {
  if (!nock.isDone()) {
    const pending = nock.pendingMocks();
    throw new Error(`Pending nock interceptors: ${pending.join(", ")}`);
  }
}

module.exports = {
  mockSeqeraAPI,
  cleanNock,
  assertNockDone,
  BASE_URL,
};

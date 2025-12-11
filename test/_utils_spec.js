/**
 * Tests for nodes/_utils.js
 *
 * Tests the shared utility functions used across all Seqera nodes:
 * - buildHeaders: Constructs HTTP headers with Bearer token
 * - apiCall: Axios wrapper with error logging
 * - handleDatalinkAutoComplete: HTTP endpoint handler for Data Link autocomplete
 */

const { expect } = require("chai");
const sinon = require("sinon");
const nock = require("nock");

const { buildHeaders, apiCall, handleDatalinkAutoComplete } = require("../nodes/_utils");

describe("_utils.js", function () {
  afterEach(function () {
    nock.cleanAll();
    sinon.restore();
  });

  describe("buildHeaders()", function () {
    it("should include Authorization header with Bearer token", function () {
      const mockNode = {
        seqeraConfig: {
          credentials: {
            token: "test-token-123",
          },
        },
      };

      const headers = buildHeaders(mockNode);

      expect(headers).to.have.property("Authorization", "Bearer test-token-123");
    });

    it("should merge extra headers with Authorization header", function () {
      const mockNode = {
        seqeraConfig: {
          credentials: {
            token: "test-token-123",
          },
        },
      };

      const headers = buildHeaders(mockNode, {
        "Content-Type": "application/json",
        Accept: "application/json",
      });

      expect(headers).to.have.property("Authorization", "Bearer test-token-123");
      expect(headers).to.have.property("Content-Type", "application/json");
      expect(headers).to.have.property("Accept", "application/json");
    });

    it("should allow extra headers to not override Authorization", function () {
      const mockNode = {
        seqeraConfig: {
          credentials: {
            token: "test-token-123",
          },
        },
      };

      // Extra headers are spread first, then Authorization is set
      const headers = buildHeaders(mockNode, {
        Authorization: "should-be-overridden",
      });

      expect(headers).to.have.property("Authorization", "Bearer test-token-123");
    });
  });

  describe("apiCall()", function () {
    const BASE_URL = "https://api.cloud.seqera.io";

    function createMockNode(token = "test-token") {
      return {
        seqeraConfig: {
          credentials: { token },
        },
        warn: sinon.stub(),
      };
    }

    it("should make successful GET request with auth headers", async function () {
      const mockNode = createMockNode();

      nock(BASE_URL)
        .get("/workflow/123")
        .matchHeader("Authorization", "Bearer test-token")
        .reply(200, { workflow: { id: "123", status: "running" } });

      const response = await apiCall(mockNode, "get", `${BASE_URL}/workflow/123`);

      expect(response.status).to.equal(200);
      expect(response.data.workflow.id).to.equal("123");
    });

    it("should make successful POST request with data", async function () {
      const mockNode = createMockNode();
      const requestData = { launch: { pipeline: "test" } };

      nock(BASE_URL)
        .post("/workflow/launch", requestData)
        .matchHeader("Authorization", "Bearer test-token")
        .matchHeader("Content-Type", "application/json")
        .reply(200, { workflowId: "new-workflow-123" });

      const response = await apiCall(mockNode, "post", `${BASE_URL}/workflow/launch`, {
        headers: { "Content-Type": "application/json" },
        data: requestData,
      });

      expect(response.status).to.equal(200);
      expect(response.data.workflowId).to.equal("new-workflow-123");
    });

    it("should merge custom headers with auth headers", async function () {
      const mockNode = createMockNode();

      nock(BASE_URL)
        .get("/test")
        .matchHeader("Authorization", "Bearer test-token")
        .matchHeader("X-Custom-Header", "custom-value")
        .reply(200, { success: true });

      const response = await apiCall(mockNode, "get", `${BASE_URL}/test`, {
        headers: { "X-Custom-Header": "custom-value" },
      });

      expect(response.status).to.equal(200);
    });

    it("should call node.warn and re-throw on API error", async function () {
      const mockNode = createMockNode();

      nock(BASE_URL).get("/workflow/missing").reply(404, { message: "Not found" });

      try {
        await apiCall(mockNode, "get", `${BASE_URL}/workflow/missing`);
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err.response.status).to.equal(404);
        expect(mockNode.warn.calledOnce).to.be.true;

        // Check that warn was called with useful info
        const warnArg = mockNode.warn.firstCall.args[0];
        expect(warnArg.message).to.include("Seqera API GET call");
        expect(warnArg.message).to.include("failed");
      }
    });

    it("should mask token in warn message on error", async function () {
      const mockNode = createMockNode("secret-token-12345");

      nock(BASE_URL).get("/error").reply(500, { error: "Internal error" });

      try {
        await apiCall(mockNode, "get", `${BASE_URL}/error`);
        expect.fail("Should have thrown an error");
      } catch (err) {
        const warnArg = mockNode.warn.firstCall.args[0];
        // The token should be masked in the request object
        expect(warnArg.request.headers.Authorization).to.equal("Bearer *********");
        expect(warnArg.request.headers.Authorization).to.not.include("secret-token");
      }
    });

    it("should handle network errors", async function () {
      const mockNode = createMockNode();

      nock(BASE_URL).get("/network-error").replyWithError("Network connection failed");

      try {
        await apiCall(mockNode, "get", `${BASE_URL}/network-error`);
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(mockNode.warn.calledOnce).to.be.true;
        expect(err.message).to.include("Network connection failed");
      }
    });
  });

  describe("handleDatalinkAutoComplete()", function () {
    const BASE_URL = "https://api.cloud.seqera.io";

    function createMockRED(configNode = null) {
      return {
        nodes: {
          getNode: sinon.stub().returns(configNode),
          getCredentials: sinon.stub().returns({ token: "test-token" }),
        },
      };
    }

    function createMockRequest(params = {}, query = {}, body = {}) {
      return {
        params: { nodeId: "node-123", ...params },
        query: { search: "", ...query },
        body,
      };
    }

    function createMockResponse() {
      const res = {
        json: sinon.stub(),
      };
      return res;
    }

    it("should return empty array when workspaceId is not available", async function () {
      const RED = createMockRED(null);
      const req = createMockRequest();
      const res = createMockResponse();

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal([]);
    });

    it("should return empty array when seqeraConfig is not found", async function () {
      const RED = createMockRED(null);
      const req = createMockRequest({}, { seqeraConfig: "missing-config" });
      const res = createMockResponse();

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal([]);
    });

    it("should fetch and return data links when node exists with config", async function () {
      const configNode = {
        id: "config-1",
        baseUrl: BASE_URL,
        workspaceId: "ws-123",
        credentials: { token: "test-token" },
      };

      const mockNode = {
        seqeraConfig: configNode,
      };

      const RED = {
        nodes: {
          getNode: sinon.stub().callsFake((id) => {
            if (id === "node-123") return mockNode;
            if (id === "config-1") return configNode;
            return null;
          }),
          getCredentials: sinon.stub().returns({ token: "test-token" }),
        },
      };

      const req = createMockRequest();
      const res = createMockResponse();

      nock(BASE_URL)
        .get("/data-links")
        .query({ workspaceId: "ws-123" })
        .reply(200, {
          dataLinks: [{ name: "datalink-1" }, { name: "datalink-2" }],
        });

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json.calledOnce).to.be.true;
      const result = res.json.firstCall.args[0];
      expect(result).to.have.length(2);
      expect(result[0]).to.deep.equal({ value: "datalink-1", label: "datalink-1" });
      expect(result[1]).to.deep.equal({ value: "datalink-2", label: "datalink-2" });
    });

    it("should use search parameter when provided", async function () {
      const configNode = {
        id: "config-1",
        baseUrl: BASE_URL,
        workspaceId: "ws-123",
        credentials: { token: "test-token" },
      };

      const mockNode = {
        seqeraConfig: configNode,
      };

      const RED = {
        nodes: {
          getNode: sinon.stub().callsFake((id) => {
            if (id === "node-123") return mockNode;
            return configNode;
          }),
        },
      };

      const req = createMockRequest({}, { search: "test-search" });
      const res = createMockResponse();

      nock(BASE_URL)
        .get("/data-links")
        .query({ workspaceId: "ws-123", search: "test-search" })
        .reply(200, {
          dataLinks: [{ name: "test-search-result" }],
        });

      await handleDatalinkAutoComplete(RED, req, res);

      const result = res.json.firstCall.args[0];
      expect(result).to.have.length(1);
      expect(result[0].value).to.equal("test-search-result");
    });

    it("should use workspaceId from query parameter override", async function () {
      const configNode = {
        id: "config-1",
        baseUrl: BASE_URL,
        workspaceId: "ws-123",
        credentials: { token: "test-token" },
      };

      const mockNode = {
        seqeraConfig: configNode,
      };

      const RED = {
        nodes: {
          getNode: sinon.stub().callsFake((id) => {
            if (id === "node-123") return mockNode;
            return configNode;
          }),
        },
      };

      const req = createMockRequest({}, { workspaceId: "ws-override" });
      const res = createMockResponse();

      nock(BASE_URL).get("/data-links").query({ workspaceId: "ws-override" }).reply(200, { dataLinks: [] });

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json.calledOnce).to.be.true;
    });

    it("should return empty array on API error", async function () {
      const configNode = {
        id: "config-1",
        baseUrl: BASE_URL,
        workspaceId: "ws-123",
        credentials: { token: "test-token" },
      };

      const mockNode = {
        seqeraConfig: configNode,
        warn: sinon.stub(),
      };

      const RED = {
        nodes: {
          getNode: sinon.stub().callsFake((id) => {
            if (id === "node-123") return mockNode;
            return configNode;
          }),
        },
      };

      const req = createMockRequest();
      const res = createMockResponse();

      nock(BASE_URL).get("/data-links").query(true).reply(500, { error: "Server error" });

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal([]);
    });
  });
});

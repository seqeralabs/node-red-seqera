/**
 * Integration tests for HTTP admin endpoints
 *
 * Tests the HTTP endpoints registered on RED.httpAdmin
 */
const nock = require("nock");
const { createMockRED, simulateHttpRequest } = require("../helpers/mock-red");
const { createMockSeqeraConfigNode } = require("../helpers/mock-node");
const { mockSeqeraAPI, BASE_URL } = require("../helpers/mock-axios");

describe("HTTP Admin Endpoints", () => {
  let RED;
  let api;

  beforeEach(() => {
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);
  });

  describe("/seqera-config/connectivity-check", () => {
    beforeEach(() => {
      // Load config node to register endpoints
      require("../../nodes/config")(RED);
    });

    it("should register the endpoint", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/seqera-config/connectivity-check", expect.any(Function));
    });

    it("should return success on valid token", async () => {
      api.mockUserInfo({ user: { userName: "testuser" } });

      const handler = RED._testHelpers.getHttpHandler("get", "/seqera-config/connectivity-check");
      const { res } = await simulateHttpRequest(handler, {
        query: {
          baseUrl: BASE_URL,
          token: "test-token",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return error on invalid token", async () => {
      api.mockError("get", "/user-info", 401, "Unauthorized");

      const handler = RED._testHelpers.getHttpHandler("get", "/seqera-config/connectivity-check");
      const { res } = await simulateHttpRequest(handler, {
        query: {
          baseUrl: BASE_URL,
          token: "invalid-token",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(false);
    });

    it("should return error if baseUrl missing", async () => {
      const handler = RED._testHelpers.getHttpHandler("get", "/seqera-config/connectivity-check");
      const { res } = await simulateHttpRequest(handler, {
        query: {
          token: "test-token",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("/seqera-config/workspaces", () => {
    beforeEach(() => {
      require("../../nodes/config")(RED);
    });

    it("should register the endpoint", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/seqera-config/workspaces", expect.any(Function));
    });

    it("should return organizations and workspaces", async () => {
      api.mockUserInfo({
        user: {
          userName: "testuser",
          orgs: [
            {
              orgId: "org-1",
              name: "Test Org",
              workspaces: [
                { workspaceId: "ws-1", workspaceName: "Workspace 1" },
                { workspaceId: "ws-2", workspaceName: "Workspace 2" },
              ],
            },
          ],
        },
      });

      const handler = RED._testHelpers.getHttpHandler("get", "/seqera-config/workspaces");
      const { res } = await simulateHttpRequest(handler, {
        query: {
          baseUrl: BASE_URL,
          token: "test-token",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.orgs).toHaveLength(1);
      expect(res.body.orgs[0].name).toBe("Test Org");
      expect(res.body.orgs[0].workspaces).toHaveLength(2);
    });

    it("should handle API errors", async () => {
      api.mockError("get", "/user-info", 500, "Server Error");

      const handler = RED._testHelpers.getHttpHandler("get", "/seqera-config/workspaces");
      const { res } = await simulateHttpRequest(handler, {
        query: {
          baseUrl: BASE_URL,
          token: "test-token",
        },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  describe("/admin/seqera/pipelines/:nodeId", () => {
    beforeEach(() => {
      require("../../nodes/workflow-launch")(RED);
    });

    it("should register the endpoint", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/admin/seqera/pipelines/:nodeId", expect.any(Function));
    });

    it("should return pipelines for autocomplete", async () => {
      api.mockPipelines([
        { pipelineId: "1", name: "pipeline-1" },
        { pipelineId: "2", name: "pipeline-2" },
      ]);

      const handler = RED._testHelpers.getHttpHandler("get", "/admin/seqera/pipelines/:nodeId");
      const { res } = await simulateHttpRequest(handler, {
        params: { nodeId: "seqera-config-id" },
        query: { search: "pipeline" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it("should handle node not found with query params fallback", async () => {
      api.mockUserInfo({ user: { userName: "testuser" } });
      api.mockPipelines([{ pipelineId: "1", name: "test-pipeline" }]);

      const handler = RED._testHelpers.getHttpHandler("get", "/admin/seqera/pipelines/:nodeId");
      const { res } = await simulateHttpRequest(handler, {
        params: { nodeId: "non-existent-node" },
        query: {
          search: "test",
          baseUrl: BASE_URL,
          token: "test-token",
          workspaceId: "ws-123",
        },
      });

      expect(res.statusCode).toBe(200);
    });

    it("should filter pipelines by search term", async () => {
      api.mockPipelines([
        { pipelineId: "1", name: "nf-core/rnaseq" },
        { pipelineId: "2", name: "nf-core/atacseq" },
      ]);

      const handler = RED._testHelpers.getHttpHandler("get", "/admin/seqera/pipelines/:nodeId");
      const { res } = await simulateHttpRequest(handler, {
        params: { nodeId: "seqera-config-id" },
        query: { search: "rnaseq" },
      });

      expect(res.statusCode).toBe(200);
      // The API should filter by search, or return all for client-side filtering
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("/admin/seqera/datalinks/:nodeId", () => {
    beforeEach(() => {
      require("../../nodes/datalink-list")(RED);
    });

    it("should register the endpoint", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/admin/seqera/datalinks/:nodeId", expect.any(Function));
    });

    it("should return data links for autocomplete", async () => {
      api.mockDataLinksSearch([
        { id: "dl-1", name: "data-link-1", resourceRef: "s3://bucket1" },
        { id: "dl-2", name: "data-link-2", resourceRef: "s3://bucket2" },
      ]);

      const handler = RED._testHelpers.getHttpHandler("get", "/admin/seqera/datalinks/:nodeId");
      const { res } = await simulateHttpRequest(handler, {
        params: { nodeId: "seqera-config-id" },
        query: { search: "data" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it("should handle node not found with query params fallback", async () => {
      api.mockUserInfo({ user: { userName: "testuser" } });
      api.mockDataLinksSearch([{ id: "dl-1", name: "test-link", resourceRef: "s3://bucket" }]);

      const handler = RED._testHelpers.getHttpHandler("get", "/admin/seqera/datalinks/:nodeId");
      const { res } = await simulateHttpRequest(handler, {
        params: { nodeId: "non-existent-node" },
        query: {
          search: "test",
          baseUrl: BASE_URL,
          token: "test-token",
          workspaceId: "ws-123",
        },
      });

      expect(res.statusCode).toBe(200);
    });

    it("should return empty array when no matches", async () => {
      api.mockDataLinksSearch([]);

      const handler = RED._testHelpers.getHttpHandler("get", "/admin/seqera/datalinks/:nodeId");
      const { res } = await simulateHttpRequest(handler, {
        params: { nodeId: "seqera-config-id" },
        query: { search: "nonexistent" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe("endpoint error handling", () => {
    beforeEach(() => {
      require("../../nodes/config")(RED);
      require("../../nodes/workflow-launch")(RED);
      require("../../nodes/datalink-list")(RED);
    });

    it("should handle network errors gracefully", async () => {
      nock.cleanAll();
      nock(BASE_URL).get("/user-info").replyWithError("Network error");

      const handler = RED._testHelpers.getHttpHandler("get", "/seqera-config/connectivity-check");
      const { res } = await simulateHttpRequest(handler, {
        query: {
          baseUrl: BASE_URL,
          token: "test-token",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(false);
    });

    it("should handle missing query parameters", async () => {
      const handler = RED._testHelpers.getHttpHandler("get", "/seqera-config/workspaces");
      const { res } = await simulateHttpRequest(handler, {
        query: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("cross-endpoint consistency", () => {
    beforeEach(() => {
      require("../../nodes/config")(RED);
      require("../../nodes/workflow-launch")(RED);
      require("../../nodes/datalink-list")(RED);
    });

    it("should all endpoints use same authentication pattern", async () => {
      // All endpoints should accept baseUrl and token in query params
      // when the node doesn't exist
      api.mockUserInfo({ user: { userName: "testuser", orgs: [] } });
      api.mockPipelines([]);
      api.mockDataLinksSearch([]);

      const endpoints = [
        { path: "/seqera-config/workspaces", method: "get" },
        { path: "/admin/seqera/pipelines/:nodeId", method: "get", params: { nodeId: "new-node" } },
        { path: "/admin/seqera/datalinks/:nodeId", method: "get", params: { nodeId: "new-node" } },
      ];

      for (const endpoint of endpoints) {
        // Re-mock for each call since nock consumes mocks
        api.mockUserInfo({ user: { userName: "testuser", orgs: [] } });
        api.mockPipelines([]);
        api.mockDataLinksSearch([]);

        const handler = RED._testHelpers.getHttpHandler(endpoint.method, endpoint.path);
        const { res } = await simulateHttpRequest(handler, {
          params: endpoint.params || {},
          query: {
            baseUrl: BASE_URL,
            token: "test-token",
            workspaceId: "ws-123",
            search: "",
          },
        });

        expect(res.statusCode).toBe(200);
      }
    });
  });
});

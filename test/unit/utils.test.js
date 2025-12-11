/**
 * Tests for nodes/_utils.js
 */
const nock = require("nock");
const { buildHeaders, apiCall, handleDatalinkAutoComplete } = require("../../nodes/_utils");
const { createMockRED } = require("../helpers/mock-red");
const { createMockNode, createMockSeqeraConfigNode } = require("../helpers/mock-node");
const { mockSeqeraAPI, BASE_URL } = require("../helpers/mock-axios");

describe("_utils.js", () => {
  describe("buildHeaders", () => {
    it("should include Bearer token from seqeraConfig", () => {
      const node = createMockNode({
        seqeraConfig: createMockSeqeraConfigNode({ token: "my-secret-token" }),
      });

      const headers = buildHeaders(node);

      expect(headers.Authorization).toBe("Bearer my-secret-token");
    });

    it("should merge extra headers with auth header", () => {
      const node = createMockNode({
        seqeraConfig: createMockSeqeraConfigNode({ token: "test-token" }),
      });

      const headers = buildHeaders(node, {
        "Content-Type": "application/json",
        Accept: "application/json",
      });

      expect(headers.Authorization).toBe("Bearer test-token");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Accept).toBe("application/json");
    });

    it("should not modify the extraHeaders object", () => {
      const node = createMockNode({
        seqeraConfig: createMockSeqeraConfigNode({ token: "test-token" }),
      });
      const extraHeaders = { "Content-Type": "application/json" };

      buildHeaders(node, extraHeaders);

      expect(extraHeaders.Authorization).toBeUndefined();
    });

    it("should work with empty extra headers", () => {
      const node = createMockNode({
        seqeraConfig: createMockSeqeraConfigNode({ token: "token123" }),
      });

      const headers = buildHeaders(node, {});

      expect(headers.Authorization).toBe("Bearer token123");
      expect(Object.keys(headers)).toHaveLength(1);
    });
  });

  describe("apiCall", () => {
    let node;
    let api;

    beforeEach(() => {
      node = createMockNode({
        seqeraConfig: createMockSeqeraConfigNode({ token: "test-api-token" }),
      });
      api = mockSeqeraAPI();
    });

    it("should make GET request with auth headers", async () => {
      api.mockUserInfo({ user: { userName: "testuser" } });

      const response = await apiCall(node, "get", `${BASE_URL}/user-info`);

      expect(response.data).toEqual({ user: { userName: "testuser" } });
    });

    it("should make POST request with auth headers and data", async () => {
      api.mockWorkflowLaunch({ workflowId: "wf-abc123" });

      const response = await apiCall(node, "post", `${BASE_URL}/workflow/launch?workspaceId=ws-123`, {
        data: { launch: { pipeline: "test" } },
      });

      expect(response.data).toEqual({ workflowId: "wf-abc123" });
    });

    it("should merge provided headers with auth headers", async () => {
      const scope = nock(BASE_URL)
        .get("/test")
        .matchHeader("authorization", "Bearer test-api-token")
        .matchHeader("x-custom", "custom-value")
        .reply(200, { success: true });

      await apiCall(node, "get", `${BASE_URL}/test`, {
        headers: { "X-Custom": "custom-value" },
      });

      expect(scope.isDone()).toBe(true);
    });

    it("should call node.warn on API error", async () => {
      api.mockError("get", "/fail", 500, "Internal Server Error");

      await expect(apiCall(node, "get", `${BASE_URL}/fail`)).rejects.toThrow();

      expect(node.warn).toHaveBeenCalled();
      const warnArg = node.warn.mock.calls[0][0];
      expect(warnArg.message).toContain("Seqera API GET call to");
      expect(warnArg.message).toContain("failed");
    });

    it("should redact token in error log", async () => {
      api.mockError("get", "/fail", 401, "Unauthorized");

      await expect(apiCall(node, "get", `${BASE_URL}/fail`)).rejects.toThrow();

      const warnArg = node.warn.mock.calls[0][0];
      expect(warnArg.request.headers.Authorization).toBe("Bearer *********");
      expect(warnArg.request.headers.Authorization).not.toContain("test-api-token");
    });

    it("should re-throw error after logging", async () => {
      api.mockError("get", "/error-endpoint", 404, "Not Found");

      await expect(apiCall(node, "get", `${BASE_URL}/error-endpoint`)).rejects.toThrow();
    });

    it("should handle network errors", async () => {
      api.mockNetworkError("get", "/network-fail", "ECONNREFUSED");

      await expect(apiCall(node, "get", `${BASE_URL}/network-fail`)).rejects.toThrow();

      expect(node.warn).toHaveBeenCalled();
    });

    it("should include request details in error log", async () => {
      api.mockError("post", "/debug", 400, "Bad Request");

      await expect(
        apiCall(node, "post", `${BASE_URL}/debug`, {
          data: { test: "data" },
        }),
      ).rejects.toThrow();

      const warnArg = node.warn.mock.calls[0][0];
      expect(warnArg.request.method).toBe("POST");
      expect(warnArg.request.url).toBe(`${BASE_URL}/debug`);
    });
  });

  describe("handleDatalinkAutoComplete", () => {
    let RED;
    let api;

    beforeEach(() => {
      RED = createMockRED();
      api = mockSeqeraAPI();
    });

    it("should return empty array if no workspaceId", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: null });
      RED._testHelpers.addNode("config-id", seqeraConfig);

      // Directly test the function
      const req = { params: { nodeId: "test-node" }, query: {} };
      const res = { json: jest.fn() };
      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should fetch and format data links", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({
        workspaceId: "ws-123",
        token: "token-123",
      });
      RED._testHelpers.addNode("config-id", seqeraConfig);

      // Create a node that references the config
      const node = createMockNode({ seqeraConfig });
      RED._testHelpers.addNode("test-node-id", node);

      api.mockDataLinks([
        { id: "dl-1", name: "data-link-1" },
        { id: "dl-2", name: "data-link-2" },
      ]);

      const req = {
        params: { nodeId: "test-node-id" },
        query: { search: "" },
      };
      const res = { json: jest.fn() };

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json).toHaveBeenCalledWith([
        { value: "data-link-1", label: "data-link-1" },
        { value: "data-link-2", label: "data-link-2" },
      ]);
    });

    it("should use search parameter in API call", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({
        workspaceId: "ws-123",
        token: "token-123",
      });
      RED._testHelpers.addNode("config-id", seqeraConfig);

      const node = createMockNode({ seqeraConfig });
      RED._testHelpers.addNode("test-node-id", node);

      const scope = nock(BASE_URL)
        .get("/data-links")
        .query((query) => query.search === "my-search")
        .matchHeader("authorization", /^Bearer .+/)
        .reply(200, { dataLinks: [{ id: "dl-1", name: "my-search-result" }] });

      const req = {
        params: { nodeId: "test-node-id" },
        query: { search: "my-search" },
      };
      const res = { json: jest.fn() };

      await handleDatalinkAutoComplete(RED, req, res);

      expect(scope.isDone()).toBe(true);
      expect(res.json).toHaveBeenCalledWith([{ value: "my-search-result", label: "my-search-result" }]);
    });

    it("should handle node not existing (new node case)", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({
        workspaceId: "ws-123",
        token: "token-123",
      });
      RED._testHelpers.addNode("config-id", seqeraConfig);

      api.mockDataLinks([{ id: "dl-1", name: "link-1" }]);

      const req = {
        params: { nodeId: "non-existent-node" },
        query: { seqeraConfig: "config-id", search: "" },
      };
      const res = { json: jest.fn() };

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json).toHaveBeenCalledWith([{ value: "link-1", label: "link-1" }]);
    });

    it("should use workspace ID from query params", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({
        workspaceId: "default-ws",
        token: "token-123",
      });
      RED._testHelpers.addNode("config-id", seqeraConfig);

      const node = createMockNode({ seqeraConfig });
      RED._testHelpers.addNode("test-node-id", node);

      const scope = nock(BASE_URL)
        .get("/data-links")
        .query((query) => query.workspaceId === "override-ws")
        .matchHeader("authorization", /^Bearer .+/)
        .reply(200, { dataLinks: [] });

      const req = {
        params: { nodeId: "test-node-id" },
        query: { workspaceId: "override-ws", search: "" },
      };
      const res = { json: jest.fn() };

      await handleDatalinkAutoComplete(RED, req, res);

      expect(scope.isDone()).toBe(true);
    });

    it("should return empty array on API error", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({
        workspaceId: "ws-123",
        token: "token-123",
      });
      RED._testHelpers.addNode("config-id", seqeraConfig);

      const node = createMockNode({ seqeraConfig });
      RED._testHelpers.addNode("test-node-id", node);

      api.mockError("get", "/data-links", 500, "Server Error");

      const req = {
        params: { nodeId: "test-node-id" },
        query: { search: "" },
      };
      const res = { json: jest.fn() };

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should return empty array if no seqeraConfig", async () => {
      const req = {
        params: { nodeId: "non-existent" },
        query: {},
      };
      const res = { json: jest.fn() };

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("should handle empty dataLinks response", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({
        workspaceId: "ws-123",
        token: "token-123",
      });
      RED._testHelpers.addNode("config-id", seqeraConfig);

      const node = createMockNode({ seqeraConfig });
      RED._testHelpers.addNode("test-node-id", node);

      api.mockDataLinks([]);

      const req = {
        params: { nodeId: "test-node-id" },
        query: { search: "" },
      };
      const res = { json: jest.fn() };

      await handleDatalinkAutoComplete(RED, req, res);

      expect(res.json).toHaveBeenCalledWith([]);
    });
  });
});

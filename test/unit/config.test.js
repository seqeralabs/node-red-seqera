/**
 * Tests for nodes/config.js (seqera-config node)
 */
const nock = require("nock");
const { createMockRED } = require("../helpers/mock-red");
const { BASE_URL } = require("../helpers/mock-axios");

describe("seqera-config node", () => {
  let RED;

  beforeEach(() => {
    RED = createMockRED();
    // Load the config node module
    require("../../nodes/config")(RED);
  });

  describe("node registration", () => {
    it("should register seqera-config type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith("seqera-config", expect.any(Function), expect.any(Object));
    });

    it("should register credentials schema with token", () => {
      const registerCall = RED.nodes.registerType.mock.calls.find((call) => call[0] === "seqera-config");
      expect(registerCall[2]).toEqual({
        credentials: {
          token: { type: "password" },
        },
      });
    });
  });

  describe("node initialization", () => {
    it("should set baseUrl from config", () => {
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-config").constructor;
      const node = {};
      RED._testHelpers.addCredentials("test-id", { token: "test-token" });

      NodeConstructor.call(node, {
        id: "test-id",
        baseUrl: "https://custom.api.example.com",
        workspaceId: "ws-123",
      });

      expect(node.baseUrl).toBe("https://custom.api.example.com");
    });

    it("should use default baseUrl if not provided", () => {
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-config").constructor;
      const node = {};

      NodeConstructor.call(node, { id: "test-id" });

      expect(node.baseUrl).toBe("https://api.cloud.seqera.io");
    });

    it("should set workspaceId from config", () => {
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-config").constructor;
      const node = {};

      NodeConstructor.call(node, { id: "test-id", workspaceId: "my-workspace-id" });

      expect(node.workspaceId).toBe("my-workspace-id");
    });

    it("should set workspaceId to null if not provided", () => {
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-config").constructor;
      const node = {};

      NodeConstructor.call(node, { id: "test-id" });

      expect(node.workspaceId).toBeNull();
    });

    it("should load credentials", () => {
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-config").constructor;
      const node = {};
      RED._testHelpers.addCredentials("test-id", { token: "secret-token" });

      NodeConstructor.call(node, { id: "test-id" });

      expect(node.credentials).toEqual({ token: "secret-token" });
    });
  });

  describe("/seqera-config/connectivity-check endpoint", () => {
    it("should register GET endpoint", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/seqera-config/connectivity-check", expect.any(Function));
    });

    it("should return success with user info on valid token", async () => {
      nock(BASE_URL)
        .get("/user-info")
        .matchHeader("authorization", "Bearer valid-token")
        .reply(200, {
          user: { userName: "testuser", email: "test@example.com" },
        });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, token: "valid-token" },
      });

      expect(data.success).toBe(true);
      expect(data.user).toEqual({
        userName: "testuser",
        email: "test@example.com",
      });
    });

    it("should return failure if no token provided", async () => {
      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("No API token provided");
      expect(data.isEmptyToken).toBe(true);
    });

    it("should return failure if no baseUrl provided", async () => {
      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { token: "some-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("No base URL provided");
    });

    it("should retrieve stored token if nodeId provided", async () => {
      RED._testHelpers.addCredentials("config-node-id", { token: "stored-token" });

      nock(BASE_URL)
        .get("/user-info")
        .matchHeader("authorization", "Bearer stored-token")
        .reply(200, {
          user: { userName: "storeduser", email: "stored@example.com" },
        });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, nodeId: "config-node-id" },
      });

      expect(data.success).toBe(true);
      expect(data.user.userName).toBe("storeduser");
    });

    it("should return failure if nodeId provided but no stored token", async () => {
      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, nodeId: "non-existent-node" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("No stored token found");
      expect(data.isEmptyToken).toBe(true);
    });

    it("should return failure on 401 (invalid token)", async () => {
      nock(BASE_URL).get("/user-info").reply(401, { message: "Unauthorized" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, token: "invalid-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid API token");
    });

    it("should return failure on 403 (forbidden)", async () => {
      nock(BASE_URL).get("/user-info").reply(403, { message: "Forbidden" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, token: "forbidden-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid API token");
    });

    it("should return failure on other API errors", async () => {
      nock(BASE_URL).get("/user-info").reply(500, { message: "Server Error" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, token: "some-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("API error: 500");
    });

    it("should return failure on network error (ENOTFOUND)", async () => {
      nock(BASE_URL).get("/user-info").replyWithError({ code: "ENOTFOUND" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, token: "some-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toContain("Connection failed");
    });

    it("should return failure on connection refused", async () => {
      nock(BASE_URL).get("/user-info").replyWithError({ code: "ECONNREFUSED" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, token: "some-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toContain("Connection failed");
    });

    it("should return failure on timeout", async () => {
      nock(BASE_URL).get("/user-info").replyWithError({ code: "ETIMEDOUT" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, token: "some-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toContain("timeout");
    });

    it("should return failure on invalid response (missing user)", async () => {
      nock(BASE_URL).get("/user-info").reply(200, { something: "else" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/connectivity-check", {
        query: { baseUrl: BASE_URL, token: "some-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid response from Seqera API");
    });
  });

  describe("/seqera-config/workspaces endpoint", () => {
    it("should register GET endpoint", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/seqera-config/workspaces", expect.any(Function));
    });

    it("should return organizations with workspaces", async () => {
      nock(BASE_URL)
        .get("/orgs")
        .reply(200, {
          organizations: [
            { orgId: 1, name: "org1", fullName: "Organization One" },
            { orgId: 2, name: "org2", fullName: "Organization Two" },
          ],
        });

      nock(BASE_URL)
        .get("/orgs/1/workspaces")
        .reply(200, {
          workspaces: [
            { id: "ws-1", name: "workspace1" },
            { id: "ws-2", name: "workspace2" },
          ],
        });

      nock(BASE_URL)
        .get("/orgs/2/workspaces")
        .reply(200, {
          workspaces: [{ id: "ws-3", name: "workspace3" }],
        });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, token: "valid-token" },
      });

      expect(data.success).toBe(true);
      expect(data.organizations).toHaveLength(2);
      expect(data.organizations[0].orgName).toBe("org1");
      expect(data.organizations[0].workspaces).toHaveLength(2);
    });

    it("should filter out community org", async () => {
      nock(BASE_URL)
        .get("/orgs")
        .reply(200, {
          organizations: [
            { orgId: 1, name: "community", fullName: "Community" },
            { orgId: 2, name: "myorg", fullName: "My Org" },
          ],
        });

      nock(BASE_URL)
        .get("/orgs/2/workspaces")
        .reply(200, {
          workspaces: [{ id: "ws-1", name: "workspace1" }],
        });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, token: "valid-token" },
      });

      expect(data.success).toBe(true);
      expect(data.organizations).toHaveLength(1);
      expect(data.organizations[0].orgName).toBe("myorg");
    });

    it("should sort organizations alphabetically", async () => {
      nock(BASE_URL)
        .get("/orgs")
        .reply(200, {
          organizations: [
            { orgId: 1, name: "zebra", fullName: "Zebra Org" },
            { orgId: 2, name: "alpha", fullName: "Alpha Org" },
            { orgId: 3, name: "beta", fullName: "Beta Org" },
          ],
        });

      nock(BASE_URL)
        .get("/orgs/1/workspaces")
        .reply(200, { workspaces: [{ id: "ws-1", name: "ws1" }] });
      nock(BASE_URL)
        .get("/orgs/2/workspaces")
        .reply(200, { workspaces: [{ id: "ws-2", name: "ws2" }] });
      nock(BASE_URL)
        .get("/orgs/3/workspaces")
        .reply(200, { workspaces: [{ id: "ws-3", name: "ws3" }] });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, token: "valid-token" },
      });

      expect(data.organizations[0].orgName).toBe("alpha");
      expect(data.organizations[1].orgName).toBe("beta");
      expect(data.organizations[2].orgName).toBe("zebra");
    });

    it("should sort workspaces alphabetically within org", async () => {
      nock(BASE_URL)
        .get("/orgs")
        .reply(200, {
          organizations: [{ orgId: 1, name: "org1", fullName: "Org One" }],
        });

      nock(BASE_URL)
        .get("/orgs/1/workspaces")
        .reply(200, {
          workspaces: [
            { id: "ws-3", name: "zeta" },
            { id: "ws-1", name: "alpha" },
            { id: "ws-2", name: "beta" },
          ],
        });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, token: "valid-token" },
      });

      expect(data.organizations[0].workspaces[0].name).toBe("alpha");
      expect(data.organizations[0].workspaces[1].name).toBe("beta");
      expect(data.organizations[0].workspaces[2].name).toBe("zeta");
    });

    it("should exclude orgs with no workspaces", async () => {
      nock(BASE_URL)
        .get("/orgs")
        .reply(200, {
          organizations: [
            { orgId: 1, name: "empty-org", fullName: "Empty Org" },
            { orgId: 2, name: "has-workspaces", fullName: "Has Workspaces" },
          ],
        });

      nock(BASE_URL).get("/orgs/1/workspaces").reply(200, { workspaces: [] });
      nock(BASE_URL)
        .get("/orgs/2/workspaces")
        .reply(200, { workspaces: [{ id: "ws-1", name: "ws1" }] });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, token: "valid-token" },
      });

      expect(data.organizations).toHaveLength(1);
      expect(data.organizations[0].orgName).toBe("has-workspaces");
    });

    it("should handle workspace fetch failure for single org", async () => {
      nock(BASE_URL)
        .get("/orgs")
        .reply(200, {
          organizations: [
            { orgId: 1, name: "failing-org", fullName: "Failing Org" },
            { orgId: 2, name: "working-org", fullName: "Working Org" },
          ],
        });

      nock(BASE_URL).get("/orgs/1/workspaces").reply(500, { message: "Error" });
      nock(BASE_URL)
        .get("/orgs/2/workspaces")
        .reply(200, { workspaces: [{ id: "ws-1", name: "ws1" }] });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, token: "valid-token" },
      });

      // Should still return working org
      expect(data.success).toBe(true);
      expect(data.organizations).toHaveLength(1);
      expect(data.organizations[0].orgName).toBe("working-org");
    });

    it("should return failure if no token provided", async () => {
      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("No API token provided");
    });

    it("should return failure if no baseUrl provided", async () => {
      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { token: "some-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("No base URL provided");
    });

    it("should retrieve stored token if nodeId provided", async () => {
      RED._testHelpers.addCredentials("config-node-id", { token: "stored-token" });

      nock(BASE_URL).get("/orgs").matchHeader("authorization", "Bearer stored-token").reply(200, { organizations: [] });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, nodeId: "config-node-id" },
      });

      expect(data.success).toBe(true);
    });

    it("should return failure on 401", async () => {
      nock(BASE_URL).get("/orgs").reply(401, { message: "Unauthorized" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, token: "invalid-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid API token");
    });

    it("should return failure on invalid orgs response", async () => {
      nock(BASE_URL).get("/orgs").reply(200, { something: "else" });

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/seqera-config/workspaces", {
        query: { baseUrl: BASE_URL, token: "valid-token" },
      });

      expect(data.success).toBe(false);
      expect(data.message).toBe("Invalid organizations response");
    });
  });
});

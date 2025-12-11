/**
 * Tests for nodes/workflow-poll.js
 */
const nock = require("nock");
const { createMockRED } = require("../helpers/mock-red");
const { createMockSeqeraConfigNode } = require("../helpers/mock-node");
const { mockSeqeraAPI, BASE_URL } = require("../helpers/mock-axios");

describe("seqera-workflow-poll node", () => {
  let RED;
  let api;

  beforeEach(() => {
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the workflow-poll node module
    require("../../nodes/workflow-poll")(RED);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  function createNode(configOverrides = {}) {
    const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-workflow-poll").constructor;
    const node = {};

    const config = {
      id: "test-node-id",
      name: "test-poll",
      seqera: "seqera-config-id",
      search: "",
      searchType: "str",
      maxResults: "50",
      maxResultsType: "num",
      workspaceId: "",
      workspaceIdType: "str",
      pollFrequency: "1",
      pollUnits: "minutes",
      ...configOverrides,
    };

    NodeConstructor.call(node, config);
    return node;
  }

  // Helper to wait for async operations to complete
  async function waitForPolling(node, timeout = 100) {
    // Give time for the immediate poll to complete
    await new Promise((resolve) => setTimeout(resolve, timeout));
  }

  describe("node registration", () => {
    it("should register seqera-workflow-poll type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-workflow-poll",
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe("automatic polling initialization", () => {
    it("should execute poll immediately on initialization", async () => {
      api.mockWorkflowsList([]);

      const node = createNode();
      await waitForPolling(node);

      // Should have set status during polling
      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );

      // Clean up interval
      await node._triggerClose();
    });

    it("should set green status after successful poll", async () => {
      api.mockWorkflowsList([]);

      const node = createNode();
      await waitForPolling(node);

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "green",
          shape: "dot",
        }),
      );

      await node._triggerClose();
    });

    it("should calculate poll frequency correctly - seconds", () => {
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "30", pollUnits: "seconds" });
      expect(node.pollFrequencySec).toBe(30);

      node._triggerClose();
    });

    it("should calculate poll frequency correctly - minutes", () => {
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "5", pollUnits: "minutes" });
      expect(node.pollFrequencySec).toBe(300);

      node._triggerClose();
    });

    it("should calculate poll frequency correctly - hours", () => {
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "2", pollUnits: "hours" });
      expect(node.pollFrequencySec).toBe(7200);

      node._triggerClose();
    });

    it("should calculate poll frequency correctly - days", () => {
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "1", pollUnits: "days" });
      expect(node.pollFrequencySec).toBe(86400);

      node._triggerClose();
    });
  });

  describe("output format", () => {
    it("should send all workflows to output 1", async () => {
      api.mockWorkflowsList([
        { workflow: { id: "wf-1", status: "running" } },
        { workflow: { id: "wf-2", status: "succeeded" } },
      ]);

      const node = createNode();
      await waitForPolling(node);

      // Check output 1 was called with all workflows
      const sendCalls = node.send.mock.calls;
      const output1Call = sendCalls.find((call) => call[0][0] !== null);

      expect(output1Call).toBeDefined();
      expect(output1Call[0][0].payload.workflows).toHaveLength(2);
      expect(output1Call[0][0].workflowIds).toEqual(["wf-1", "wf-2"]);

      await node._triggerClose();
    });

    it("should include nextPoll timestamp in output", async () => {
      api.mockWorkflowsList([{ workflow: { id: "wf-1" } }]);

      const node = createNode({ pollFrequency: "5", pollUnits: "minutes" });
      await waitForPolling(node);

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.payload.nextPoll).toBeDefined();
      // nextPoll should be in the future
      expect(new Date(output1.payload.nextPoll).getTime()).toBeGreaterThan(Date.now());

      await node._triggerClose();
    });

    it("should not send to output 2 on first poll (no previous state)", async () => {
      api.mockWorkflowsList([
        { workflow: { id: "wf-1", status: "running" } },
        { workflow: { id: "wf-2", status: "running" } },
      ]);

      const node = createNode();
      await waitForPolling(node);

      // On first poll, output 2 should be null for all calls
      const output2Calls = node.send.mock.calls.filter((call) => call[0][1] !== null);
      expect(output2Calls).toHaveLength(0);

      await node._triggerClose();
    });
  });

  describe("API parameters", () => {
    it("should use search parameter if provided", async () => {
      const scope = nock(BASE_URL)
        .get("/workflow")
        .query((q) => q.search === "my-search-term")
        .reply(200, { workflows: [] });

      const node = createNode({ search: "my-search-term", searchType: "str" });
      await waitForPolling(node);

      expect(scope.isDone()).toBe(true);

      await node._triggerClose();
    });

    it("should use maxResults parameter", async () => {
      const scope = nock(BASE_URL)
        .get("/workflow")
        .query((q) => q.max === "25")
        .reply(200, { workflows: [] });

      const node = createNode({ maxResults: "25", maxResultsType: "num" });
      await waitForPolling(node);

      expect(scope.isDone()).toBe(true);

      await node._triggerClose();
    });

    it("should use workspaceId parameter", async () => {
      const scope = nock(BASE_URL)
        .get("/workflow")
        .query((q) => q.workspaceId === "ws-123")
        .reply(200, { workflows: [] });

      const node = createNode();
      await waitForPolling(node);

      expect(scope.isDone()).toBe(true);

      await node._triggerClose();
    });

    it("should include attributes=minimal in query", async () => {
      const scope = nock(BASE_URL)
        .get("/workflow")
        .query((q) => q.attributes === "minimal")
        .reply(200, { workflows: [] });

      const node = createNode();
      await waitForPolling(node);

      expect(scope.isDone()).toBe(true);

      await node._triggerClose();
    });
  });

  describe("error handling", () => {
    it("should error if no workspaceId provided", async () => {
      // Create config without workspaceId
      const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: null });
      RED._testHelpers.addNode("seqera-config-no-ws", seqeraConfig);

      const node = createNode({ seqera: "seqera-config-no-ws" });
      await waitForPolling(node);

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("Workspace ID not provided"));

      await node._triggerClose();
    });

    it("should set red dot status on API error", async () => {
      api.mockError("get", "/workflow", 500, "Server Error");

      const node = createNode();
      await waitForPolling(node);

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "dot",
        }),
      );

      await node._triggerClose();
    });

    it("should handle empty workflows response", async () => {
      api.mockWorkflowsList([]);

      const node = createNode();
      await waitForPolling(node);

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.payload.workflows).toEqual([]);
      expect(output1.workflowIds).toEqual([]);

      await node._triggerClose();
    });
  });

  describe("cleanup", () => {
    it("should clear polling interval on node close", async () => {
      api.mockWorkflowsList([]);

      const node = createNode();
      await waitForPolling(node);

      // Trigger close - should not throw
      await node._triggerClose();
    });

    it("should handle close when no config node exists", () => {
      // Create node without seqera config reference
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-workflow-poll").constructor;
      const node = {};

      const config = {
        id: "test-node-id",
        name: "test-poll",
        seqera: "non-existent-config", // This won't resolve
        pollFrequency: "1",
        pollUnits: "minutes",
      };

      NodeConstructor.call(node, config);

      // Close should not throw even without interval
      node._triggerClose();
    });
  });
});

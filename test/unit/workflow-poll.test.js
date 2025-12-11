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
    jest.useFakeTimers();
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the workflow-poll node module
    require("../../nodes/workflow-poll")(RED);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
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

  describe("node registration", () => {
    it("should register seqera-workflow-poll type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-workflow-poll",
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe("automatic polling", () => {
    it("should execute poll immediately on initialization", async () => {
      api.mockWorkflowsList([]);

      const node = createNode();

      // Should have been called immediately
      await Promise.resolve();
      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );
    });

    it("should poll at configured interval", async () => {
      // First poll
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "5", pollUnits: "seconds" });
      await Promise.resolve();

      // Reset status mock to track subsequent calls
      const initialStatusCalls = node.status.mock.calls.length;

      // Second poll after interval
      api.mockWorkflowsList([]);
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(node.status.mock.calls.length).toBeGreaterThan(initialStatusCalls);
    });

    it("should convert poll frequency with units correctly - minutes", async () => {
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "2", pollUnits: "minutes" });
      await Promise.resolve();

      const initialStatusCalls = node.status.mock.calls.length;

      // Should NOT poll after 1 minute
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
      const afterOneMinute = node.status.mock.calls.length;

      // Should poll after 2 minutes
      api.mockWorkflowsList([]);
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      expect(node.status.mock.calls.length).toBeGreaterThan(afterOneMinute);
    });

    it("should convert poll frequency with units correctly - hours", async () => {
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "1", pollUnits: "hours" });
      await Promise.resolve();

      const initialStatusCalls = node.status.mock.calls.length;

      // Should NOT poll after 30 minutes
      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();
      expect(node.status.mock.calls.length).toBe(initialStatusCalls);

      // Should poll after full hour
      api.mockWorkflowsList([]);
      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();

      expect(node.status.mock.calls.length).toBeGreaterThan(initialStatusCalls);
    });
  });

  describe("multiple outputs", () => {
    it("should send all workflows to output 1", async () => {
      api.mockWorkflowsList([
        { workflow: { id: "wf-1", status: "running" } },
        { workflow: { id: "wf-2", status: "succeeded" } },
      ]);

      const node = createNode();
      await Promise.resolve();

      // Check output 1 was called with all workflows
      const sendCalls = node.send.mock.calls;
      const output1Call = sendCalls.find((call) => call[0][0] !== null);

      expect(output1Call).toBeDefined();
      expect(output1Call[0][0].payload.workflows).toHaveLength(2);
      expect(output1Call[0][0].workflowIds).toEqual(["wf-1", "wf-2"]);
    });

    it("should send new workflows to output 2 on subsequent polls", async () => {
      // First poll - two workflows
      api.mockWorkflowsList([
        { workflow: { id: "wf-1", status: "running" } },
        { workflow: { id: "wf-2", status: "running" } },
      ]);

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      node.send.mockClear();

      // Second poll - one new workflow
      api.mockWorkflowsList([
        { workflow: { id: "wf-1", status: "running" } },
        { workflow: { id: "wf-2", status: "running" } },
        { workflow: { id: "wf-3", status: "submitted" } },
      ]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should have sent to output 2 for new workflow
      const output2Calls = node.send.mock.calls.filter((call) => call[0][1] !== null);
      expect(output2Calls).toHaveLength(1);
      expect(output2Calls[0][0][1].workflowId).toBe("wf-3");
    });

    it("should not send to output 2 on first poll (no previous state)", async () => {
      api.mockWorkflowsList([
        { workflow: { id: "wf-1", status: "running" } },
        { workflow: { id: "wf-2", status: "running" } },
      ]);

      const node = createNode();
      await Promise.resolve();

      // On first poll, output 2 should be null for all calls
      const output2Calls = node.send.mock.calls.filter((call) => call[0][1] !== null);
      expect(output2Calls).toHaveLength(0);
    });
  });

  describe("state tracking", () => {
    it("should track previously seen workflow IDs", async () => {
      // First poll
      api.mockWorkflowsList([{ workflow: { id: "wf-existing", status: "running" } }]);

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      node.send.mockClear();

      // Second poll - same workflow
      api.mockWorkflowsList([{ workflow: { id: "wf-existing", status: "running" } }]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should NOT have output 2 calls since no new workflows
      const output2Calls = node.send.mock.calls.filter((call) => call[0][1] !== null);
      expect(output2Calls).toHaveLength(0);
    });

    it("should detect new workflows correctly", async () => {
      // First poll
      api.mockWorkflowsList([{ workflow: { id: "wf-1", status: "running" } }]);

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      node.send.mockClear();

      // Second poll - two new workflows
      api.mockWorkflowsList([
        { workflow: { id: "wf-1", status: "running" } },
        { workflow: { id: "wf-new-1", status: "submitted" } },
        { workflow: { id: "wf-new-2", status: "submitted" } },
      ]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should have 2 output 2 calls
      const output2Calls = node.send.mock.calls.filter((call) => call[0][1] !== null);
      expect(output2Calls).toHaveLength(2);
    });
  });

  describe("API parameters", () => {
    it("should use search parameter if provided", async () => {
      const scope = nock(BASE_URL)
        .get("/workflow")
        .query((q) => q.search === "my-search-term")
        .reply(200, { workflows: [] });

      createNode({ search: "my-search-term", searchType: "str" });
      await Promise.resolve();

      expect(scope.isDone()).toBe(true);
    });

    it("should use maxResults parameter", async () => {
      const scope = nock(BASE_URL)
        .get("/workflow")
        .query((q) => q.max === "25")
        .reply(200, { workflows: [] });

      createNode({ maxResults: "25", maxResultsType: "num" });
      await Promise.resolve();

      expect(scope.isDone()).toBe(true);
    });

    it("should use workspaceId parameter", async () => {
      const scope = nock(BASE_URL)
        .get("/workflow")
        .query((q) => q.workspaceId === "ws-123")
        .reply(200, { workflows: [] });

      createNode();
      await Promise.resolve();

      expect(scope.isDone()).toBe(true);
    });

    it("should error if no workspaceId provided", async () => {
      // Create config without workspaceId
      const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: null });
      RED._testHelpers.addNode("seqera-config-no-ws", seqeraConfig);

      const node = createNode({ seqera: "seqera-config-no-ws" });
      await Promise.resolve();

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("Workspace ID not provided"));
    });
  });

  describe("error handling", () => {
    it("should set red dot status on error", async () => {
      api.mockError("get", "/workflow", 500, "Server Error");

      const node = createNode();
      await Promise.resolve();

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "dot",
        }),
      );
    });

    it("should continue polling after error", async () => {
      // First poll fails
      api.mockError("get", "/workflow", 500, "Server Error");

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      expect(node.error).toHaveBeenCalled();
      node.error.mockClear();
      node.status.mockClear();

      // Second poll succeeds
      api.mockWorkflowsList([]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should have attempted poll and succeeded
      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "green",
          shape: "dot",
        }),
      );
    });
  });

  describe("cleanup", () => {
    it("should clear polling interval on node close", async () => {
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      // Trigger close
      await node._triggerClose();

      // Clear mocks
      node.status.mockClear();

      // Advance time - no more polling should happen
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Status should not have been updated
      expect(node.status).not.toHaveBeenCalled();
    });
  });

  describe("output format", () => {
    it("should include nextPoll timestamp in output 1", async () => {
      api.mockWorkflowsList([{ workflow: { id: "wf-1" } }]);

      const node = createNode({ pollFrequency: "5", pollUnits: "minutes" });
      await Promise.resolve();

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.payload.nextPoll).toBeDefined();
      expect(new Date(output1.payload.nextPoll).getTime()).toBeGreaterThan(Date.now());
    });

    it("should include workflowId in output 2 messages", async () => {
      // First poll
      api.mockWorkflowsList([]);

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      node.send.mockClear();

      // Second poll with new workflow
      api.mockWorkflowsList([{ workflow: { id: "wf-new", status: "running", runName: "my-run" } }]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const output2Calls = node.send.mock.calls.filter((call) => call[0][1] !== null);
      expect(output2Calls[0][0][1].workflowId).toBe("wf-new");
      expect(output2Calls[0][0][1].payload.workflow.workflow.id).toBe("wf-new");
    });
  });
});

/**
 * Tests for nodes/workflow-monitor.js
 */
const nock = require("nock");
const { createMockRED } = require("../helpers/mock-red");
const { createMockSeqeraConfigNode } = require("../helpers/mock-node");
const { mockSeqeraAPI, BASE_URL } = require("../helpers/mock-axios");
const { createMockMsg, expectMessagePassthrough } = require("../helpers/test-utils");

describe("seqera-workflow-monitor node", () => {
  let RED;
  let api;

  beforeEach(() => {
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the workflow-monitor node module
    require("../../nodes/workflow-monitor")(RED);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  function createNode(configOverrides = {}) {
    const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-workflow-monitor").constructor;
    const node = {};

    const config = {
      id: "test-node-id",
      name: "test-monitor",
      seqera: "seqera-config-id",
      workflowId: "workflowId",
      workflowIdType: "msg",
      workspaceId: "",
      workspaceIdType: "str",
      poll: "5",
      pollType: "num",
      keepPolling: false, // Default to false for simpler testing
      ...configOverrides,
    };

    NodeConstructor.call(node, config);
    return node;
  }

  describe("node registration", () => {
    it("should register seqera-workflow-monitor type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-workflow-monitor",
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe("basic status fetching", () => {
    it("should fetch workflow status on input", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      const done = jest.fn();

      await node._triggerInput(msg, send, done);

      expect(send).toHaveBeenCalled();
    });

    it("should set status color based on workflow status - submitted (yellow)", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "submitted" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "yellow",
          shape: "ring",
        }),
      );
    });

    it("should set status color based on workflow status - running (blue)", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );
    });

    it("should set status color based on workflow status - succeeded (green)", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "succeeded" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "green",
          shape: "dot",
        }),
      );
    });

    it("should set status color based on workflow status - failed (red)", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "failed" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "dot",
        }),
      );
    });

    it("should set status color based on workflow status - cancelled (grey)", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "cancelled" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "grey",
          shape: "dot",
        }),
      );
    });
  });

  describe("multiple outputs", () => {
    it("should send to output 1 for submitted status", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "submitted" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).not.toBeNull(); // Output 1
      expect(args[1]).toBeNull(); // Output 2
      expect(args[2]).toBeNull(); // Output 3
    });

    it("should send to output 1 for running status", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).not.toBeNull(); // Output 1
      expect(args[1]).toBeNull(); // Output 2
      expect(args[2]).toBeNull(); // Output 3
    });

    it("should send to output 2 for succeeded status", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "succeeded" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).toBeNull(); // Output 1
      expect(args[1]).not.toBeNull(); // Output 2
      expect(args[2]).toBeNull(); // Output 3
    });

    it("should send to output 3 for failed status", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "failed" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).toBeNull(); // Output 1
      expect(args[1]).toBeNull(); // Output 2
      expect(args[2]).not.toBeNull(); // Output 3
    });

    it("should send to output 3 for cancelled status", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "cancelled" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).toBeNull(); // Output 1
      expect(args[1]).toBeNull(); // Output 2
      expect(args[2]).not.toBeNull(); // Output 3
    });
  });

  describe("polling control", () => {
    it("should not start polling when keepPolling=false", async () => {
      const node = createNode({ keepPolling: false });
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);
      // Verify no interval was set
      expect(node._currentPollMs).toBeUndefined();
    });

    it("should not continue polling when workflow reaches terminal state", async () => {
      const node = createNode({ keepPolling: true });
      api.mockWorkflowStatus("wf-123", { status: "succeeded" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);
      // Terminal state means polling should be cleared
      const args = send.mock.calls[0][0];
      expect(args[1]).not.toBeNull(); // Succeeded output

      // Clean up any intervals
      await node._triggerClose();
    });

    it("should clear polling on node close", async () => {
      const node = createNode({ keepPolling: true });
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      // Close should work without error and clear intervals
      await node._triggerClose();
    });
  });

  describe("error handling", () => {
    it("should set red dot status on error", async () => {
      const node = createNode();
      api.mockError("get", "/workflow/wf-123", 500, "Server Error");

      const msg = createMockMsg({ workflowId: "wf-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "dot",
        }),
      );
    });

    it("should error if workflowId not provided", async () => {
      const node = createNode({ workflowId: "", workflowIdType: "str" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("workflowId not provided"), expect.anything());
    });
  });

  describe("message passthrough", () => {
    it("should preserve input message properties in output", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({
        workflowId: "wf-123",
        _context: { flowId: "flow-123" },
        correlationId: "corr-456",
        customProp: "custom-value",
      });

      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const outputMsg = send.mock.calls[0][0][0];
      expectMessagePassthrough(outputMsg, msg);
    });
  });

  describe("output payload", () => {
    it("should include workflow data in payload", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", {
        id: "wf-123",
        status: "running",
        runName: "my-workflow-run",
      });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const outputMsg = send.mock.calls[0][0][0];
      expect(outputMsg.payload.workflow).toBeDefined();
      expect(outputMsg.workflowId).toBe("wf-123");
    });
  });
});

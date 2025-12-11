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
    jest.useFakeTimers();
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode();
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the workflow-monitor node module
    require("../../nodes/workflow-monitor")(RED);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
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
      keepPolling: true,
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

  describe("basic polling", () => {
    it("should fetch workflow status on input", async () => {
      const node = createNode();
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

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
      const node = createNode({ keepPolling: false });
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
      const node = createNode({ keepPolling: false });
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
      const node = createNode({ keepPolling: false });
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
    it("should send to output 1 for submitted/running workflows", async () => {
      const node = createNode({ keepPolling: false });
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).not.toBeNull(); // Output 1
      expect(args[1]).toBeNull(); // Output 2
      expect(args[2]).toBeNull(); // Output 3
    });

    it("should send to output 2 for succeeded workflows", async () => {
      const node = createNode({ keepPolling: false });
      api.mockWorkflowStatus("wf-123", { status: "succeeded" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).toBeNull(); // Output 1
      expect(args[1]).not.toBeNull(); // Output 2
      expect(args[2]).toBeNull(); // Output 3
    });

    it("should send to output 3 for failed/cancelled workflows", async () => {
      const node = createNode({ keepPolling: false });
      api.mockWorkflowStatus("wf-123", { status: "failed" });

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
    it("should start polling interval if keepPolling enabled", async () => {
      const node = createNode({ keepPolling: true, poll: "5", pollType: "num" });

      // First call - running
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);

      // Second call after interval
      api.mockWorkflowStatus("wf-123", { status: "running" });

      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush promises

      expect(send).toHaveBeenCalledTimes(2);
    });

    it("should stop polling when keepPolling=false", async () => {
      const node = createNode({ keepPolling: false });
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);

      // Should not poll again
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it("should stop polling when workflow reaches terminal state", async () => {
      const node = createNode({ keepPolling: true });

      // First call - running
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);

      // Second call - succeeded (terminal)
      api.mockWorkflowStatus("wf-123", { status: "succeeded" });

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(2);

      // No more polling should happen
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(2);
    });

    it("should clear polling on node close", async () => {
      const node = createNode({ keepPolling: true });
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      // Trigger close
      await node._triggerClose();

      // Prepare for potential future poll
      api.mockWorkflowStatus("wf-123", { status: "running" });

      // Advance time - should not poll
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      // Only the initial call should have happened
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("should clear polling on error", async () => {
      const node = createNode({ keepPolling: true });

      // First call succeeds
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      // Second call fails
      api.mockError("get", "/workflow/wf-123", 500, "Server Error");

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(node.error).toHaveBeenCalled();

      // No more polling after error
      api.mockWorkflowStatus("wf-123", { status: "running" });
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      // Still only 2 calls (initial + one failed)
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("property evaluation", () => {
    it("should evaluate workflowId from msg", async () => {
      const node = createNode({
        workflowId: "workflowId",
        workflowIdType: "msg",
        keepPolling: false,
      });

      api.mockWorkflowStatus("wf-from-msg", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-from-msg" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const output = send.mock.calls[0][0][0];
      expect(output.workflowId).toBe("wf-from-msg");
    });

    it("should error if workflowId not provided", async () => {
      const node = createNode({
        workflowId: "",
        workflowIdType: "str",
        keepPolling: false,
      });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("workflowId not provided"), expect.anything());
    });
  });

  describe("message passthrough", () => {
    it("should preserve input message properties in output", async () => {
      const node = createNode({ keepPolling: false });
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

  describe("dynamic interval updates", () => {
    it("should update polling interval if changed dynamically", async () => {
      const node = createNode({
        keepPolling: true,
        poll: "10",
        pollType: "num",
      });

      // First call
      api.mockWorkflowStatus("wf-123", { status: "running" });

      const msg = createMockMsg({ workflowId: "wf-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);

      // Should poll at 10 seconds
      api.mockWorkflowStatus("wf-123", { status: "running" });
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(2);

      // At 5 seconds (half interval) no new poll
      api.mockWorkflowStatus("wf-123", { status: "running" });
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("should set red status on API error", async () => {
      const node = createNode({ keepPolling: false });
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

    it("should call node.error with error message", async () => {
      const node = createNode({ keepPolling: false });
      api.mockError("get", "/workflow/wf-123", 404, "Not Found");

      const msg = createMockMsg({ workflowId: "wf-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("failed"), expect.anything());
    });
  });
});

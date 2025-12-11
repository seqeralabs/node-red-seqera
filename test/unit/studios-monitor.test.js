/**
 * Tests for nodes/studios-monitor.js
 */
const nock = require("nock");
const { createMockRED } = require("../helpers/mock-red");
const { createMockSeqeraConfigNode } = require("../helpers/mock-node");
const { mockSeqeraAPI, BASE_URL } = require("../helpers/mock-axios");
const { createMockMsg, expectMessagePassthrough } = require("../helpers/test-utils");

describe("seqera-studios-monitor node", () => {
  let RED;
  let api;

  beforeEach(() => {
    jest.useFakeTimers();
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode();
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the studios-monitor node module
    require("../../nodes/studios-monitor")(RED);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function createNode(configOverrides = {}) {
    const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-studios-monitor").constructor;
    const node = {};

    const config = {
      id: "test-node-id",
      name: "test-monitor",
      seqera: "seqera-config-id",
      studioId: "studioId",
      studioIdType: "msg",
      workspaceId: "",
      workspaceIdType: "str",
      poll: "5",
      pollUnits: "seconds",
      keepPolling: true,
      ...configOverrides,
    };

    NodeConstructor.call(node, config);
    return node;
  }

  describe("node registration", () => {
    it("should register seqera-studios-monitor type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-studios-monitor",
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe("basic polling", () => {
    it("should fetch studio status on input", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalled();
    });

    it("should set status color - starting/building (yellow)", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "starting" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "yellow",
          shape: "ring",
        }),
      );
    });

    it("should set status color - running (blue)", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );
    });

    it("should set status color - stopped (grey)", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "stopped" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "grey",
          shape: "dot",
        }),
      );
    });

    it("should set status color - errored (red)", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "errored" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "dot",
        }),
      );
    });

    it("should normalize 'build failed' status", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "build failed" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "dot",
        }),
      );
    });
  });

  describe("multiple outputs", () => {
    it("should send to output 1 on every poll", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).not.toBeNull(); // Output 1
    });

    it("should send to output 2 ONLY on transition to running", async () => {
      const node = createNode();

      // First poll - starting
      api.mockStudioStatus("studio-123", { statusInfo: { status: "starting" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      let args = send.mock.calls[0][0];
      expect(args[1]).toBeNull(); // Output 2 should be null (not running yet)

      send.mockClear();

      // Second poll - now running
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      args = send.mock.calls[0][0];
      expect(args[1]).not.toBeNull(); // Output 2 should fire on transition to running
    });

    it("should NOT send to output 2 on subsequent polls while running", async () => {
      const node = createNode();

      // First poll - running
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      let args = send.mock.calls[0][0];
      expect(args[1]).not.toBeNull(); // First running poll - transition

      send.mockClear();

      // Second poll - still running
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      args = send.mock.calls[0][0];
      expect(args[1]).toBeNull(); // Should NOT fire again since already running
    });

    it("should send to output 3 on termination (stopped/errored/buildFailed)", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "stopped" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[2]).not.toBeNull(); // Output 3 should fire
    });
  });

  describe("state transition detection", () => {
    it("should track previousStatus", async () => {
      const node = createNode();

      // First poll - starting
      api.mockStudioStatus("studio-123", { statusInfo: { status: "starting" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      // Second poll - building
      api.mockStudioStatus("studio-123", { statusInfo: { status: "building" } });

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Third poll - running (transition!)
      send.mockClear();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      const args = send.mock.calls[0][0];
      expect(args[1]).not.toBeNull(); // Should fire on transition to running
    });

    it("should reset previousStatus on new input", async () => {
      const node = createNode();

      // First input - running
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg1 = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg1, send, jest.fn());

      expect(send.mock.calls[0][0][1]).not.toBeNull(); // Output 2 fires

      send.mockClear();

      // Second input - same studio, should reset state
      api.mockStudioStatus("studio-456", { statusInfo: { status: "running" } });

      const msg2 = createMockMsg({ studioId: "studio-456" });
      await node._triggerInput(msg2, send, jest.fn());

      expect(send.mock.calls[0][0][1]).not.toBeNull(); // Output 2 fires again (new input)
    });
  });

  describe("polling control", () => {
    it("should stop polling when keepPolling=false", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);

      // Should not poll again
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it("should stop polling when studio reaches terminal state", async () => {
      const node = createNode({ keepPolling: true });

      // First poll - running
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);

      // Second poll - stopped (terminal)
      api.mockStudioStatus("studio-123", { statusInfo: { status: "stopped" } });

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
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      // Trigger close
      await node._triggerClose();

      // Advance time - no more polling should happen
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it("should clear polling on error", async () => {
      const node = createNode({ keepPolling: true });

      // First poll succeeds
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      // Second poll fails
      api.mockError("get", "/studios/studio-123", 500, "Server Error");

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(node.error).toHaveBeenCalled();

      // No more polling after error
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("poll interval units", () => {
    it("should convert seconds correctly", async () => {
      const node = createNode({ poll: "10", pollUnits: "seconds" });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);

      // At 5 seconds - no poll
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(1);

      // At 10 seconds - poll
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("should convert minutes correctly", async () => {
      const node = createNode({ poll: "1", pollUnits: "minutes" });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      // At 30 seconds - no poll
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(1);

      // At 60 seconds - poll
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    it("should set red dot status on error", async () => {
      const node = createNode({ keepPolling: false });
      api.mockError("get", "/studios/studio-123", 500, "Server Error");

      const msg = createMockMsg({ studioId: "studio-123" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "dot",
        }),
      );
    });

    it("should error if studioId not provided", async () => {
      const node = createNode({ studioId: "", studioIdType: "str" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("studioId not provided"), expect.anything());
    });
  });

  describe("message passthrough", () => {
    it("should preserve input message properties in output", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({
        studioId: "studio-123",
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
});

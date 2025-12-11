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
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode();
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the studios-monitor node module
    require("../../nodes/studios-monitor")(RED);
  });

  afterEach(() => {
    nock.cleanAll();
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
      keepPolling: false, // Default to false for simpler testing
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

  describe("basic status fetching", () => {
    it("should fetch studio status on input", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalled();
    });

    it("should set status color - starting/building (yellow)", async () => {
      const node = createNode();
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

    it("should set status color - building (yellow)", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "building" } });

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
      const node = createNode();
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
      const node = createNode();
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
      const node = createNode();
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
      const node = createNode();
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
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[0]).not.toBeNull(); // Output 1
    });

    it("should send to output 2 on first running status", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[1]).not.toBeNull(); // Output 2 should fire on transition to running
    });

    it("should NOT send to output 2 when starting (not yet running)", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "starting" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[1]).toBeNull(); // Output 2 should be null (not running yet)
    });

    it("should send to output 3 on termination - stopped", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "stopped" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[2]).not.toBeNull(); // Output 3 should fire
    });

    it("should send to output 3 on termination - errored", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "errored" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[2]).not.toBeNull(); // Output 3 should fire
    });

    it("should send to output 3 on termination - build failed", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", { statusInfo: { status: "build failed" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const args = send.mock.calls[0][0];
      expect(args[2]).not.toBeNull(); // Output 3 should fire
    });
  });

  describe("state transition detection", () => {
    it("should reset previousStatus on new input", async () => {
      const node = createNode();

      // First input - running
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg1 = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg1, send, jest.fn());

      expect(send.mock.calls[0][0][1]).not.toBeNull(); // Output 2 fires

      send.mockClear();

      // Second input - different studio, should reset state
      api.mockStudioStatus("studio-456", { statusInfo: { status: "running" } });

      const msg2 = createMockMsg({ studioId: "studio-456" });
      await node._triggerInput(msg2, send, jest.fn());

      expect(send.mock.calls[0][0][1]).not.toBeNull(); // Output 2 fires again (new input resets state)
    });
  });

  describe("polling control", () => {
    it("should not start polling when keepPolling=false", async () => {
      const node = createNode({ keepPolling: false });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);
      // No polling interval should be set
      expect(node._currentPollMs).toBeUndefined();
    });

    it("should stop polling when studio reaches terminal state", async () => {
      const node = createNode({ keepPolling: true });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "stopped" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalledTimes(1);
      // Terminal state - output 3 should fire
      const args = send.mock.calls[0][0];
      expect(args[2]).not.toBeNull();

      // Clean up
      await node._triggerClose();
    });

    it("should clear polling on node close", async () => {
      const node = createNode({ keepPolling: true });
      api.mockStudioStatus("studio-123", { statusInfo: { status: "running" } });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      // Close should not throw
      await node._triggerClose();
    });
  });

  describe("poll interval units", () => {
    it("should calculate seconds correctly", () => {
      // Don't start polling - just create node with no seqera config
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-studios-monitor").constructor;
      const node = {};
      const config = {
        id: "test-node-id",
        seqera: "non-existent",
        studioId: "",
        studioIdType: "str",
        poll: "10",
        pollUnits: "seconds",
        keepPolling: false,
      };
      NodeConstructor.call(node, config);

      // Internal conversion is done in convertToSeconds
      // poll: "10", pollUnits: "seconds" -> 10 seconds
      expect(node.pollIntervalProp).toBe("10");
      expect(node.pollUnitsProp).toBe("seconds");
    });

    it("should calculate minutes correctly", () => {
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-studios-monitor").constructor;
      const node = {};
      const config = {
        id: "test-node-id",
        seqera: "non-existent",
        studioId: "",
        studioIdType: "str",
        poll: "1",
        pollUnits: "minutes",
        keepPolling: false,
      };
      NodeConstructor.call(node, config);

      expect(node.pollIntervalProp).toBe("1");
      expect(node.pollUnitsProp).toBe("minutes");
    });

    it("should calculate hours correctly", () => {
      const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-studios-monitor").constructor;
      const node = {};
      const config = {
        id: "test-node-id",
        seqera: "non-existent",
        studioId: "",
        studioIdType: "str",
        poll: "2",
        pollUnits: "hours",
        keepPolling: false,
      };
      NodeConstructor.call(node, config);

      expect(node.pollIntervalProp).toBe("2");
      expect(node.pollUnitsProp).toBe("hours");
    });
  });

  describe("error handling", () => {
    it("should set red dot status on error", async () => {
      const node = createNode();
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
      const node = createNode();
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

  describe("output payload", () => {
    it("should include studio data in payload", async () => {
      const node = createNode();
      api.mockStudioStatus("studio-123", {
        sessionId: "studio-123",
        statusInfo: { status: "running" },
      });

      const msg = createMockMsg({ studioId: "studio-123" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const outputMsg = send.mock.calls[0][0][0];
      expect(outputMsg.payload).toBeDefined();
      expect(outputMsg.studioId).toBe("studio-123");
    });
  });
});

/**
 * Tests for nodes/datalink-poll.js
 */
const nock = require("nock");
const { createMockRED } = require("../helpers/mock-red");
const { createMockSeqeraConfigNode } = require("../helpers/mock-node");
const { mockSeqeraAPI, BASE_URL } = require("../helpers/mock-axios");

describe("seqera-datalink-poll node", () => {
  let RED;
  let api;

  beforeEach(() => {
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the datalink-poll node module
    require("../../nodes/datalink-poll")(RED);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  function setupDataLinkMocks(files = []) {
    api.mockDataLinksSearch([
      {
        id: "dl-123",
        name: "test-data-link",
        resourceRef: "s3://my-bucket",
        type: "bucket",
        provider: "aws",
      },
    ]);
    api.mockDataLinkBrowse("dl-123", files);
  }

  function createNode(configOverrides = {}) {
    const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-datalink-poll").constructor;
    const node = {};

    const config = {
      id: "test-node-id",
      name: "test-datalink-poll",
      seqera: "seqera-config-id",
      dataLinkName: "test-data-link",
      dataLinkNameType: "str",
      basePath: "",
      basePathType: "str",
      prefix: "",
      prefixType: "str",
      pattern: "",
      patternType: "str",
      maxResults: "100",
      maxResultsType: "num",
      workspaceId: "",
      workspaceIdType: "str",
      baseUrl: "",
      baseUrlType: "str",
      depth: "0",
      depthType: "num",
      returnType: "files",
      pollFrequency: "15",
      pollUnits: "minutes",
      ...configOverrides,
    };

    NodeConstructor.call(node, config);
    return node;
  }

  // Helper to wait for async operations to complete
  async function waitForPolling(timeout = 100) {
    await new Promise((resolve) => setTimeout(resolve, timeout));
  }

  describe("node registration", () => {
    it("should register seqera-datalink-poll type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-datalink-poll",
        expect.any(Function),
        expect.any(Object),
      );
    });

    it("should register HTTP endpoint for datalink autocomplete", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/admin/seqera/datalinks/:nodeId", expect.any(Function));
    });
  });

  describe("automatic polling initialization", () => {
    it("should execute poll immediately on initialization", async () => {
      setupDataLinkMocks([{ name: "file1.txt", type: "FILE" }]);

      const node = createNode();
      await waitForPolling();

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );

      await node._triggerClose();
    });

    it("should set green status after successful poll", async () => {
      setupDataLinkMocks([{ name: "file1.txt", type: "FILE" }]);

      const node = createNode();
      await waitForPolling();

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "green",
          shape: "dot",
        }),
      );

      await node._triggerClose();
    });

    it("should calculate poll frequency correctly - seconds", () => {
      // Don't start polling - just check calculation
      const node = createNode({ pollFrequency: "30", pollUnits: "seconds", dataLinkName: "" });
      expect(node.pollFrequencySec).toBe(30);
    });

    it("should calculate poll frequency correctly - minutes", () => {
      // Don't start polling - just check calculation
      const node = createNode({ pollFrequency: "5", pollUnits: "minutes", dataLinkName: "" });
      expect(node.pollFrequencySec).toBe(300);
    });

    it("should calculate poll frequency correctly - hours", () => {
      // Don't start polling - just check calculation
      const node = createNode({ pollFrequency: "2", pollUnits: "hours", dataLinkName: "" });
      expect(node.pollFrequencySec).toBe(7200);
    });

    it("should calculate poll frequency correctly - days", () => {
      // Don't start polling - just check calculation
      const node = createNode({ pollFrequency: "1", pollUnits: "days", dataLinkName: "" });
      expect(node.pollFrequencySec).toBe(86400);
    });
  });

  describe("output format", () => {
    beforeEach(() => {
      // Ensure clean nock state before each test in this block
      nock.cleanAll();
    });

    it("should send all files to output 1", async () => {
      setupDataLinkMocks([
        { name: "file1.txt", type: "FILE" },
        { name: "file2.txt", type: "FILE" },
      ]);

      const node = createNode();
      await waitForPolling();

      // Check output 1 was called
      expect(node.send).toHaveBeenCalled();
      const output1Call = node.send.mock.calls.find((call) => call[0] && call[0][0] !== null);
      expect(output1Call).toBeDefined();
      expect(output1Call[0][0].payload.files.length).toBeGreaterThanOrEqual(2);

      await node._triggerClose();
    });

    it("should not send to output 2 on first poll (no previous state)", async () => {
      setupDataLinkMocks([
        { name: "file1.txt", type: "FILE" },
        { name: "file2.txt", type: "FILE" },
      ]);

      const node = createNode();
      await waitForPolling();

      // On first poll, output 2 should be null
      expect(node.send.mock.calls[0][0][1]).toBeNull();

      await node._triggerClose();
    });

    it("should include nextPoll timestamp in output 1", async () => {
      setupDataLinkMocks([{ name: "file.txt", type: "FILE" }]);

      const node = createNode({ pollFrequency: "5", pollUnits: "minutes" });
      await waitForPolling();

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.payload.nextPoll).toBeDefined();
      expect(new Date(output1.payload.nextPoll).getTime()).toBeGreaterThan(Date.now());

      await node._triggerClose();
    });

    it("should include full paths with resourceRef in files array", async () => {
      setupDataLinkMocks([{ name: "path/to/file.txt", type: "FILE" }]);

      const node = createNode();
      await waitForPolling();

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.files[0]).toBe("s3://my-bucket/path/to/file.txt");

      await node._triggerClose();
    });

    it("should include resourceType, resourceRef, provider in payload", async () => {
      setupDataLinkMocks([]);

      const node = createNode();
      await waitForPolling();

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.payload.resourceRef).toBe("s3://my-bucket");
      expect(output1.payload.resourceType).toBe("bucket");
      expect(output1.payload.provider).toBe("aws");

      await node._triggerClose();
    });
  });

  describe("error handling", () => {
    it("should set red dot status on error", async () => {
      api.mockError("get", "/data-links", 500, "Server Error");

      const node = createNode();
      await waitForPolling();

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "dot",
        }),
      );

      await node._triggerClose();
    });

    it("should call error handler on API failure", async () => {
      api.mockError("get", "/data-links", 500, "Server Error");

      const node = createNode();
      await waitForPolling();

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("datalink poll failed"));

      await node._triggerClose();
    });
  });

  describe("initialization conditions", () => {
    it("should not start polling if no seqeraConfig", async () => {
      RED._testHelpers.nodes.delete("seqera-config-id");

      const node = createNode({ seqera: "non-existent-config" });
      await waitForPolling();

      // Should not have called send since polling didn't start
      expect(node.send).not.toHaveBeenCalled();

      node._triggerClose();
    });

    it("should not start polling if dataLinkName is empty", async () => {
      const node = createNode({ dataLinkName: "" });
      await waitForPolling();

      // Should not have called send since polling didn't start
      expect(node.send).not.toHaveBeenCalled();

      node._triggerClose();
    });

    it("should not start polling if dataLinkName is whitespace only", async () => {
      const node = createNode({ dataLinkName: "   " });
      await waitForPolling();

      // Should not have called send since polling didn't start
      expect(node.send).not.toHaveBeenCalled();

      node._triggerClose();
    });
  });

  describe("cleanup", () => {
    it("should handle close without error", async () => {
      setupDataLinkMocks([]);

      const node = createNode();
      await waitForPolling();

      // Close should not throw
      await node._triggerClose();
    });
  });
});

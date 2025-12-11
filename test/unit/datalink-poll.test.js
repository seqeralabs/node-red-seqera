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
    jest.useFakeTimers();
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the datalink-poll node module
    require("../../nodes/datalink-poll")(RED);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
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

  describe("node registration", () => {
    it("should register seqera-datalink-poll type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-datalink-poll",
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe("automatic polling", () => {
    it("should execute poll immediately on initialization", async () => {
      setupDataLinkMocks([{ name: "file1.txt", type: "FILE" }]);

      const node = createNode();
      await Promise.resolve();

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );
    });

    it("should poll at configured interval", async () => {
      setupDataLinkMocks([]);

      const node = createNode({ pollFrequency: "5", pollUnits: "seconds" });
      await Promise.resolve();

      const initialSendCalls = node.send.mock.calls.length;

      // Second poll after interval
      setupDataLinkMocks([]);
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(node.send.mock.calls.length).toBeGreaterThan(initialSendCalls);
    });

    it("should convert poll frequency with units correctly - minutes", async () => {
      setupDataLinkMocks([]);

      const node = createNode({ pollFrequency: "2", pollUnits: "minutes" });
      await Promise.resolve();

      const initialSendCalls = node.send.mock.calls.length;

      // Should NOT poll after 1 minute
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
      expect(node.send.mock.calls.length).toBe(initialSendCalls);

      // Should poll after 2 minutes
      setupDataLinkMocks([]);
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      expect(node.send.mock.calls.length).toBeGreaterThan(initialSendCalls);
    });

    it("should convert poll frequency with units correctly - hours", async () => {
      setupDataLinkMocks([]);

      const node = createNode({ pollFrequency: "1", pollUnits: "hours" });
      await Promise.resolve();

      const initialSendCalls = node.send.mock.calls.length;

      // Should NOT poll after 30 minutes
      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();
      expect(node.send.mock.calls.length).toBe(initialSendCalls);

      // Should poll after full hour
      setupDataLinkMocks([]);
      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();

      expect(node.send.mock.calls.length).toBeGreaterThan(initialSendCalls);
    });
  });

  describe("multiple outputs", () => {
    it("should send all files to output 1", async () => {
      setupDataLinkMocks([
        { name: "file1.txt", type: "FILE" },
        { name: "file2.txt", type: "FILE" },
      ]);

      const node = createNode();
      await Promise.resolve();

      // Check output 1 was called with all files
      const output1Call = node.send.mock.calls.find((call) => call[0][0] !== null);
      expect(output1Call).toBeDefined();
      expect(output1Call[0][0].payload.files).toHaveLength(2);
    });

    it("should send new files to output 2 on subsequent polls", async () => {
      // First poll - two files
      setupDataLinkMocks([
        { name: "file1.txt", type: "FILE" },
        { name: "file2.txt", type: "FILE" },
      ]);

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      node.send.mockClear();

      // Second poll - one new file
      setupDataLinkMocks([
        { name: "file1.txt", type: "FILE" },
        { name: "file2.txt", type: "FILE" },
        { name: "file3.txt", type: "FILE" },
      ]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should have sent to output 2 for new file
      const output2Call = node.send.mock.calls.find((call) => call[0][1] !== null);
      expect(output2Call).toBeDefined();
      expect(output2Call[0][1].payload.files).toHaveLength(1);
      expect(output2Call[0][1].payload.files[0].name).toBe("file3.txt");
    });

    it("should not send to output 2 on first poll (no previous state)", async () => {
      setupDataLinkMocks([
        { name: "file1.txt", type: "FILE" },
        { name: "file2.txt", type: "FILE" },
      ]);

      const node = createNode();
      await Promise.resolve();

      // On first poll, output 2 should be null
      expect(node.send.mock.calls[0][0][1]).toBeNull();
    });
  });

  describe("state tracking", () => {
    it("should track previously seen file names", async () => {
      // First poll
      setupDataLinkMocks([{ name: "existing.txt", type: "FILE" }]);

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      node.send.mockClear();

      // Second poll - same file
      setupDataLinkMocks([{ name: "existing.txt", type: "FILE" }]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should NOT have output 2 since no new files
      const output2Call = node.send.mock.calls.find((call) => call[0][1] !== null);
      expect(output2Call).toBeUndefined();
    });

    it("should detect new files correctly", async () => {
      // First poll
      setupDataLinkMocks([{ name: "file1.txt", type: "FILE" }]);

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      node.send.mockClear();

      // Second poll - two new files
      setupDataLinkMocks([
        { name: "file1.txt", type: "FILE" },
        { name: "new1.txt", type: "FILE" },
        { name: "new2.txt", type: "FILE" },
      ]);

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should have output 2 with 2 new files
      const output2Call = node.send.mock.calls.find((call) => call[0][1] !== null);
      expect(output2Call[0][1].payload.files).toHaveLength(2);
    });
  });

  describe("error handling", () => {
    it("should set red dot status on error", async () => {
      api.mockError("get", "/data-links/", 500, "Server Error");

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
      api.mockError("get", "/data-links/", 500, "Server Error");

      const node = createNode({ pollFrequency: "1", pollUnits: "seconds" });
      await Promise.resolve();

      expect(node.error).toHaveBeenCalled();
      node.error.mockClear();
      node.status.mockClear();

      // Second poll succeeds
      setupDataLinkMocks([]);

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

  describe("output format", () => {
    it("should include nextPoll timestamp in output 1", async () => {
      setupDataLinkMocks([{ name: "file.txt", type: "FILE" }]);

      const node = createNode({ pollFrequency: "5", pollUnits: "minutes" });
      await Promise.resolve();

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.payload.nextPoll).toBeDefined();
      expect(new Date(output1.payload.nextPoll).getTime()).toBeGreaterThan(Date.now());
    });

    it("should include full paths with resourceRef in files array", async () => {
      setupDataLinkMocks([{ name: "path/to/file.txt", type: "FILE" }]);

      const node = createNode();
      await Promise.resolve();

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.files[0]).toBe("s3://my-bucket/path/to/file.txt");
    });

    it("should include resourceType, resourceRef, provider in payload", async () => {
      setupDataLinkMocks([]);

      const node = createNode();
      await Promise.resolve();

      const output1 = node.send.mock.calls[0][0][0];
      expect(output1.payload.resourceRef).toBe("s3://my-bucket");
      expect(output1.payload.resourceType).toBe("bucket");
      expect(output1.payload.provider).toBe("aws");
    });
  });

  describe("initialization conditions", () => {
    it("should not start polling if no seqeraConfig", async () => {
      RED._testHelpers.nodes.delete("seqera-config-id");

      const node = createNode({ seqera: "non-existent-config" });
      await Promise.resolve();

      // Should not have called send since polling didn't start
      expect(node.send).not.toHaveBeenCalled();
    });

    it("should not start polling if dataLinkName is empty", async () => {
      const node = createNode({ dataLinkName: "" });
      await Promise.resolve();

      // Should not have called send since polling didn't start
      expect(node.send).not.toHaveBeenCalled();
    });
  });
});

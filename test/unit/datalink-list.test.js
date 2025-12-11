/**
 * Tests for nodes/datalink-list.js
 */
const nock = require("nock");
const { createMockRED } = require("../helpers/mock-red");
const { createMockSeqeraConfigNode } = require("../helpers/mock-node");
const { mockSeqeraAPI, BASE_URL } = require("../helpers/mock-axios");
const {
  createMockMsg,
  expectSuccessStatus,
  expectErrorStatus,
  expectMessagePassthrough,
} = require("../helpers/test-utils");

describe("seqera-datalink-list node", () => {
  let RED;
  let api;

  beforeEach(() => {
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the datalink-list node module
    require("../../nodes/datalink-list")(RED);
  });

  function createNode(configOverrides = {}) {
    const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-datalink-list").constructor;
    const node = {};

    const config = {
      id: "test-node-id",
      name: "test-datalink-list",
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
      ...configOverrides,
    };

    NodeConstructor.call(node, config);
    return node;
  }

  describe("node registration", () => {
    it("should register seqera-datalink-list type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-datalink-list",
        expect.any(Function),
        expect.any(Object),
      );
    });

    it("should register HTTP endpoint for datalink autocomplete", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/admin/seqera/datalinks/:nodeId", expect.any(Function));
    });
  });

  describe("basic listing", () => {
    it("should list files from data link", async () => {
      const node = createNode();

      api.mockDataLinksSearch([
        {
          id: "dl-123",
          name: "test-data-link",
          resourceRef: "s3://my-bucket",
          type: "bucket",
          provider: "aws",
        },
      ]);

      api.mockDataLinkBrowse("dl-123", [
        { name: "file1.txt", type: "FILE" },
        { name: "file2.csv", type: "FILE" },
      ]);

      const msg = createMockMsg({});
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalled();
      const output = send.mock.calls[0][0];
      expect(output.payload.files).toHaveLength(2);
    });

    it("should set blue ring status during listing", async () => {
      const node = createNode();

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link", resourceRef: "s3://bucket" }]);
      api.mockDataLinkBrowse("dl-123", []);

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );
    });

    it("should set green dot status with count on success", async () => {
      const node = createNode();

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link", resourceRef: "s3://bucket" }]);
      api.mockDataLinkBrowse("dl-123", [
        { name: "file1.txt", type: "FILE" },
        { name: "file2.txt", type: "FILE" },
        { name: "file3.txt", type: "FILE" },
      ]);

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "green",
          shape: "dot",
          text: expect.stringContaining("3 items"),
        }),
      );
    });
  });

  describe("output format", () => {
    it("should return payload.files with full objects", async () => {
      const node = createNode();

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link", resourceRef: "s3://bucket" }]);
      api.mockDataLinkBrowse("dl-123", [
        { name: "file1.txt", type: "FILE", size: 100 },
        { name: "file2.txt", type: "FILE", size: 200 },
      ]);

      const msg = createMockMsg({});
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const output = send.mock.calls[0][0];
      expect(output.payload.files[0]).toHaveProperty("name");
      expect(output.payload.files[0]).toHaveProperty("type");
    });

    it("should return files array with full paths including resourceRef", async () => {
      const node = createNode();

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link", resourceRef: "s3://my-bucket" }]);
      api.mockDataLinkBrowse("dl-123", [{ name: "path/to/file.txt", type: "FILE" }]);

      const msg = createMockMsg({});
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const output = send.mock.calls[0][0];
      expect(output.files[0]).toBe("s3://my-bucket/path/to/file.txt");
    });

    it("should include resourceType, resourceRef, provider in payload", async () => {
      const node = createNode();

      api.mockDataLinksSearch([
        {
          id: "dl-123",
          name: "test-data-link",
          resourceRef: "gs://gcp-bucket",
          type: "bucket",
          provider: "gcp",
        },
      ]);
      api.mockDataLinkBrowse("dl-123", []);

      const msg = createMockMsg({});
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const output = send.mock.calls[0][0];
      expect(output.payload.resourceRef).toBe("gs://gcp-bucket");
      expect(output.payload.resourceType).toBe("bucket");
      expect(output.payload.provider).toBe("gcp");
    });
  });

  describe("message passthrough", () => {
    it("should preserve input message properties in output", async () => {
      const node = createNode();

      api.mockDataLinksSearch([{ id: "dl-123", name: "test-data-link", resourceRef: "s3://bucket" }]);
      api.mockDataLinkBrowse("dl-123", []);

      const msg = createMockMsg({
        _context: { flowId: "flow-123" },
        correlationId: "corr-456",
        customProp: "custom-value",
      });

      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const output = send.mock.calls[0][0];
      expectMessagePassthrough(output, msg);
    });
  });

  describe("error handling", () => {
    it("should set red dot status on error", async () => {
      const node = createNode();

      api.mockError("get", "/data-links/", 500, "Server Error");

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expectErrorStatus(node);
    });

    it("should call node.error with message on failure", async () => {
      const node = createNode();

      api.mockDataLinksSearch([]);

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("datalink list failed"), expect.anything());
    });
  });

  describe("datalink autocomplete endpoint", () => {
    it("should use handleDatalinkAutoComplete handler", async () => {
      // The endpoint is registered - this is tested in utils.test.js
      // Here we just verify the endpoint is set up
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/admin/seqera/datalinks/:nodeId", expect.any(Function));
    });
  });
});

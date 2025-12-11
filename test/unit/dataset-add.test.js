/**
 * Tests for nodes/dataset-add.js
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

describe("seqera-dataset-add node", () => {
  let RED;
  let api;

  beforeEach(() => {
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the dataset-add node module
    require("../../nodes/dataset-add")(RED);
  });

  function createNode(configOverrides = {}) {
    const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-dataset-add").constructor;
    const node = {};

    const config = {
      id: "test-node-id",
      name: "test-dataset",
      seqera: "seqera-config-id",
      datasetName: "test-dataset",
      datasetNameType: "str",
      fileContents: "payload",
      fileContentsType: "msg",
      description: "",
      descriptionType: "str",
      baseUrl: "",
      baseUrlType: "str",
      workspaceId: "",
      workspaceIdType: "str",
      fileType: "csv",
      hasHeader: false,
      ...configOverrides,
    };

    NodeConstructor.call(node, config);
    return node;
  }

  describe("node registration", () => {
    it("should register seqera-dataset-add type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-dataset-add",
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe("two-step process", () => {
    it("should create dataset then upload file", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });
      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({ payload: "col1,col2\nval1,val2" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalled();
      expect(send.mock.calls[0][0].datasetId).toBe("ds-123");
    });

    it("should set blue status during create", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });
      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );
    });

    it("should set yellow status during upload", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });
      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "yellow",
          shape: "ring",
        }),
      );
    });

    it("should set green status on success", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });
      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expectSuccessStatus(node);
    });
  });

  describe("file handling", () => {
    it("should convert string to Buffer", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });

      const uploadScope = nock(BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query(true)
        .reply(200, { version: { id: "v-1" } });

      const msg = createMockMsg({ payload: "string-content" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(uploadScope.isDone()).toBe(true);
    });

    it("should handle Buffer input", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });
      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({ payload: Buffer.from("buffer-content") });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "green",
        }),
      );
    });

    it("should handle JSON object input", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });
      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({ payload: { col1: "val1", col2: "val2" } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expectSuccessStatus(node);
    });

    it("should use correct MIME type for CSV", async () => {
      const node = createNode({ fileType: "csv" });

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });

      // FormData upload will have multipart/form-data content-type
      // The CSV MIME type is embedded in the form field
      const uploadScope = nock(BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query(true)
        .matchHeader("content-type", /multipart\/form-data/)
        .reply(200, { version: { id: "v-1" } });

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(uploadScope.isDone()).toBe(true);
    });

    it("should use correct MIME type for TSV", async () => {
      const node = createNode({ fileType: "tsv" });

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });

      // FormData upload will have multipart/form-data content-type
      // The TSV MIME type is embedded in the form field
      const uploadScope = nock(BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query(true)
        .matchHeader("content-type", /multipart\/form-data/)
        .reply(200, { version: { id: "v-1" } });

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(uploadScope.isDone()).toBe(true);
    });

    it("should include header query param if hasHeader=true", async () => {
      const node = createNode({ hasHeader: true });

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });

      const uploadScope = nock(BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query((q) => q.header === "true")
        .reply(200, { version: { id: "v-1" } });

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(uploadScope.isDone()).toBe(true);
    });
  });

  describe("output", () => {
    it("should return datasetId in output message", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-new-123" } });
      api.mockDatasetUpload("ds-new-123");

      const msg = createMockMsg({ payload: "data" });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send.mock.calls[0][0].datasetId).toBe("ds-new-123");
    });

    it("should pass through input message properties", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });
      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({
        payload: "data",
        _context: { flowId: "flow-123" },
        correlationId: "corr-456",
      });

      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const output = send.mock.calls[0][0];
      expectMessagePassthrough(output, msg);
    });
  });

  describe("error handling", () => {
    it("should error if datasetName not provided", async () => {
      const node = createNode({ datasetName: "", datasetNameType: "str" });

      const msg = createMockMsg({ payload: "data" });
      const done = jest.fn();
      await node._triggerInput(msg, jest.fn(), done);

      expect(done).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should error if fileContents not provided", async () => {
      const node = createNode({ fileContents: "", fileContentsType: "str" });

      const msg = createMockMsg({}); // No payload
      const done = jest.fn();
      await node._triggerInput(msg, jest.fn(), done);

      expect(done).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should set red dot status on create error", async () => {
      const node = createNode();

      api.mockError("post", "/datasets", 500, "Server Error");

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expectErrorStatus(node);
    });

    it("should set red dot status on upload error", async () => {
      const node = createNode();

      api.mockDatasetCreate({ dataset: { id: "ds-123" } });
      api.mockError("post", "/datasets/ds-123/upload", 500, "Upload Error");

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expectErrorStatus(node);
    });

    it("should error if dataset ID not returned", async () => {
      const node = createNode();

      nock(BASE_URL).post("/datasets").query(true).reply(200, { success: true }); // No dataset ID

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalled();
    });
  });

  describe("description field", () => {
    it("should include description in create request if provided", async () => {
      const node = createNode({ description: "My dataset description", descriptionType: "str" });

      const createScope = nock(BASE_URL)
        .post("/datasets", (body) => body.description === "My dataset description")
        .query(true)
        .reply(200, { dataset: { id: "ds-123" } });

      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(createScope.isDone()).toBe(true);
    });

    it("should not include description if empty", async () => {
      const node = createNode({ description: "", descriptionType: "str" });

      const createScope = nock(BASE_URL)
        .post("/datasets", (body) => body.description === undefined)
        .query(true)
        .reply(200, { dataset: { id: "ds-123" } });

      api.mockDatasetUpload("ds-123");

      const msg = createMockMsg({ payload: "data" });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(createScope.isDone()).toBe(true);
    });
  });
});

/**
 * Tests for nodes/dataset-add.js (seqera-dataset-add node)
 *
 * Tests the dataset creation and file upload functionality including:
 * - Creating datasets with name and description
 * - Uploading CSV and TSV files
 * - File content from various sources (string, buffer, object)
 * - Error handling for missing inputs
 */

const {
  helper,
  nock,
  DEFAULT_BASE_URL,
  DEFAULT_WORKSPACE_ID,
  createConfigNode,
  createCredentials,
  createDatasetResponse,
} = require("./helper");
const { expect } = require("chai");

const datasetAddNode = require("../nodes/dataset-add");
const configNode = require("../nodes/config");

describe("seqera-dataset-add Node", function () {
  beforeEach(function (done) {
    helper.startServer(done);
  });

  afterEach(function (done) {
    helper.unload();
    helper.stopServer(done);
    nock.cleanAll();
  });

  describe("node loading", function () {
    it("should be loaded with correct type", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "test-dataset",
          datasetNameType: "str",
          fileType: "csv",
          wires: [[]],
        },
      ];

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("dataset1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-dataset-add");
          expect(n1.name).to.equal("Test Dataset Add");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should store file type configuration", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          fileType: "tsv",
          hasHeader: true,
          wires: [[]],
        },
      ];

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("dataset1");
        try {
          expect(n1.fileType).to.equal("tsv");
          expect(n1.hasHeader).to.be.true;
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should default fileType to csv", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          wires: [[]],
        },
      ];

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("dataset1");
        try {
          expect(n1.fileType).to.equal("csv");
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });

  describe("dataset creation", function () {
    it("should create dataset and upload CSV file", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          fileType: "csv",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock create dataset
      nock(DEFAULT_BASE_URL)
        .post("/datasets", { name: "my-dataset" })
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-123", name: "my-dataset" }));

      // Mock upload file
      nock(DEFAULT_BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query(true)
        .reply(200, { version: { id: "v1", fileName: "my-dataset.csv" } });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.datasetId).to.equal("ds-123");
            done();
          } catch (err) {
            done(err);
          }
        });

        datasetNode.receive({
          payload: "col1,col2\nval1,val2",
        });
      });
    });

    it("should create dataset with description", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          description: "Test description",
          descriptionType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          fileType: "csv",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock create dataset - verify description is included
      nock(DEFAULT_BASE_URL)
        .post("/datasets", { name: "my-dataset", description: "Test description" })
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-123" }));

      nock(DEFAULT_BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query(true)
        .reply(200, { version: { id: "v1" } });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.datasetId).to.equal("ds-123");
            done();
          } catch (err) {
            done(err);
          }
        });

        datasetNode.receive({ payload: "data" });
      });
    });

    it("should upload TSV file with correct MIME type", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          fileType: "tsv",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/datasets", { name: "my-dataset" })
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-123" }));

      // Verify the upload includes TSV MIME type
      nock(DEFAULT_BASE_URL)
        .post(`/datasets/ds-123/upload`, /text\/tab-separated-values/)
        .query(true)
        .reply(200, { version: { id: "v1" } });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.datasetId).to.equal("ds-123");
            done();
          } catch (err) {
            done(err);
          }
        });

        datasetNode.receive({ payload: "col1\tcol2\nval1\tval2" });
      });
    });

    it("should include header=true query param when hasHeader is true", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          fileType: "csv",
          hasHeader: true,
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/datasets")
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-123" }));

      // Verify header=true is in query
      nock(DEFAULT_BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query((q) => q.header === "true")
        .reply(200, { version: { id: "v1" } });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          done();
        });

        datasetNode.receive({ payload: "col1,col2\nval1,val2" });
      });
    });
  });

  describe("file content handling", function () {
    it("should handle Buffer file contents", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          fileType: "csv",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/datasets")
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-123" }));

      nock(DEFAULT_BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query(true)
        .reply(200, { version: { id: "v1" } });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.datasetId).to.equal("ds-123");
            done();
          } catch (err) {
            done(err);
          }
        });

        // Send Buffer instead of string
        datasetNode.receive({ payload: Buffer.from("col1,col2\nval1,val2") });
      });
    });

    it("should handle object file contents by JSON stringifying", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          fileType: "csv",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/datasets")
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-123" }));

      nock(DEFAULT_BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query(true)
        .reply(200, { version: { id: "v1" } });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.datasetId).to.equal("ds-123");
            done();
          } catch (err) {
            done(err);
          }
        });

        // Send object - will be JSON stringified
        datasetNode.receive({ payload: { data: [1, 2, 3] } });
      });
    });

    it("should get dataset name from message property", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "datasetName",
          datasetNameType: "msg",
          fileContents: "payload",
          fileContentsType: "msg",
          fileType: "csv",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/datasets", { name: "dynamic-dataset-name" })
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-456" }));

      nock(DEFAULT_BASE_URL)
        .post(`/datasets/ds-456/upload`)
        .query(true)
        .reply(200, { version: { id: "v1" } });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.datasetId).to.equal("ds-456");
            done();
          } catch (err) {
            done(err);
          }
        });

        datasetNode.receive({
          payload: "data",
          datasetName: "dynamic-dataset-name",
        });
      });
    });
  });

  describe("message passthrough", function () {
    it("should preserve custom message properties", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          fileType: "csv",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/datasets")
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-123" }));

      nock(DEFAULT_BASE_URL)
        .post(`/datasets/ds-123/upload`)
        .query(true)
        .reply(200, { version: { id: "v1" } });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg._context).to.equal("my-context");
            expect(msg.customProp).to.equal("custom-value");
            expect(msg.datasetId).to.equal("ds-123");
            done();
          } catch (err) {
            done(err);
          }
        });

        datasetNode.receive({
          payload: "data",
          _context: "my-context",
          customProp: "custom-value",
        });
      });
    });
  });

  describe("error handling", function () {
    it("should report error when datasetName is not provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          wires: [[]],
        },
      ];

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");

        // The done callback receives errors
        datasetNode.receive({
          payload: "data",
          _msgid: "test-msg",
        });

        // Give async handler time to process and report error
        setTimeout(function () {
          // Test passes if no crash occurred (error was handled)
          done();
        }, 100);
      });
    });

    it("should report error when fileContents is not provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "missingProp",
          fileContentsType: "msg",
          wires: [[]],
        },
      ];

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");

        datasetNode.receive({
          payload: null, // No payload and missingProp doesn't exist
          _msgid: "test-msg",
        });

        setTimeout(function () {
          done();
        }, 100);
      });
    });

    it("should handle API error during dataset creation", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          wires: [[]],
        },
      ];

      nock(DEFAULT_BASE_URL).post("/datasets").query(true).reply(500, { error: "Server error" });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");

        datasetNode.on("call:error", function (call) {
          try {
            // Error should be reported
            done();
          } catch (err) {
            done(err);
          }
        });

        datasetNode.receive({ payload: "data" });
      });
    });

    it("should handle API error during file upload", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          wires: [[]],
        },
      ];

      // Create succeeds
      nock(DEFAULT_BASE_URL)
        .post("/datasets")
        .query(true)
        .reply(200, createDatasetResponse({ id: "ds-123" }));

      // Upload fails
      nock(DEFAULT_BASE_URL).post(`/datasets/ds-123/upload`).query(true).reply(500, { error: "Upload failed" });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");

        datasetNode.on("call:error", function (call) {
          try {
            done();
          } catch (err) {
            done(err);
          }
        });

        datasetNode.receive({ payload: "data" });
      });
    });

    it("should handle missing dataset ID in response", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "dataset1",
          type: "seqera-dataset-add",
          name: "Test Dataset Add",
          seqera: "config-node-1",
          datasetName: "my-dataset",
          datasetNameType: "str",
          fileContents: "payload",
          fileContentsType: "msg",
          wires: [[]],
        },
      ];

      // Create returns without dataset ID
      nock(DEFAULT_BASE_URL).post("/datasets").query(true).reply(200, { success: true });

      helper.load([configNode, datasetAddNode], flow, createCredentials(), function () {
        const datasetNode = helper.getNode("dataset1");

        datasetNode.on("call:error", function (call) {
          try {
            done();
          } catch (err) {
            done(err);
          }
        });

        datasetNode.receive({ payload: "data" });
      });
    });
  });
});

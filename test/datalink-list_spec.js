/**
 * Tests for nodes/datalink-list.js (seqera-datalink-list node)
 *
 * Tests the Data Link file listing functionality including:
 * - Resolving Data Link by name
 * - Listing files with filtering by prefix and pattern
 * - Recursive depth support
 * - Return type filtering (files, folders, all)
 */

const {
  helper,
  nock,
  DEFAULT_BASE_URL,
  DEFAULT_WORKSPACE_ID,
  createConfigNode,
  createCredentials,
  createDataLinksResponse,
  createDataBrowserResponse,
} = require("./helper");
const { expect } = require("chai");

const datalinkListNode = require("../nodes/datalink-list");
const configNode = require("../nodes/config");

describe("seqera-datalink-list Node", function () {
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
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          wires: [[]],
        },
      ];

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("datalink1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-datalink-list");
          expect(n1.name).to.equal("Test Datalink List");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should store configuration properties", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          depth: "2",
          depthType: "num",
          maxResults: "50",
          maxResultsType: "num",
          returnType: "all",
          wires: [[]],
        },
      ];

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("datalink1");
        try {
          expect(n1.dataLinkNameProp).to.equal("my-datalink");
          expect(n1.depthProp).to.equal("2");
          expect(n1.maxResultsProp).to.equal("50");
          expect(n1.returnType).to.equal("all");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should default returnType to files", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          wires: [[]],
        },
      ];

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("datalink1");
        try {
          expect(n1.returnType).to.equal("files");
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });

  describe("listing files", function () {
    it("should resolve datalink and list files", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          maxResults: "100",
          maxResultsType: "num",
          depth: "0",
          depthType: "num",
          returnType: "all",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock data-links search
      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([
            {
              id: "dl-123",
              name: "my-datalink",
              type: "S3",
              provider: "aws",
              resourceRef: "s3://bucket/data",
              credentials: [{ id: "cred-1" }],
            },
          ]),
        );

      // Mock browse files
      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(
          200,
          createDataBrowserResponse([
            { name: "file1.txt", type: "FILE", size: 1024 },
            { name: "file2.csv", type: "FILE", size: 2048 },
          ]),
        );

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.payload.files).to.be.an("array");
            expect(msg.payload.files).to.have.length(2);
            expect(msg.files).to.be.an("array");
            expect(msg.files).to.have.length(2);
            expect(msg.files[0]).to.include("s3://bucket/data");
            expect(msg.payload.resourceRef).to.equal("s3://bucket/data");
            expect(msg.payload.provider).to.equal("aws");
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });

    it("should filter by prefix", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          prefix: "data_",
          prefixType: "str",
          returnType: "all",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([{ id: "dl-123", name: "my-datalink", resourceRef: "s3://bucket", credentials: [] }]),
        );

      // Mock browse with search parameter
      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query((q) => q.search === "data_")
        .reply(200, createDataBrowserResponse([{ name: "data_file1.txt", type: "FILE" }]));

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.payload.files).to.have.length(1);
            expect(msg.payload.files[0].name).to.equal("data_file1.txt");
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });

    it("should filter by regex pattern", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          pattern: "\\.csv$",
          patternType: "str",
          returnType: "all",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([{ id: "dl-123", name: "my-datalink", resourceRef: "s3://bucket", credentials: [] }]),
        );

      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(
          200,
          createDataBrowserResponse([
            { name: "file1.txt", type: "FILE" },
            { name: "file2.csv", type: "FILE" },
            { name: "file3.csv", type: "FILE" },
          ]),
        );

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            // Should only return .csv files
            expect(msg.payload.files).to.have.length(2);
            expect(msg.payload.files[0].name).to.match(/\.csv$/);
            expect(msg.payload.files[1].name).to.match(/\.csv$/);
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });

    it("should filter return type to files only", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          returnType: "files",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([{ id: "dl-123", name: "my-datalink", resourceRef: "s3://bucket", credentials: [] }]),
        );

      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(
          200,
          createDataBrowserResponse([
            { name: "file1.txt", type: "FILE" },
            { name: "folder1", type: "FOLDER" },
            { name: "file2.csv", type: "FILE" },
          ]),
        );

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            // Should only return files, not folders
            expect(msg.payload.files).to.have.length(2);
            msg.payload.files.forEach((f) => {
              expect(f.type).to.equal("FILE");
            });
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });

    it("should filter return type to folders only", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          returnType: "folders",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([{ id: "dl-123", name: "my-datalink", resourceRef: "s3://bucket", credentials: [] }]),
        );

      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(
          200,
          createDataBrowserResponse([
            { name: "file1.txt", type: "FILE" },
            { name: "folder1", type: "FOLDER" },
            { name: "folder2", type: "FOLDER" },
          ]),
        );

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            // Should only return folders
            expect(msg.payload.files).to.have.length(2);
            msg.payload.files.forEach((f) => {
              expect(f.type).to.equal("FOLDER");
            });
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });
  });

  describe("message passthrough", function () {
    it("should preserve custom message properties", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          returnType: "all",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([{ id: "dl-123", name: "my-datalink", resourceRef: "s3://bucket", credentials: [] }]),
        );

      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(200, createDataBrowserResponse([]));

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg._context).to.equal("test-context");
            expect(msg.correlationId).to.equal("corr-789");
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({
          payload: {},
          _context: "test-context",
          correlationId: "corr-789",
        });
      });
    });
  });

  describe("error handling", function () {
    it("should report error when dataLinkName is not provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "",
          dataLinkNameType: "str",
          wires: [[]],
        },
      ];

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");

        datalinkNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("dataLinkName not provided");
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });

    it("should report error when datalink not found", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "nonexistent-datalink",
          dataLinkNameType: "str",
          wires: [[]],
        },
      ];

      nock(DEFAULT_BASE_URL).get("/data-links/").query(true).reply(200, { dataLinks: [] });

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");

        datalinkNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Could not find Data Link");
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });

    it("should report error when multiple datalinks match", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "ambiguous",
          dataLinkNameType: "str",
          wires: [[]],
        },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([
            { id: "dl-1", name: "ambiguous-1", resourceRef: "s3://a" },
            { id: "dl-2", name: "ambiguous-2", resourceRef: "s3://b" },
          ]),
        );

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");

        datalinkNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("more than one Data Link");
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });

    it("should handle API error during browse", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "datalink1",
          type: "seqera-datalink-list",
          name: "Test Datalink List",
          seqera: "config-node-1",
          dataLinkName: "my-datalink",
          dataLinkNameType: "str",
          wires: [[]],
        },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query(true)
        .reply(
          200,
          createDataLinksResponse([{ id: "dl-123", name: "my-datalink", resourceRef: "s3://bucket", credentials: [] }]),
        );

      nock(DEFAULT_BASE_URL)
        .get(/\/data-links\/dl-123\/browse/)
        .query(true)
        .reply(500, { error: "Server error" });

      helper.load([configNode, datalinkListNode], flow, createCredentials(), function () {
        const datalinkNode = helper.getNode("datalink1");

        datalinkNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Seqera datalink list failed");
            done();
          } catch (err) {
            done(err);
          }
        });

        datalinkNode.receive({ payload: {} });
      });
    });
  });
});

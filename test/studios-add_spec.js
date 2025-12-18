/**
 * Tests for nodes/studios-add.js (seqera-studios-add node)
 *
 * Tests the Seqera Studios creation functionality including:
 * - Creating Studios with name, container, compute env
 * - Resource configuration (CPU, memory, GPU)
 * - Mount data links resolution
 * - Optional parameters (description, checkpoint, etc.)
 */

const {
  helper,
  nock,
  DEFAULT_BASE_URL,
  DEFAULT_WORKSPACE_ID,
  createConfigNode,
  createCredentials,
  createStudioResponse,
  createDataLinksResponse,
} = require("./helper");
const { expect } = require("chai");

const studiosAddNode = require("../nodes/studios-add");
const configNode = require("../nodes/config");

describe("seqera-studios-add Node", function () {
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
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          wires: [[]],
        },
      ];

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("studio1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-studios-add");
          expect(n1.name).to.equal("Test Studio Add");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should store resource configuration", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          cpu: "4",
          cpuType: "num",
          memory: "16384",
          memoryType: "num",
          gpu: "1",
          gpuType: "num",
          wires: [[]],
        },
      ];

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("studio1");
        try {
          expect(n1.cpuProp).to.equal("4");
          expect(n1.memoryProp).to.equal("16384");
          expect(n1.gpuProp).to.equal("1");
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });

  describe("studio creation", function () {
    it("should create studio with required parameters", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          cpu: "2",
          cpuType: "num",
          memory: "8192",
          memoryType: "num",
          gpu: "0",
          gpuType: "num",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/studios", (body) => {
          return (
            body.name === "my-studio" &&
            body.dataStudioToolUrl === "jupyter/datascience-notebook" &&
            body.computeEnvId === "ce-123" &&
            body.configuration.cpu === 2 &&
            body.configuration.memory === 8192 &&
            body.configuration.gpu === 0
          );
        })
        .query(true)
        .reply(200, createStudioResponse({ sessionId: "studio-456" }));

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.studioId).to.equal("studio-456");
            done();
          } catch (err) {
            done(err);
          }
        });

        studioNode.receive({ payload: {} });
      });
    });

    it("should include description when provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          description: "A test studio for data analysis",
          descriptionType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/studios", (body) => {
          return body.description === "A test studio for data analysis";
        })
        .query(true)
        .reply(200, createStudioResponse({ sessionId: "studio-456" }));

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          done();
        });

        studioNode.receive({ payload: {} });
      });
    });

    it("should resolve and include mount data links", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          mountData: "datalink-1,datalink-2",
          mountDataType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock data link resolution for first datalink
      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query((q) => q.search === "datalink-1")
        .reply(200, createDataLinksResponse([{ id: "dl-id-1", name: "datalink-1", resourceRef: "s3://bucket1" }]));

      // Mock data link resolution for second datalink
      nock(DEFAULT_BASE_URL)
        .get("/data-links/")
        .query((q) => q.search === "datalink-2")
        .reply(200, createDataLinksResponse([{ id: "dl-id-2", name: "datalink-2", resourceRef: "s3://bucket2" }]));

      // Mock studio creation with mountData IDs
      nock(DEFAULT_BASE_URL)
        .post("/studios", (body) => {
          return (
            body.configuration.mountData &&
            body.configuration.mountData.includes("dl-id-1") &&
            body.configuration.mountData.includes("dl-id-2")
          );
        })
        .query(true)
        .reply(200, createStudioResponse({ sessionId: "studio-456" }));

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.studioId).to.equal("studio-456");
            done();
          } catch (err) {
            done(err);
          }
        });

        studioNode.receive({ payload: {} });
      });
    });

    it("should set isPrivate and spot flags", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          isPrivate: true,
          isPrivateType: "bool",
          spot: true,
          spotType: "bool",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/studios", (body) => {
          return body.isPrivate === true && body.spot === true;
        })
        .query(true)
        .reply(200, createStudioResponse({ sessionId: "studio-456" }));

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          done();
        });

        studioNode.receive({ payload: {} });
      });
    });

    it("should include autoStart query parameter", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          autoStart: false,
          autoStartType: "bool",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/studios")
        .query((q) => q.autoStart === "false")
        .reply(200, createStudioResponse({ sessionId: "studio-456" }));

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          done();
        });

        studioNode.receive({ payload: {} });
      });
    });
  });

  describe("message passthrough", function () {
    it("should preserve custom message properties", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .post("/studios")
        .query(true)
        .reply(200, createStudioResponse({ sessionId: "studio-456" }));

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg._context).to.equal("my-context");
            expect(msg.correlationId).to.equal("corr-studio");
            expect(msg.studioId).to.equal("studio-456");
            done();
          } catch (err) {
            done(err);
          }
        });

        studioNode.receive({
          payload: {},
          _context: "my-context",
          correlationId: "corr-studio",
        });
      });
    });
  });

  describe("error handling", function () {
    it("should report error when studioName is not provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          wires: [[]],
        },
      ];

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");

        studioNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("studioName not provided");
            done();
          } catch (err) {
            done(err);
          }
        });

        studioNode.receive({ payload: {} });
      });
    });

    it("should report error when containerUri is not provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          wires: [[]],
        },
      ];

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");

        studioNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("containerUri");
            done();
          } catch (err) {
            done(err);
          }
        });

        studioNode.receive({ payload: {} });
      });
    });

    it("should report error when computeEnvId is not provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "",
          computeEnvIdType: "str",
          wires: [[]],
        },
      ];

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");

        studioNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("computeEnvId not provided");
            done();
          } catch (err) {
            done(err);
          }
        });

        studioNode.receive({ payload: {} });
      });
    });

    it("should handle API error", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "studio1",
          type: "seqera-studios-add",
          name: "Test Studio Add",
          seqera: "config-node-1",
          studioName: "my-studio",
          studioNameType: "str",
          containerUri: "jupyter/datascience-notebook",
          containerUriType: "str",
          computeEnvId: "ce-123",
          computeEnvIdType: "str",
          wires: [[]],
        },
      ];

      nock(DEFAULT_BASE_URL).post("/studios").query(true).reply(500, { error: "Server error" });

      helper.load([configNode, studiosAddNode], flow, createCredentials(), function () {
        const studioNode = helper.getNode("studio1");

        studioNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Seqera Studios create failed");
            done();
          } catch (err) {
            done(err);
          }
        });

        studioNode.receive({ payload: {} });
      });
    });
  });
});

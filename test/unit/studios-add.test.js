/**
 * Tests for nodes/studios-add.js
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

describe("seqera-studios-add node", () => {
  let RED;
  let api;

  beforeEach(() => {
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the studios-add node module
    require("../../nodes/studios-add")(RED);
  });

  function createNode(configOverrides = {}) {
    const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-studios-add").constructor;
    const node = {};

    const config = {
      id: "test-node-id",
      name: "test-studio",
      seqera: "seqera-config-id",
      studioName: "my-studio",
      studioNameType: "str",
      description: "",
      descriptionType: "str",
      containerUri: "cr.seqera.io/studio:latest",
      containerUriType: "str",
      computeEnvId: "ce-123",
      computeEnvIdType: "str",
      mountData: "",
      mountDataType: "str",
      cpu: "2",
      cpuType: "num",
      memory: "8192",
      memoryType: "num",
      gpu: "0",
      gpuType: "num",
      initialCheckpointId: "",
      initialCheckpointIdType: "num",
      condaEnvironment: "",
      condaEnvironmentType: "str",
      lifespanHours: "",
      lifespanHoursType: "num",
      isPrivate: "false",
      isPrivateType: "bool",
      spot: "false",
      spotType: "bool",
      autoStart: "true",
      autoStartType: "bool",
      workspaceId: "",
      workspaceIdType: "str",
      baseUrl: "",
      baseUrlType: "str",
      ...configOverrides,
    };

    NodeConstructor.call(node, config);
    return node;
  }

  describe("node registration", () => {
    it("should register seqera-studios-add type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-studios-add",
        expect.any(Function),
        expect.any(Object),
      );
    });
  });

  describe("basic creation", () => {
    it("should create studio via POST /studios", async () => {
      const node = createNode();
      api.mockStudiosCreate({ sessionId: "studio-123" });

      const msg = createMockMsg({});
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalled();
      expect(send.mock.calls[0][0].studioId).toBe("studio-123");
    });

    it("should set blue ring status during creation", async () => {
      const node = createNode();
      api.mockStudiosCreate({ sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );
    });

    it("should set green dot status on success", async () => {
      const node = createNode();
      api.mockStudiosCreate({ sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expectSuccessStatus(node);
    });

    it("should return studioId in output message", async () => {
      const node = createNode();
      api.mockStudiosCreate({ studio: { sessionId: "studio-new-123" } });

      const msg = createMockMsg({});
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send.mock.calls[0][0].studioId).toBe("studio-new-123");
    });
  });

  describe("configuration object", () => {
    it("should set cpu, memory, gpu in configuration", async () => {
      const node = createNode({
        cpu: "4",
        cpuType: "num",
        memory: "16384",
        memoryType: "num",
        gpu: "1",
        gpuType: "num",
      });

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.configuration.cpu === 4 && body.configuration.memory === 16384 && body.configuration.gpu === 1;
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should use default values if not provided (cpu=2, memory=8192, gpu=0)", async () => {
      const node = createNode({
        cpu: "",
        cpuType: "str",
        memory: "",
        memoryType: "str",
        gpu: "",
        gpuType: "str",
      });

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.configuration.cpu === 2 && body.configuration.memory === 8192 && body.configuration.gpu === 0;
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should include condaEnvironment if provided", async () => {
      const node = createNode({
        condaEnvironment: "environment.yml",
        condaEnvironmentType: "str",
      });

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.configuration.condaEnvironment === "environment.yml";
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should include lifespanHours if provided", async () => {
      const node = createNode({
        lifespanHours: "24",
        lifespanHoursType: "num",
      });

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.configuration.lifespanHours === 24;
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("mount data links", () => {
    it("should resolve data link names to IDs", async () => {
      const node = createNode({
        mountData: "my-data-link",
        mountDataType: "str",
      });

      // Mock data link resolution
      api.mockDataLinksSearch([{ id: "dl-resolved-123", name: "my-data-link" }]);

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.configuration.mountData.includes("dl-resolved-123");
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should handle array input for mountData", async () => {
      const node = createNode({
        mountData: "link1,link2",
        mountDataType: "str",
      });

      // Mock data link resolutions
      nock(BASE_URL)
        .get("/data-links/")
        .query((q) => q.search === "link1")
        .reply(200, { dataLinks: [{ id: "dl-1", name: "link1" }] });

      nock(BASE_URL)
        .get("/data-links/")
        .query((q) => q.search === "link2")
        .reply(200, { dataLinks: [{ id: "dl-2", name: "link2" }] });

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.configuration.mountData.length === 2;
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should handle newline-separated string input for mountData", async () => {
      const node = createNode({
        mountData: "link1\nlink2",
        mountDataType: "str",
      });

      nock(BASE_URL)
        .get("/data-links/")
        .query((q) => q.search === "link1")
        .reply(200, { dataLinks: [{ id: "dl-1", name: "link1" }] });

      nock(BASE_URL)
        .get("/data-links/")
        .query((q) => q.search === "link2")
        .reply(200, { dataLinks: [{ id: "dl-2", name: "link2" }] });

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.configuration.mountData.length === 2;
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("query parameters", () => {
    it("should include workspaceId in query string", async () => {
      const node = createNode();

      const scope = nock(BASE_URL)
        .post("/studios")
        .query((q) => q.workspaceId === "ws-123")
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should include autoStart=true in query string", async () => {
      const node = createNode({ autoStart: true, autoStartType: "bool" });

      const scope = nock(BASE_URL)
        .post("/studios")
        .query((q) => q.autoStart === "true")
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should include autoStart=false in query string", async () => {
      const node = createNode({ autoStart: false, autoStartType: "bool" });

      const scope = nock(BASE_URL)
        .post("/studios")
        .query((q) => q.autoStart === "false")
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("required fields", () => {
    it("should error if studioName not provided", async () => {
      const node = createNode({ studioName: "", studioNameType: "str" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("studioName not provided"), expect.anything());
    });

    it("should error if containerUri not provided", async () => {
      const node = createNode({ containerUri: "", containerUriType: "str" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(
        expect.stringContaining("containerUri (dataStudioToolUrl) not provided"),
        expect.anything(),
      );
    });

    it("should error if computeEnvId not provided", async () => {
      const node = createNode({ computeEnvId: "", computeEnvIdType: "str" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("computeEnvId not provided"), expect.anything());
    });
  });

  describe("error handling", () => {
    it("should set red ring status on error", async () => {
      const node = createNode();
      api.mockError("post", "/studios", 500, "Server Error");

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "red",
          shape: "ring",
        }),
      );
    });

    it("should call node.error with message on failure", async () => {
      const node = createNode();
      api.mockError("post", "/studios", 400, "Bad Request");

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("Studios create failed"), expect.anything());
    });
  });

  describe("message passthrough", () => {
    it("should preserve input message properties in output", async () => {
      const node = createNode();
      api.mockStudiosCreate({ sessionId: "studio-123" });

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

  describe("optional fields", () => {
    it("should include description if provided", async () => {
      const node = createNode({
        description: "My studio description",
        descriptionType: "str",
      });

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.description === "My studio description";
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should set isPrivate and spot flags", async () => {
      const node = createNode({
        isPrivate: true,
        isPrivateType: "bool",
        spot: true,
        spotType: "bool",
      });

      const scope = nock(BASE_URL)
        .post("/studios", (body) => {
          return body.isPrivate === true && body.spot === true;
        })
        .query(true)
        .reply(200, { sessionId: "studio-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });
  });
});

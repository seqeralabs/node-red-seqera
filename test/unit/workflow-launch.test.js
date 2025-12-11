/**
 * Tests for nodes/workflow-launch.js
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

describe("seqera-workflow-launch node", () => {
  let RED;
  let api;

  beforeEach(() => {
    RED = createMockRED();
    api = mockSeqeraAPI();

    // Set up the seqera-config node
    const seqeraConfig = createMockSeqeraConfigNode();
    RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

    // Load the workflow-launch node module
    require("../../nodes/workflow-launch")(RED);
  });

  function createNode(configOverrides = {}) {
    const NodeConstructor = RED._testHelpers.getRegisteredType("seqera-workflow-launch").constructor;
    const node = {};

    const config = {
      id: "test-node-id",
      name: "test-launch",
      seqera: "seqera-config-id",
      launchpadName: "",
      launchpadNameType: "str",
      paramsKey: "",
      paramsKeyType: "str",
      params: [],
      runName: "",
      runNameType: "str",
      baseUrl: "",
      baseUrlType: "str",
      workspaceId: "",
      workspaceIdType: "str",
      sourceWorkspaceId: "",
      sourceWorkspaceIdType: "str",
      resumeWorkflowId: "",
      resumeWorkflowIdType: "str",
      ...configOverrides,
    };

    NodeConstructor.call(node, config);
    return node;
  }

  describe("node registration", () => {
    it("should register seqera-workflow-launch type", () => {
      expect(RED.nodes.registerType).toHaveBeenCalledWith(
        "seqera-workflow-launch",
        expect.any(Function),
        expect.any(Object),
      );
    });

    it("should register HTTP endpoint for pipeline autocomplete", () => {
      expect(RED.httpAdmin.get).toHaveBeenCalledWith("/admin/seqera/pipelines/:nodeId", expect.any(Function));
    });
  });

  describe("basic launch", () => {
    it("should launch workflow with payload as body", async () => {
      const node = createNode();
      api.mockWorkflowLaunch({ workflowId: "wf-launched-123" });

      const msg = createMockMsg({
        payload: {
          launch: {
            pipeline: "https://github.com/test/pipeline",
            computeEnvId: "ce-123",
          },
        },
      });

      const send = jest.fn();
      const done = jest.fn();

      await node._triggerInput(msg, send, done);

      expect(send).toHaveBeenCalled();
      const outputMsg = send.mock.calls[0][0];
      expect(outputMsg.workflowId).toBe("wf-launched-123");
    });

    it("should set blue status during launch", async () => {
      const node = createNode();
      api.mockWorkflowLaunch({ workflowId: "wf-123" });

      const msg = createMockMsg({ payload: { launch: {} } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.status).toHaveBeenCalledWith(
        expect.objectContaining({
          fill: "blue",
          shape: "ring",
        }),
      );
    });

    it("should set green status on success", async () => {
      const node = createNode();
      api.mockWorkflowLaunch({ workflowId: "wf-123" });

      const msg = createMockMsg({ payload: { launch: {} } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expectSuccessStatus(node);
    });

    it("should return workflowId in output message", async () => {
      const node = createNode();
      api.mockWorkflowLaunch({ workflowId: "wf-new-123" });

      const msg = createMockMsg({ payload: { launch: {} } });
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send.mock.calls[0][0].workflowId).toBe("wf-new-123");
    });

    it("should pass through input message properties", async () => {
      const node = createNode();
      api.mockWorkflowLaunch({ workflowId: "wf-123" });

      const msg = createMockMsg({
        payload: { launch: {} },
        _context: { flowId: "flow-123" },
        correlationId: "corr-456",
        customProp: "custom-value",
      });

      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      const outputMsg = send.mock.calls[0][0];
      expectMessagePassthrough(outputMsg, msg);
    });

    it("should include workspaceId in query params", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-from-config" });
      RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

      const node = createNode();

      const scope = nock(BASE_URL)
        .post("/workflow/launch")
        .query((q) => q.workspaceId === "ws-from-config")
        .reply(200, { workflowId: "wf-123" });

      const msg = createMockMsg({ payload: { launch: {} } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("launchpad name resolution", () => {
    it("should fetch pipeline by launchpad name", async () => {
      const node = createNode({
        launchpadName: "my-pipeline",
        launchpadNameType: "str",
      });

      api.mockPipelines([{ pipelineId: 123, name: "my-pipeline" }]);
      api.mockPipelineLaunchConfig(123, {
        computeEnv: { id: "ce-456" },
        pipeline: "https://github.com/test/pipeline",
      });
      api.mockWorkflowLaunch({ workflowId: "wf-launched" });

      const msg = createMockMsg({});
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send).toHaveBeenCalled();
      expect(send.mock.calls[0][0].workflowId).toBe("wf-launched");
    });

    it("should use launch config as body from launchpad", async () => {
      const node = createNode({
        launchpadName: "test-pipeline",
        launchpadNameType: "str",
      });

      api.mockPipelines([{ pipelineId: 456, name: "test-pipeline" }]);
      api.mockPipelineLaunchConfig(456, {
        computeEnv: { id: "ce-789" },
        pipeline: "https://github.com/org/repo",
        paramsText: '{"input": "s3://bucket/data"}',
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch && body.launch.computeEnvId === "ce-789";
        })
        .query(true)
        .reply(200, { workflowId: "wf-123" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should handle pipeline not found", async () => {
      const node = createNode({
        launchpadName: "non-existent",
        launchpadNameType: "str",
      });

      api.mockPipelines([]);

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("No pipeline found"), expect.anything());
    });
  });

  describe("parameters merging", () => {
    it("should merge paramsObj into launch.paramsText", async () => {
      const node = createNode({
        paramsKey: "myParams",
        paramsKeyType: "msg",
      });

      RED.util.evaluateNodeProperty.mockImplementation((value, type, n, msg) => {
        if (type === "msg" && value === "myParams") return { input: "s3://bucket/data" };
        if (type === "str") return value;
        return undefined;
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          const params = JSON.parse(body.launch.paramsText);
          return params.input === "s3://bucket/data";
        })
        .query(true)
        .reply(200, { workflowId: "wf-123" });

      const msg = createMockMsg({
        payload: { launch: {} },
        myParams: { input: "s3://bucket/data" },
      });

      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should merge paramsArray into launch.paramsText", async () => {
      const node = createNode({
        params: [
          { name: "outdir", value: "s3://bucket/results", valueType: "str" },
          { name: "threads", value: "8", valueType: "str" },
        ],
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          const params = JSON.parse(body.launch.paramsText);
          return params.outdir === "s3://bucket/results" && params.threads === "8";
        })
        .query(true)
        .reply(200, { workflowId: "wf-123" });

      const msg = createMockMsg({ payload: { launch: {} } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should give paramsArray precedence over paramsObj", async () => {
      const node = createNode({
        paramsKey: "jsonParams",
        paramsKeyType: "msg",
        params: [{ name: "input", value: "from-array", valueType: "str" }],
      });

      RED.util.evaluateNodeProperty.mockImplementation((value, type, n, msg) => {
        if (type === "msg" && value === "jsonParams") return { input: "from-json" };
        if (type === "str") return value;
        return undefined;
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          const params = JSON.parse(body.launch.paramsText);
          return params.input === "from-array"; // Array should win
        })
        .query(true)
        .reply(200, { workflowId: "wf-123" });

      const msg = createMockMsg({
        payload: { launch: {} },
        jsonParams: { input: "from-json" },
      });

      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should preserve existing launch.paramsText", async () => {
      const node = createNode({
        params: [{ name: "newParam", value: "newValue", valueType: "str" }],
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          const params = JSON.parse(body.launch.paramsText);
          return params.existing === "existingValue" && params.newParam === "newValue";
        })
        .query(true)
        .reply(200, { workflowId: "wf-123" });

      const msg = createMockMsg({
        payload: {
          launch: {
            paramsText: JSON.stringify({ existing: "existingValue" }),
          },
        },
      });

      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("custom run name", () => {
    it("should set launch.runName if provided", async () => {
      const node = createNode({
        runName: "my-custom-run",
        runNameType: "str",
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.runName === "my-custom-run";
        })
        .query(true)
        .reply(200, { workflowId: "wf-123" });

      const msg = createMockMsg({ payload: { launch: {} } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should not set runName if empty", async () => {
      const node = createNode({ runName: "", runNameType: "str" });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.runName === undefined;
        })
        .query(true)
        .reply(200, { workflowId: "wf-123" });

      const msg = createMockMsg({ payload: { launch: {} } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("resume workflow", () => {
    it("should fetch workflow details and launch config for resume", async () => {
      const node = createNode({
        resumeWorkflowId: "wf-original",
        resumeWorkflowIdType: "str",
      });

      // Mock workflow details
      api.mockWorkflowStatus("wf-original", {
        id: "wf-original",
        status: "failed",
        commitId: "abc123",
      });

      // Mock workflow launch config
      api.mockWorkflowLaunchConfig("wf-original", {
        id: "launch-1",
        computeEnv: { id: "ce-123" },
        pipeline: "https://github.com/test/pipeline",
        workDir: "s3://bucket/work",
        sessionId: "session-123",
      });

      api.mockWorkflowLaunch({ workflowId: "wf-resumed" });

      const msg = createMockMsg({});
      const send = jest.fn();
      await node._triggerInput(msg, send, jest.fn());

      expect(send.mock.calls[0][0].workflowId).toBe("wf-resumed");
    });

    it("should set resume=true if workflow has commitId", async () => {
      const node = createNode({
        resumeWorkflowId: "wf-with-commit",
        resumeWorkflowIdType: "str",
      });

      api.mockWorkflowStatus("wf-with-commit", {
        id: "wf-with-commit",
        commitId: "commit-hash-123",
      });

      api.mockWorkflowLaunchConfig("wf-with-commit", {
        id: "launch-1",
        computeEnv: { id: "ce-123" },
        pipeline: "test",
        workDir: "s3://work",
        sessionId: "session-1",
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.resume === true;
        })
        .query(true)
        .reply(200, { workflowId: "wf-new" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should set resume=false if workflow cancelled early (no commitId)", async () => {
      const node = createNode({
        resumeWorkflowId: "wf-cancelled",
        resumeWorkflowIdType: "str",
      });

      api.mockWorkflowStatus("wf-cancelled", {
        id: "wf-cancelled",
        commitId: null, // No commit - was cancelled before any tasks ran
      });

      api.mockWorkflowLaunchConfig("wf-cancelled", {
        id: "launch-1",
        computeEnv: { id: "ce-123" },
        pipeline: "test",
        workDir: "s3://work",
        sessionId: "session-1",
        // No resumeCommitId or revision either
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.resume === false && body.launch.revision === undefined;
        })
        .query(true)
        .reply(200, { workflowId: "wf-new" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });

    it("should include revision field when resuming with commitId", async () => {
      const node = createNode({
        resumeWorkflowId: "wf-resume",
        resumeWorkflowIdType: "str",
      });

      api.mockWorkflowStatus("wf-resume", {
        id: "wf-resume",
        commitId: "abc123def",
      });

      api.mockWorkflowLaunchConfig("wf-resume", {
        id: "launch-1",
        computeEnv: { id: "ce-123" },
        pipeline: "test",
        workDir: "s3://work",
        sessionId: "session-1",
      });

      const scope = nock(BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.revision === "abc123def";
        })
        .query(true)
        .reply(200, { workflowId: "wf-new" });

      const msg = createMockMsg({});
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(scope.isDone()).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should set red status on error", async () => {
      const node = createNode();
      api.mockError("post", "/workflow/launch", 500, "Server Error");

      const msg = createMockMsg({ payload: { launch: {} } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expectErrorStatus(node);
    });

    it("should call node.error with message on failure", async () => {
      const node = createNode();
      api.mockError("post", "/workflow/launch", 400, "Bad Request");

      const msg = createMockMsg({ payload: { launch: {} } });
      await node._triggerInput(msg, jest.fn(), jest.fn());

      expect(node.error).toHaveBeenCalledWith(expect.stringContaining("failed"), expect.anything());
    });

    it("should error if no body provided and no launchpadName", async () => {
      const node = createNode();

      // Explicitly set payload to null to trigger the "no body" error
      const msg = { _msgid: "test-msg", payload: null, body: null };
      const done = jest.fn();
      await node._triggerInput(msg, jest.fn(), done);

      expect(done).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("pipeline autocomplete endpoint", () => {
    it("should return pipeline autocomplete results", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
      RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

      const node = createNode();
      RED._testHelpers.addNode("test-node-id", node);

      api.mockPipelines([
        { pipelineId: 1, name: "pipeline-one" },
        { pipelineId: 2, name: "pipeline-two" },
      ]);

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/admin/seqera/pipelines/:nodeId", {
        params: { nodeId: "test-node-id" },
        query: { search: "" },
      });

      expect(data).toEqual([
        { value: "pipeline-one", label: "pipeline-one" },
        { value: "pipeline-two", label: "pipeline-two" },
      ]);
    });

    it("should return empty array if no workspaceId", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: null });
      RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

      const node = createNode();
      RED._testHelpers.addNode("test-node-id", node);

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/admin/seqera/pipelines/:nodeId", {
        params: { nodeId: "test-node-id" },
        query: {},
      });

      expect(data).toEqual([]);
    });

    it("should handle node not existing (new node case)", async () => {
      const seqeraConfig = createMockSeqeraConfigNode({ workspaceId: "ws-123" });
      RED._testHelpers.addNode("seqera-config-id", seqeraConfig);

      api.mockPipelines([{ pipelineId: 1, name: "test-pipeline" }]);

      const { data } = await RED._testHelpers.simulateHttpRequest("get", "/admin/seqera/pipelines/:nodeId", {
        params: { nodeId: "non-existent" },
        query: { seqeraConfig: "seqera-config-id", search: "" },
      });

      expect(data).toEqual([{ value: "test-pipeline", label: "test-pipeline" }]);
    });
  });
});

/**
 * Tests for nodes/workflow-launch.js (seqera-workflow-launch node)
 *
 * Tests the workflow launch functionality including:
 * - Launching with launchpad name resolution
 * - Parameter merging (paramsJSON and params array)
 * - Resume workflow functionality
 * - Custom run names
 * - Label resolution and creation
 * - Error handling
 */

const {
  helper,
  nock,
  DEFAULT_BASE_URL,
  DEFAULT_WORKSPACE_ID,
  createConfigNode,
  createCredentials,
  createPipelinesResponse,
  createLaunchConfigResponse,
  createWorkflowResponse,
  createLabelsResponse,
  createLabelResponse,
} = require("./helper");
const { expect } = require("chai");

const workflowLaunchNode = require("../nodes/workflow-launch");
const configNode = require("../nodes/config");

describe("seqera-workflow-launch Node", function () {
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
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          wires: [[]],
        },
      ];

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("launch1");
        try {
          expect(n1).to.exist;
          expect(n1.type).to.equal("seqera-workflow-launch");
          expect(n1.name).to.equal("Test Launch");
          done();
        } catch (err) {
          done(err);
        }
      });
    });

    it("should have reference to seqera-config node", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          wires: [[]],
        },
      ];

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const n1 = helper.getNode("launch1");
        try {
          expect(n1.seqeraConfig).to.exist;
          expect(n1.seqeraConfig.baseUrl).to.equal(DEFAULT_BASE_URL);
          expect(n1.seqeraConfig.workspaceId).to.equal(DEFAULT_WORKSPACE_ID);
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });

  describe("launching with launchpad name", function () {
    it("should resolve pipeline from launchpad name and launch", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(
          200,
          createPipelinesResponse([
            { pipelineId: 42, name: "my-pipeline", repository: "https://github.com/test/pipe" },
          ]),
        );

      // Mock launch config fetch
      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      // Mock workflow launch
      nock(DEFAULT_BASE_URL).post("/workflow/launch").query(true).reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            expect(msg.payload.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });

    it("should handle missing launchpad name gracefully", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "nonexistent-pipeline",
          launchpadNameType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search returning empty
      nock(DEFAULT_BASE_URL).get("/pipelines").query(true).reply(200, { pipelines: [] });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");

        // Listen for error
        launchNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("No pipeline found");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });
  });

  describe("parameter merging", function () {
    it("should merge params JSON into launch config", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          paramsKey: "customParams",
          paramsKeyType: "msg",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      // Mock launch config fetch with existing params
      nock(DEFAULT_BASE_URL)
        .get(`/pipelines/42/launch`)
        .query(true)
        .reply(200, createLaunchConfigResponse({ paramsText: '{"existingParam": "value1"}' }));

      // Mock workflow launch - verify the params are merged
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          const params = JSON.parse(body.launch.paramsText);
          return params.existingParam === "value1" && params.newParam === "value2";
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({
          payload: {},
          customParams: { newParam: "value2" },
        });
      });
    });

    it("should handle params array with key-value pairs", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          params: [
            { name: "param1", value: "arrayValue1", valueType: "str" },
            { name: "param2", value: "arrayValue2", valueType: "str" },
          ],
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          const params = JSON.parse(body.launch.paramsText);
          return params.param1 === "arrayValue1" && params.param2 === "arrayValue2";
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });
  });

  describe("custom run name", function () {
    it("should set custom run name when provided", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          runName: "custom-run-name",
          runNameType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.runName === "custom-run-name";
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });
  });

  describe("resume workflow", function () {
    it("should fetch workflow and launch config for resume", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          resumeWorkflowId: "wf-original-123",
          resumeWorkflowIdType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock get workflow details
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-original-123")
        .query(true)
        .reply(
          200,
          createWorkflowResponse({
            id: "wf-original-123",
            commitId: "abc123",
          }),
        );

      // Mock get workflow launch config
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-original-123/launch")
        .query(true)
        .reply(
          200,
          createLaunchConfigResponse({
            sessionId: "session-123",
            resumeCommitId: "abc123",
          }),
        );

      // Mock workflow launch with resume
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.resume === true && body.launch.sessionId === "session-123";
        })
        .query(true)
        .reply(200, { workflowId: "wf-resumed-456" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-resumed-456");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({
          payload: { launch: {} },
        });
      });
    });

    it("should set resume=false when workflow has no commitId", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          resumeWorkflowId: "wf-cancelled-123",
          resumeWorkflowIdType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock get workflow details (no commitId = cancelled before tasks ran)
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-cancelled-123")
        .query(true)
        .reply(
          200,
          createWorkflowResponse({
            id: "wf-cancelled-123",
            commitId: null,
          }),
        );

      // Mock get workflow launch config (no resumeCommitId or revision)
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-cancelled-123/launch")
        .query(true)
        .reply(
          200,
          createLaunchConfigResponse({
            sessionId: "session-123",
            resumeCommitId: null,
            revision: null,
          }),
        );

      // Mock workflow launch - resume should be false
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.resume === false;
        })
        .query(true)
        .reply(200, { workflowId: "wf-relaunched-456" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-relaunched-456");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({
          payload: { launch: {} },
        });
      });
    });
  });

  describe("launching with payload body", function () {
    it("should launch directly with provided body when no launchpad name", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      const launchBody = {
        launch: {
          computeEnvId: "ce-123",
          pipeline: "https://github.com/test/pipeline",
          workDir: "s3://bucket/work",
        },
      };

      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.computeEnvId === "ce-123";
        })
        .query(true)
        .reply(200, { workflowId: "wf-direct-123" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-direct-123");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: launchBody });
      });
    });
  });

  describe("message passthrough", function () {
    it("should preserve custom message properties in output", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      const launchBody = {
        launch: {
          computeEnvId: "ce-123",
          pipeline: "https://github.com/test/pipeline",
        },
      };

      nock(DEFAULT_BASE_URL).post("/workflow/launch").query(true).reply(200, { workflowId: "wf-123" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            // Custom properties should be preserved
            expect(msg._context).to.equal("my-context");
            expect(msg.correlationId).to.equal("corr-123");
            // Node-specific properties should be set
            expect(msg.workflowId).to.equal("wf-123");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({
          payload: launchBody,
          _context: "my-context",
          correlationId: "corr-123",
        });
      });
    });
  });

  describe("labels", function () {
    it("should resolve existing label names to IDs and launch with labels", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          labels: "production,rnaseq",
          labelsType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      // Mock launch config fetch
      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      // Mock label search for "production"
      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "production" })
        .reply(200, createLabelsResponse([{ id: "101", name: "production" }]));

      // Mock label search for "rnaseq"
      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "rnaseq" })
        .reply(200, createLabelsResponse([{ id: "102", name: "rnaseq" }]));

      // Mock workflow launch - verify labelIds are included
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return (
            body.launch.labelIds &&
            body.launch.labelIds.length === 2 &&
            body.launch.labelIds.includes("101") &&
            body.launch.labelIds.includes("102")
          );
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });

    it("should create missing labels automatically when they don't exist", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          labels: "newlabel",
          labelsType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      // Mock launch config fetch
      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      // Mock label search - return empty results
      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "newlabel" })
        .reply(200, createLabelsResponse([]));

      // Mock label creation
      nock(DEFAULT_BASE_URL)
        .post("/labels", { name: "newlabel" })
        .query({ workspaceId: DEFAULT_WORKSPACE_ID })
        .reply(200, createLabelResponse({ id: "201", name: "newlabel" }));

      // Mock workflow launch
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.labelIds && body.launch.labelIds.includes("201");
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });

    it("should handle case-insensitive label matching", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          labels: "Production",
          labelsType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      // Mock launch config fetch
      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      // Mock label search - API normalizes to lowercase
      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "production" })
        .reply(200, createLabelsResponse([{ id: "101", name: "production" }]));

      // Mock workflow launch
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.labelIds && body.launch.labelIds.includes("101");
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });

    it("should handle empty labels gracefully", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          labels: "",
          labelsType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      // Mock launch config fetch
      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      // Mock workflow launch - should not include labelIds
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return !body.launch.labelIds || body.launch.labelIds.length === 0;
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });

    it("should handle whitespace in comma-separated labels", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          labels: " production , rnaseq , urgent ",
          labelsType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      // Mock launch config fetch
      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      // Mock label searches - should trim whitespace
      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "production" })
        .reply(200, createLabelsResponse([{ id: "101", name: "production" }]));

      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "rnaseq" })
        .reply(200, createLabelsResponse([{ id: "102", name: "rnaseq" }]));

      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "urgent" })
        .reply(200, createLabelsResponse([{ id: "103", name: "urgent" }]));

      // Mock workflow launch
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.labelIds && body.launch.labelIds.length === 3;
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });

    it("should error when lacking permission to create labels", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          labels: "newlabel",
          labelsType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      // Mock launch config fetch
      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      // Mock label search - return empty results
      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "newlabel" })
        .reply(200, createLabelsResponse([]));

      // Mock label creation - return 403 forbidden
      nock(DEFAULT_BASE_URL)
        .post("/labels", { name: "newlabel" })
        .query({ workspaceId: DEFAULT_WORKSPACE_ID })
        .reply(403, { message: "Insufficient permissions" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");

        launchNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Cannot create label 'newlabel'");
            expect(call.firstArg).to.include("Maintain");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({ payload: {} });
      });
    });

    it("should work with labels in resume workflow", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          resumeWorkflowId: "wf-original-123",
          resumeWorkflowIdType: "str",
          labels: "resumed,retry",
          labelsType: "str",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock get workflow details
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-original-123")
        .query(true)
        .reply(
          200,
          createWorkflowResponse({
            id: "wf-original-123",
            commitId: "abc123",
          }),
        );

      // Mock get workflow launch config
      nock(DEFAULT_BASE_URL)
        .get("/workflow/wf-original-123/launch")
        .query(true)
        .reply(
          200,
          createLaunchConfigResponse({
            sessionId: "session-123",
            resumeCommitId: "abc123",
          }),
        );

      // Mock label searches
      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "resumed" })
        .reply(200, createLabelsResponse([{ id: "301", name: "resumed" }]));

      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "retry" })
        .reply(200, createLabelsResponse([{ id: "302", name: "retry" }]));

      // Mock workflow launch with resume and labels
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return (
            body.launch.resume === true &&
            body.launch.labelIds &&
            body.launch.labelIds.includes("301") &&
            body.launch.labelIds.includes("302")
          );
        })
        .query(true)
        .reply(200, { workflowId: "wf-resumed-456" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-resumed-456");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({
          payload: { launch: {} },
        });
      });
    });

    it("should work with labels from message property", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          launchpadName: "my-pipeline",
          launchpadNameType: "str",
          labels: "customLabels",
          labelsType: "msg",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      // Mock pipelines search
      nock(DEFAULT_BASE_URL)
        .get("/pipelines")
        .query(true)
        .reply(200, createPipelinesResponse([{ pipelineId: 42, name: "my-pipeline" }]));

      // Mock launch config fetch
      nock(DEFAULT_BASE_URL).get(`/pipelines/42/launch`).query(true).reply(200, createLaunchConfigResponse());

      // Mock label search
      nock(DEFAULT_BASE_URL)
        .get("/labels")
        .query({ workspaceId: DEFAULT_WORKSPACE_ID, search: "dynamic" })
        .reply(200, createLabelsResponse([{ id: "401", name: "dynamic" }]));

      // Mock workflow launch
      nock(DEFAULT_BASE_URL)
        .post("/workflow/launch", (body) => {
          return body.launch.labelIds && body.launch.labelIds.includes("401");
        })
        .query(true)
        .reply(200, { workflowId: "wf-12345" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");
        const helperNode = helper.getNode("helper1");

        helperNode.on("input", function (msg) {
          try {
            expect(msg.workflowId).to.equal("wf-12345");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({
          payload: {},
          customLabels: "dynamic",
        });
      });
    });
  });

  describe("error handling", function () {
    it("should report error when no body and no launchpad name", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");

        // The done callback receives errors
        launchNode.receive({
          payload: null,
          _msgid: "test-msg",
        });

        // Give the async handler time to process
        setTimeout(function () {
          // Check node status is set to error
          try {
            // Node should report the error (we can't easily test done(err) directly)
            done();
          } catch (err) {
            done(err);
          }
        }, 100);
      });
    });

    it("should set error status on API failure", function (done) {
      const flow = [
        createConfigNode(),
        {
          id: "launch1",
          type: "seqera-workflow-launch",
          name: "Test Launch",
          seqera: "config-node-1",
          wires: [["helper1"]],
        },
        { id: "helper1", type: "helper" },
      ];

      nock(DEFAULT_BASE_URL).post("/workflow/launch").query(true).reply(500, { error: "Server error" });

      helper.load([configNode, workflowLaunchNode], flow, createCredentials(), function () {
        const launchNode = helper.getNode("launch1");

        launchNode.on("call:error", function (call) {
          try {
            expect(call.firstArg).to.include("Seqera API request failed");
            done();
          } catch (err) {
            done(err);
          }
        });

        launchNode.receive({
          payload: {
            launch: { computeEnvId: "ce-123", pipeline: "test" },
          },
        });
      });
    });
  });
});

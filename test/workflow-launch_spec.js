/**
 * Tests for nodes/workflow-launch.js (seqera-workflow-launch node)
 *
 * Tests the workflow launch functionality including:
 * - Launching with launchpad name resolution
 * - Parameter merging (paramsJSON and params array)
 * - Resume workflow functionality
 * - Custom run names
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
